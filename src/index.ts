import type { Env, BuildMetadata, GitHubPushEvent } from './types';
import { verifyGitHubSignature, isPushToMaster } from './webhook';
import { triggerBuild } from './builder';

export { Sandbox } from '@cloudflare/sandbox';

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // API routes
    if (url.pathname.startsWith('/api/')) {
      return handleApi(request, url, env, ctx);
    }

    // Let static assets handle everything else
    return env.ASSETS.fetch(request);
  },
};

async function handleApi(
  request: Request,
  url: URL,
  env: Env,
  ctx: ExecutionContext
): Promise<Response> {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    switch (url.pathname) {
      case '/api/webhook':
        return handleWebhook(request, env, ctx);

      case '/api/build/latest':
        return handleLatestBuild(env, corsHeaders);

      case '/api/build/firmware':
        return handleFirmwareDownload(env, corsHeaders);

      case '/api/build/trigger':
        return handleManualTrigger(request, env, ctx, corsHeaders);

      case '/api/release/latest':
        return handleLatestRelease(corsHeaders);

      case '/api/release/firmware':
        return handleReleaseFirmware(corsHeaders);

      default:
        return json({ error: 'Not found' }, 404, corsHeaders);
    }
  } catch (err) {
    console.error('API error:', err);
    return json({ error: 'Internal server error' }, 500, corsHeaders);
  }
}

// --- GitHub Webhook ---

async function handleWebhook(
  request: Request,
  env: Env,
  ctx: ExecutionContext
): Promise<Response> {
  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  const event = request.headers.get('x-github-event');
  if (event !== 'push') {
    return json({ message: 'Ignored event', event }, 200);
  }

  const { valid, body } = await verifyGitHubSignature(request, env.GITHUB_WEBHOOK_SECRET);
  if (!valid) {
    return json({ error: 'Invalid signature' }, 401);
  }

  const payload: GitHubPushEvent = JSON.parse(body);
  if (!isPushToMaster(payload, env.REPO_BRANCH)) {
    return json({ message: 'Not target branch, ignoring' }, 200);
  }

  const commit = payload.after;
  const commitMessage = payload.head_commit?.message || 'No message';

  // Run build in background (don't block webhook response)
  ctx.waitUntil(triggerBuild(env, commit, commitMessage));

  return json({ message: 'Build triggered', commit: commit.substring(0, 7) }, 202);
}

// --- Build Metadata ---

async function handleLatestBuild(
  env: Env,
  headers: Record<string, string>
): Promise<Response> {
  const raw = await env.BUILD_META.get('latest-build');
  if (!raw) {
    return json({ error: 'No builds yet' }, 404, headers);
  }
  const meta: BuildMetadata = JSON.parse(raw);
  // Don't send full build log to frontend
  const { buildLog, ...publicMeta } = meta;
  return json(publicMeta, 200, headers);
}

// --- Firmware Download (from R2) ---

async function handleFirmwareDownload(
  env: Env,
  headers: Record<string, string>
): Promise<Response> {
  const object = await env.FIRMWARE_BUCKET.get('builds/latest/firmware.bin');
  if (!object) {
    return json({ error: 'No firmware available' }, 404, headers);
  }

  return new Response(object.body, {
    headers: {
      ...headers,
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': 'attachment; filename="firmware.bin"',
      'Content-Length': String(object.size),
      'X-Build-Commit': object.customMetadata?.commit || '',
      'X-Build-Version': object.customMetadata?.version || '',
      'X-Build-Date': object.customMetadata?.buildDate || '',
    },
  });
}

// --- Manual Build Trigger ---

async function handleManualTrigger(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
  headers: Record<string, string>
): Promise<Response> {
  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405, headers);
  }

  // Fetch latest commit from GitHub
  const apiUrl = env.REPO_URL
    .replace('https://github.com/', 'https://api.github.com/repos/')
    .replace('.git', '') + `/commits/${env.REPO_BRANCH}`;

  const ghHeaders: Record<string, string> = {
    'User-Agent': 'crosspoint-tools',
    Accept: 'application/vnd.github.v3+json',
  };
  if (env.GITHUB_TOKEN) {
    ghHeaders.Authorization = `token ${env.GITHUB_TOKEN}`;
  }

  const ghRes = await fetch(apiUrl, { headers: ghHeaders });
  if (!ghRes.ok) {
    return json({ error: 'Failed to fetch latest commit' }, 502, headers);
  }

  const commitData = await ghRes.json() as { sha: string; commit: { message: string } };
  ctx.waitUntil(triggerBuild(env, commitData.sha, commitData.commit.message));

  return json(
    { message: 'Build triggered', commit: commitData.sha.substring(0, 7) },
    202,
    headers
  );
}

// --- Stable Release (from GitHub Releases) ---

async function handleLatestRelease(
  headers: Record<string, string>
): Promise<Response> {
  const res = await fetch(
    'https://api.github.com/repos/crosspoint-reader/crosspoint-reader/releases/latest',
    {
      headers: {
        'User-Agent': 'crosspoint-tools',
        Accept: 'application/vnd.github.v3+json',
      },
    }
  );

  if (!res.ok) {
    return json({ error: 'Failed to fetch release' }, 502, headers);
  }

  const release = await res.json() as {
    tag_name: string;
    name: string;
    published_at: string;
    body: string;
    assets: Array<{ name: string; browser_download_url: string; size: number }>;
  };

  const firmwareAsset = release.assets.find(a => a.name.endsWith('firmware.bin'));

  return json({
    tag: release.tag_name,
    name: release.name,
    publishedAt: release.published_at,
    body: release.body,
    firmwareUrl: firmwareAsset?.browser_download_url || null,
    firmwareSize: firmwareAsset?.size || null,
  }, 200, headers);
}

async function handleReleaseFirmware(
  headers: Record<string, string>
): Promise<Response> {
  // Fetch latest release info
  const res = await fetch(
    'https://api.github.com/repos/crosspoint-reader/crosspoint-reader/releases/latest',
    {
      headers: {
        'User-Agent': 'crosspoint-tools',
        Accept: 'application/vnd.github.v3+json',
      },
    }
  );

  if (!res.ok) {
    return json({ error: 'Failed to fetch release' }, 502, headers);
  }

  const release = await res.json() as {
    assets: Array<{ name: string; browser_download_url: string }>;
  };
  const firmwareAsset = release.assets.find(a => a.name.endsWith('firmware.bin'));
  if (!firmwareAsset) {
    return json({ error: 'No firmware.bin in latest release' }, 404, headers);
  }

  // Download and proxy the firmware binary
  const fwRes = await fetch(firmwareAsset.browser_download_url, {
    headers: { 'User-Agent': 'crosspoint-tools' },
  });
  if (!fwRes.ok) {
    return json({ error: 'Failed to download firmware' }, 502, headers);
  }

  return new Response(fwRes.body, {
    headers: {
      ...headers,
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': 'attachment; filename="firmware.bin"',
    },
  });
}

// --- Helpers ---

function json(data: unknown, status = 200, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...extraHeaders,
    },
  });
}
