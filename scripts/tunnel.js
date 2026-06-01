import { execSync, spawn } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

function resolveCloudflaredPath() {
  if (process.env.CLOUDFLARED_PATH) {
    return process.env.CLOUDFLARED_PATH;
  }

  const lookupCommands = process.platform === 'win32'
    ? ['where cloudflared']
    : ['command -v cloudflared', 'which cloudflared'];

  for (const command of lookupCommands) {
    try {
      const output = execSync(command, {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
        shell: true,
      }).trim();
      const firstMatch = output.split(/\r?\n/).find(Boolean);
      if (firstMatch) {
        return firstMatch;
      }
    } catch {
      // Fall through to the next lookup strategy.
    }
  }

  return 'cloudflared';
}

const env = {
  ...process.env,
  CLOUDFLARED_PATH: resolveCloudflaredPath(),
};

const wranglerCli = require.resolve('wrangler/bin/wrangler.js');
const child = spawn(
  process.execPath,
  [wranglerCli, 'tunnel', 'quick-start', 'http://127.0.0.1:8787'],
  {
    env,
    stdio: 'inherit',
  },
);

child.on('exit', (code, signal) => {
  if (signal) {
    process.exit(1);
    return;
  }
  process.exit(code ?? 0);
});

child.on('error', (error) => {
  console.error(error);
  process.exit(1);
});
