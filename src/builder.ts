import { getSandbox } from '@cloudflare/sandbox';
import type { Env, BuildMetadata, ChangelogEntry } from './types';

const BUILD_TIMEOUT = 600_000; // 10 minutes — should be fast with incremental builds
const REPO_DIR = '/workspace/crosspoint-reader';

export async function triggerBuild(env: Env, commit: string, commitMessage: string): Promise<void> {
  const meta: BuildMetadata = {
    status: 'building',
    commit,
    commitShort: commit.substring(0, 7),
    commitMessage,
    buildDate: new Date().toISOString(),
    buildTimestamp: Date.now(),
    version: '',
    changelog: [],
  };
  await env.BUILD_META.put('latest-build', JSON.stringify(meta));

  try {
    // Reuse the same sandbox — the Docker image has the repo pre-cloned
    // and a full build already done, so we just git pull + incremental compile
    const sandbox = getSandbox(env.SANDBOX, 'firmware-builder', {
      sleepAfter: '30m',
      keepAlive: true,
    });

    // Pull latest changes (repo is pre-cloned in the Docker image)
    console.log(`Pulling latest from ${env.REPO_BRANCH}...`);
    const pullResult = await sandbox.exec(
      `git fetch origin ${env.REPO_BRANCH} && git reset --hard origin/${env.REPO_BRANCH} && git submodule update --init --recursive`,
      { cwd: REPO_DIR, timeout: 120_000 }
    );
    if (!pullResult.success) {
      throw new Error(`Git pull failed: ${pullResult.stderr}`);
    }

    // Get changelog — commits since last tag (use --unshallow if needed)
    await sandbox.exec('git fetch --unshallow 2>/dev/null || true', { cwd: REPO_DIR, timeout: 60_000 });
    await sandbox.exec('git fetch --tags', { cwd: REPO_DIR, timeout: 30_000 });
    const changelogResult = await sandbox.exec(
      'git log $(git describe --tags --abbrev=0 2>/dev/null || git rev-list --max-parents=0 HEAD)..HEAD --pretty=format:"%H|%h|%an|%aI|%s"',
      { cwd: REPO_DIR, timeout: 10_000 }
    );
    meta.changelog = parseChangelog(changelogResult.stdout);

    // Read version from platformio.ini
    const versionResult = await sandbox.exec(
      'grep -oP "version\\s*=\\s*\\K.*" platformio.ini | head -1',
      { cwd: REPO_DIR, timeout: 5_000 }
    );
    const baseVersion = versionResult.stdout.trim() || 'unknown';
    meta.version = `${baseVersion}-dev+${commit.substring(0, 7)}`;

    // Build firmware (incremental — only recompiles changed files)
    console.log(`Building firmware (env: ${env.BUILD_ENV})...`);
    const buildResult = await sandbox.exec(
      `pio run -e ${env.BUILD_ENV}`,
      {
        cwd: REPO_DIR,
        timeout: BUILD_TIMEOUT,
        env: { PLATFORMIO_SETTING_ENABLE_TELEMETRY: 'No' },
      }
    );

    if (!buildResult.success) {
      meta.status = 'failed';
      meta.error = buildResult.stderr.substring(0, 5000);
      meta.buildLog = buildResult.stdout.substring(0, 10000);
      await env.BUILD_META.put('latest-build', JSON.stringify(meta));
      console.error('Build failed:', buildResult.stderr.substring(0, 500));
      return;
    }

    // Read the firmware binary
    const firmwarePath = `${REPO_DIR}/.pio/build/${env.BUILD_ENV}/firmware.bin`;
    const firmwareData = await sandbox.readFile(firmwarePath, { encoding: 'base64' });
    const firmwareBytes = Uint8Array.from(atob(firmwareData.content), c => c.charCodeAt(0));

    // Upload firmware to R2
    await env.FIRMWARE_BUCKET.put(`builds/${commit.substring(0, 7)}/firmware.bin`, firmwareBytes, {
      customMetadata: { commit, version: meta.version, buildDate: meta.buildDate },
    });
    await env.FIRMWARE_BUCKET.put('builds/latest/firmware.bin', firmwareBytes, {
      customMetadata: { commit, version: meta.version, buildDate: meta.buildDate },
    });

    meta.status = 'success';
    meta.firmwareSize = firmwareBytes.length;
    meta.buildLog = buildResult.stdout.substring(buildResult.stdout.length - 2000);
    await env.BUILD_META.put('latest-build', JSON.stringify(meta));

    console.log(`Build successful: ${meta.version} (${firmwareBytes.length} bytes)`);
  } catch (err) {
    meta.status = 'failed';
    meta.error = err instanceof Error ? err.message : String(err);
    await env.BUILD_META.put('latest-build', JSON.stringify(meta));
    console.error('Build error:', meta.error);
  }
}

function parseChangelog(raw: string): ChangelogEntry[] {
  if (!raw.trim()) return [];
  return raw
    .trim()
    .split('\n')
    .filter(line => line.includes('|'))
    .map(line => {
      const [hash, hashShort, author, date, ...messageParts] = line.split('|');
      return { hash, hashShort, author, date, message: messageParts.join('|') };
    });
}
