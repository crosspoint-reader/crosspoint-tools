import { getSandbox } from '@cloudflare/sandbox';
import type { Env, BuildMetadata, ChangelogEntry } from './types';

const BUILD_TIMEOUT = 600_000; // 10 minutes for full PlatformIO build

export async function triggerBuild(env: Env, commit: string, commitMessage: string): Promise<void> {
  // Mark build as started
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
    const sandbox = getSandbox(env.SANDBOX, `build-${commit.substring(0, 7)}`, {
      sleepAfter: '15m',
    });

    // Clone the repository
    const cloneUrl = env.GITHUB_TOKEN
      ? env.REPO_URL.replace('https://', `https://x-access-token:${env.GITHUB_TOKEN}@`)
      : env.REPO_URL;

    console.log(`Cloning ${env.REPO_URL} @ ${env.REPO_BRANCH}...`);
    const cloneResult = await sandbox.exec(
      `git clone --depth 50 --branch ${env.REPO_BRANCH} --recurse-submodules ${cloneUrl} /workspace/crosspoint-reader`,
      { timeout: 120_000 }
    );
    if (!cloneResult.success) {
      throw new Error(`Clone failed: ${cloneResult.stderr}`);
    }

    // Get changelog — commits since last tag
    const changelogResult = await sandbox.exec(
      'git log $(git describe --tags --abbrev=0 2>/dev/null || git rev-list --max-parents=0 HEAD)..HEAD --pretty=format:"%H|%h|%an|%aI|%s"',
      { cwd: '/workspace/crosspoint-reader', timeout: 10_000 }
    );
    const changelog = parseChangelog(changelogResult.stdout);
    meta.changelog = changelog;

    // Read version from platformio.ini
    const versionResult = await sandbox.exec(
      'grep -oP "version\\s*=\\s*\\K.*" platformio.ini | head -1',
      { cwd: '/workspace/crosspoint-reader', timeout: 5_000 }
    );
    const baseVersion = versionResult.stdout.trim() || 'unknown';
    meta.version = `${baseVersion}-dev+${commit.substring(0, 7)}`;

    // Build firmware
    console.log(`Building firmware (env: ${env.BUILD_ENV})...`);
    const buildResult = await sandbox.exec(
      `pio run -e ${env.BUILD_ENV}`,
      {
        cwd: '/workspace/crosspoint-reader',
        timeout: BUILD_TIMEOUT,
        env: {
          PLATFORMIO_SETTING_ENABLE_TELEMETRY: 'No',
        },
      }
    );

    if (!buildResult.success) {
      meta.status = 'failed';
      meta.error = buildResult.stderr.substring(0, 5000);
      meta.buildLog = buildResult.stdout.substring(0, 10000);
      await env.BUILD_META.put('latest-build', JSON.stringify(meta));
      console.error('Build failed:', buildResult.stderr.substring(0, 500));
      await sandbox.destroy();
      return;
    }

    // Read the firmware binary
    const firmwarePath = `/workspace/crosspoint-reader/.pio/build/${env.BUILD_ENV}/firmware.bin`;
    const firmwareData = await sandbox.readFile(firmwarePath, { encoding: 'base64' });

    // Convert base64 to binary and upload to R2
    const firmwareBytes = Uint8Array.from(atob(firmwareData.content), c => c.charCodeAt(0));

    // Upload firmware to R2 with metadata
    const r2Key = `builds/${commit.substring(0, 7)}/firmware.bin`;
    await env.FIRMWARE_BUCKET.put(r2Key, firmwareBytes, {
      customMetadata: {
        commit,
        version: meta.version,
        buildDate: meta.buildDate,
      },
    });

    // Also upload as "latest"
    await env.FIRMWARE_BUCKET.put('builds/latest/firmware.bin', firmwareBytes, {
      customMetadata: {
        commit,
        version: meta.version,
        buildDate: meta.buildDate,
      },
    });

    meta.status = 'success';
    meta.firmwareSize = firmwareBytes.length;
    meta.buildLog = buildResult.stdout.substring(buildResult.stdout.length - 2000);
    await env.BUILD_META.put('latest-build', JSON.stringify(meta));

    console.log(`Build successful: ${meta.version} (${firmwareBytes.length} bytes)`);

    // Clean up sandbox
    await sandbox.destroy();
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
      return {
        hash,
        hashShort,
        author,
        date,
        message: messageParts.join('|'),
      };
    });
}
