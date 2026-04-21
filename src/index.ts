import type { Env, BuildMetadata, GitHubPushEvent } from './types';
import { verifyGitHubSignature, isPushToMaster } from './webhook';
import { triggerBuild } from './builder';

export { Sandbox } from '@cloudflare/sandbox';

const ROYALTY_REPO_ID = 'SoFriendly/crosspoint-tools';

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // API routes
    if (url.pathname.startsWith('/api/')) {
      return handleApi(request, url, env, ctx);
    }

    // Gate early access behind Royalty.dev subscription
    if (url.pathname === '/early-access' || url.pathname === '/early-access.html') {
      return handleEarlyAccess(request, url, env);
    }

    // Let static assets handle everything else
    return env.ASSETS.fetch(request);
  },

  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    // Poll upstream repo for new commits and trigger build if needed
    const repoPath = env.REPO_URL
      .replace(/^https?:\/\/github\.com\//, '')
      .replace(/\.git$/, '');
    const apiUrl = `https://api.github.com/repos/${repoPath}/commits/${env.REPO_BRANCH}`;

    const ghHeaders: Record<string, string> = {
      'User-Agent': 'crosspoint-tools',
      Accept: 'application/vnd.github.v3+json',
    };
    if (env.GITHUB_TOKEN) {
      ghHeaders.Authorization = `token ${env.GITHUB_TOKEN}`;
    }

    const ghRes = await fetch(apiUrl, { headers: ghHeaders });
    if (!ghRes.ok) {
      console.error('Failed to fetch latest commit:', ghRes.status);
      return;
    }

    const commitData = await ghRes.json() as { sha: string; commit: { message: string } };
    const latestCommit = commitData.sha;

    // Check if we already built this commit
    const raw = await env.BUILD_META.get('latest-build');
    if (raw) {
      const meta: BuildMetadata = JSON.parse(raw);
      if (meta.commit === latestCommit) {
        // Already built this commit, skip
        return;
      }
    }

    console.log(`New commit detected: ${latestCommit.substring(0, 7)}, triggering build`);
    ctx.waitUntil(triggerBuild(env, latestCommit, commitData.commit.message));
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

      case '/api/firmware/stock':
        return handleStockFirmware(url, corsHeaders);

      case '/api/firmware/stock/info':
        return handleStockFirmwareInfo(url, corsHeaders);

      case '/api/auth/magic-link':
        return handleMagicLink(request, corsHeaders);

      case '/api/auth/logout':
        return handleLogout(request);

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

  // Auth check — use the webhook secret as a bearer token
  const auth = request.headers.get('Authorization');
  if (auth !== `Bearer ${env.GITHUB_WEBHOOK_SECRET}`) {
    return json({ error: 'Unauthorized' }, 401, headers);
  }

  // Fetch latest commit from GitHub
  // Derive API URL: "https://github.com/org/repo.git" -> "org/repo"
  const repoPath = env.REPO_URL
    .replace(/^https?:\/\/github\.com\//, '')
    .replace(/\.git$/, '');
  const apiUrl = `https://api.github.com/repos/${repoPath}/commits/${env.REPO_BRANCH}`;

  const ghHeaders: Record<string, string> = {
    'User-Agent': 'crosspoint-tools',
    Accept: 'application/vnd.github.v3+json',
  };
  if (env.GITHUB_TOKEN) {
    ghHeaders.Authorization = `token ${env.GITHUB_TOKEN}`;
  }

  console.log(`Fetching commit from: ${apiUrl}`);
  const ghRes = await fetch(apiUrl, { headers: ghHeaders });
  if (!ghRes.ok) {
    const body = await ghRes.text();
    console.error(`GitHub API error: ${ghRes.status} ${body.substring(0, 500)}`);
    return json({ error: `Failed to fetch latest commit: ${ghRes.status}` }, 502, headers);
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

// --- Stock Firmware (Official Xteink) ---

const STOCK_CHECK_URLS: Record<string, Record<string, string>> = {
  x4: {
    ch: 'http://47.122.74.33:5000/api/check-update?current_version=V3.0.1&device_type=ESP32C3',
    en: 'http://gotaserver.xteink.com/api/check-update?current_version=V3.0.1&device_type=ESP32C3&device_id=1234',
  },
  x3: {
    ch: 'https://api-prod.xteink.cn/api/v1/check-update?current_version=V5.1.3&device_type=ESP32C3_X3&device_id=1052463&choose=1&lang=zh',
    en: 'http://8.216.34.42:5001/api/v1/check-update?current_version=V5.1.3&device_type=ESP32C3_X3&device_id=1052463&choose=1&lang=en',
  },
};

const STOCK_FALLBACKS: Record<string, Record<string, { version: string; download_url: string }>> = {
  x4: {
    en: { version: 'V3.1.1', download_url: 'http://gotaserver.xteink.com/api/download/ESP32C3/V3.1.1/V3.1.1-EN.bin' },
    ch: { version: 'V3.1.9', download_url: 'http://47.122.74.33:5000/api/download/ESP32C3/V3.1.9/V3.1.9_CH_X4_0117.bin' },
  },
  x3: {
    en: { version: 'V5.1.6', download_url: 'http://8.216.34.42:5001/api/v1/download/ESP32C3_X3/V5.1.6/V5.1.6-X3-EN-PROD-0304_.bin?choose=1&lang=en' },
    ch: { version: 'V5.2.13', download_url: 'https://domestic-upload-file-api.oss-cn-hangzhou.aliyuncs.com/admin_uploads/firmware/202603/26/751e134f-22b1-4a00-bbfa-0942593ef867/V5.2.13-X3-CH-PROD-0326_173844.bin' },
  },
};

async function fetchStockFirmwareInfo(model: string, lang: string) {
  const checkUrl = STOCK_CHECK_URLS[model]?.[lang];
  const fallback = STOCK_FALLBACKS[model]?.[lang];
  if (!checkUrl || !fallback) return null;

  try {
    const res = await fetch(checkUrl, { signal: AbortSignal.timeout(5000) });
    if (res.ok) {
      const body = await res.json() as { data?: { version: string; download_url: string } };
      if (body.data?.download_url) return body.data;
    }
  } catch { /* fall through */ }

  return fallback;
}

async function handleStockFirmwareInfo(
  url: URL,
  headers: Record<string, string>
): Promise<Response> {
  const model = url.searchParams.get('model') || 'x4';
  const lang = url.searchParams.get('lang') || 'en';

  const info = await fetchStockFirmwareInfo(model, lang);
  if (!info) {
    return json({ error: 'Invalid model or language' }, 400, headers);
  }

  return json({ version: info.version, model, lang }, 200, headers);
}

async function handleStockFirmware(
  url: URL,
  headers: Record<string, string>
): Promise<Response> {
  const model = url.searchParams.get('model') || 'x4';
  const lang = url.searchParams.get('lang') || 'en';

  const info = await fetchStockFirmwareInfo(model, lang);
  if (!info) {
    return json({ error: 'Invalid model or language' }, 400, headers);
  }

  const fwRes = await fetch(info.download_url);
  if (!fwRes.ok) {
    return json({ error: 'Failed to download stock firmware' }, 502, headers);
  }

  return new Response(fwRes.body, {
    headers: {
      ...headers,
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${model}-${lang}-firmware.bin"`,
      'X-Firmware-Version': info.version,
    },
  });
}

// --- Early Access Gate ---

async function verifyRoyaltyKey(token: string): Promise<{ valid: boolean; email?: string }> {
  try {
    const res = await fetch(
      `https://api.royalty.dev/releases/verify/${encodeURIComponent(token)}?repo_id=${ROYALTY_REPO_ID}`
    );
    return await res.json() as { valid: boolean; email?: string };
  } catch {
    return { valid: false };
  }
}

async function handleEarlyAccess(request: Request, url: URL, env: Env): Promise<Response> {
  // Check for royalty_key in URL (new purchase or magic link callback)
  const key = url.searchParams.get('royalty_key');
  if (key) {
    const data = await verifyRoyaltyKey(key);
    if (data.valid) {
      // Set cookie and redirect to clean URL
      const cleanUrl = new URL(url.pathname, url.origin);
      const response = Response.redirect(cleanUrl.toString(), 302);
      // Response.redirect returns an immutable response, so we need to create a new one
      const mutableResponse = new Response(null, {
        status: 302,
        headers: { Location: cleanUrl.toString() },
      });
      mutableResponse.headers.set(
        'Set-Cookie',
        `royalty_access=${key}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${30 * 24 * 60 * 60}`
      );
      return mutableResponse;
    }
  }

  // Check for existing cookie
  const cookies = request.headers.get('Cookie') || '';
  const match = cookies.match(/royalty_access=([^;]+)/);
  if (match) {
    const data = await verifyRoyaltyKey(match[1]);
    if (data.valid) {
      // Verified subscriber — serve the early access page
      return env.ASSETS.fetch(request);
    }
    // Invalid cookie — clear it and show gate
    const gateRequest = new Request(new URL('/login.html', url.origin).toString(), request);
    const gateResponse = await env.ASSETS.fetch(gateRequest);
    const response = new Response(gateResponse.body, gateResponse);
    response.headers.set(
      'Set-Cookie',
      'royalty_access=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0'
    );
    return response;
  }

  // No access — serve the login/gate page
  const gateRequest = new Request(new URL('/login.html', url.origin).toString(), request);
  return env.ASSETS.fetch(gateRequest);
}

// --- Auth API ---

async function handleMagicLink(
  request: Request,
  headers: Record<string, string>
): Promise<Response> {
  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405, headers);
  }

  const body = await request.json() as { email?: string };
  if (!body.email) {
    return json({ error: 'Email is required' }, 400, headers);
  }

  const res = await fetch('https://api.royalty.dev/releases/magic-link', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: body.email,
      repoId: ROYALTY_REPO_ID,
      redirectUrl: new URL('/early-access', request.url).toString(),
    }),
  });

  if (res.ok) {
    return json({ sent: true }, 200, headers);
  }

  const data = await res.json() as { error?: string };
  return json({ error: data.error || 'No subscription found for this email.' }, res.status, headers);
}

function handleLogout(request: Request): Response {
  const url = new URL(request.url);
  const response = new Response(null, {
    status: 302,
    headers: { Location: new URL('/early-access', url.origin).toString() },
  });
  response.headers.set(
    'Set-Cookie',
    'royalty_access=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0'
  );
  return response;
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
