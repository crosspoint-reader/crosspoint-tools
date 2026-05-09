import type { Env, BuildMetadata, CustomBuildMetadata, FontBuildMetadata, FontTree, FontFile, BetaBuild, BetaSource } from './types';

const ROYALTY_REPO_ID = 'SoFriendly/crosspoint-tools';

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // API routes
    if (url.pathname.startsWith('/api/')) {
      return handleApi(request, url, env, ctx);
    }

    // Proxy fonts.json for SD card font loading (device manifest)
    if (url.pathname === '/fonts.json') {
      const res = await fetch(
        'https://github.com/adriancaruana/crosspoint-reader/releases/download/sd-fonts/fonts.json',
        { headers: { 'User-Agent': 'CrossPoint-Tools' } }
      );
      return new Response(res.body, {
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'public, max-age=3600',
        },
      });
    }

    // Gate insider builds behind Royalty.dev subscription
    if (url.pathname === '/insider' || url.pathname === '/insider.html' ||
        url.pathname === '/early-access' || url.pathname === '/early-access.html') {
      return handleInsiderAccess(request, url, env);
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
    'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Build-Id, X-Build-Commit, X-Build-Version',
  };

  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    switch (url.pathname) {
      case '/api/build/latest':
        return handleLatestBuild(env, corsHeaders);

      case '/api/build/summary':
        return handleBuildSummary(url, env, corsHeaders);

      case '/api/build/firmware':
        return handleFirmwareDownload(env, corsHeaders);

      case '/api/build/trigger':
        return handleManualTrigger(request, env, corsHeaders);

      case '/api/build/status':
        return handleBuildStatus(request, env, corsHeaders);

      case '/api/build/upload':
        return handleBuildUpload(request, env, corsHeaders);

      case '/api/catalog':
        return handleCatalog(env, corsHeaders);

      case '/api/release/latest':
        return handleLatestRelease(env, corsHeaders);

      case '/api/release/firmware':
        return handleReleaseFirmware(env, corsHeaders);

      case '/api/firmware/stock':
        return handleStockFirmware(url, env, corsHeaders);

      case '/api/firmware/stock/info':
        return handleStockFirmwareInfo(url, corsHeaders);

      case '/api/firmware/stock/cache':
        return handleStockFirmwareCache(request, url, env, corsHeaders);

      case '/api/auth/magic-link':
        return handleMagicLink(request, corsHeaders);

      case '/api/auth/logout':
        return handleLogout(request);

      case '/api/fonts':
        return handleFontList(env, corsHeaders);

      case '/api/custom-build/upload':
        return handleCustomBuildUpload(request, env, corsHeaders);

      case '/api/custom-build/status':
        return handleCustomBuildStatus(request, env, corsHeaders);

      case '/api/custom-build/firmware':
        return handleCustomBuildFirmware(request, env, corsHeaders);

      case '/api/custom-build/clear':
        return handleCustomBuildClear(request, env, corsHeaders);

      case '/api/custom-build/upload-result':
        return handleCustomBuildUploadResult(request, env, corsHeaders);

      case '/api/custom-build/status-update':
        return handleCustomBuildStatusUpdate(request, env, corsHeaders);

      case '/api/font-build/upload':
        return handleFontBuildUpload(request, env, corsHeaders);

      case '/api/font-build/status':
        return handleFontBuildStatus(request, env, corsHeaders);

      case '/api/font-build/clear':
        return handleFontBuildClear(request, env, corsHeaders);

      case '/api/font-build/upload-result':
        return handleFontBuildUploadResult(request, env, corsHeaders);

      case '/api/font-build/status-update':
        return handleFontBuildStatusUpdate(request, env, corsHeaders);

      case '/api/beta':
        if (request.method === 'GET') return handleBetaList(env, corsHeaders);
        if (request.method === 'POST') return handleBetaCreate(request, env, corsHeaders);
        return json({ error: 'Method not allowed' }, 405, corsHeaders);

      default:
        // Dynamic routes: /api/beta/{id}/firmware
        if (url.pathname.startsWith('/api/beta/') && url.pathname.endsWith('/firmware')) {
          return handleBetaFirmware(url, env, corsHeaders);
        }
        // /api/beta/{id} PATCH
        if (url.pathname.startsWith('/api/beta/') && request.method === 'PATCH') {
          return handleBetaUpdate(request, url, env, corsHeaders);
        }
        // /api/beta/{id} DELETE
        if (url.pathname.startsWith('/api/beta/') && request.method === 'DELETE') {
          return handleBetaDelete(request, url, env, corsHeaders);
        }
        // Dynamic routes: /api/custom-build/fonts/{buildId}/{filename}
        if (url.pathname.startsWith('/api/custom-build/fonts/')) {
          return handleCustomBuildFontDownload(request, url, env, corsHeaders);
        }
        // /api/font-build/files/{buildId}/{style}.ttf  — workflow downloads inputs
        if (url.pathname.startsWith('/api/font-build/files/')) {
          return handleFontBuildFileDownload(request, url, env, corsHeaders);
        }
        // /api/font-build/result/{filename}            — user downloads outputs
        if (url.pathname.startsWith('/api/font-build/result/')) {
          return handleFontBuildResultDownload(request, url, env, corsHeaders);
        }
        return json({ error: 'Not found' }, 404, corsHeaders);
    }
  } catch (err) {
    console.error('API error:', err);
    return json({ error: 'Internal server error' }, 500, corsHeaders);
  }
}

// --- Build Metadata ---

async function handleLatestBuild(
  env: Env,
  headers: Record<string, string>
): Promise<Response> {
  const raw = await env.BUILD_META.get('latest-build');
  const pendingRaw = await env.BUILD_META.get('pending-build');

  if (!raw && !pendingRaw) {
    return json({ error: 'No builds yet' }, 404, headers);
  }

  const latest = raw ? JSON.parse(raw) : null;
  const pending = pendingRaw ? JSON.parse(pendingRaw) : null;

  // Return the latest successful build, with pending status info if a build is in progress
  const result = latest ? { ...latest, buildLog: undefined } : {};
  if (pending) {
    result.pendingBuild = pending;
  }

  return json(result, 200, headers);
}

// --- Build Summary (AI-generated) ---

interface PRInfo {
  number: number;
  title: string;
  body: string;
}

async function fetchPRForCommit(
  env: Env,
  owner: string,
  repo: string,
  hash: string
): Promise<PRInfo | null> {
  // Check KV cache first
  const cacheKey = `pr-info:${hash}`;
  const cached = await env.BUILD_META.get(cacheKey);
  if (cached) return cached === 'none' ? null : JSON.parse(cached);

  try {
    const ghHeaders: Record<string, string> = {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'CrossPoint-Tools',
    };
    if (env.GITHUB_TOKEN) {
      ghHeaders.Authorization = `Bearer ${env.GITHUB_TOKEN}`;
    }
    const res = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/commits/${hash}/pulls`,
      { headers: ghHeaders }
    );
    if (!res.ok) {
      console.error(`GitHub PR fetch failed for ${hash}: ${res.status}`);
      await env.BUILD_META.put(cacheKey, 'none');
      return null;
    }
    const pulls = (await res.json()) as Array<{
      number: number;
      title: string;
      body: string | null;
    }>;
    if (!pulls.length) {
      await env.BUILD_META.put(cacheKey, 'none');
      return null;
    }
    const pr: PRInfo = {
      number: pulls[0].number,
      title: pulls[0].title,
      body: (pulls[0].body || '').slice(0, 1000),
    };
    await env.BUILD_META.put(cacheKey, JSON.stringify(pr));
    return pr;
  } catch (err) {
    console.error(`GitHub PR fetch error for ${hash}:`, err);
    await env.BUILD_META.put(cacheKey, 'none');
    return null;
  }
}

async function handleBuildSummary(
  url: URL,
  env: Env,
  headers: Record<string, string>
): Promise<Response> {
  const raw = await env.BUILD_META.get('latest-build');
  if (!raw) {
    return json({ error: 'No builds yet' }, 404, headers);
  }
  const meta: BuildMetadata = JSON.parse(raw);
  const forceRegenerate = url.searchParams.get('regenerate') === '1';

  // Return cached overall summary if it exists for this build
  if (meta.summary && !forceRegenerate) {
    return json({ summary: meta.summary, commit: meta.commitShort }, 200, headers);
  }

  if (!meta.changelog?.length) {
    return json({ summary: null, commit: meta.commitShort }, 200, headers);
  }

  // Step 1: Fetch PR info for each commit (cached per hash, batched to avoid rate limits)
  const owner = 'crosspoint-reader';
  const repo = 'crosspoint-reader';
  const prResults: (PRInfo | null)[] = [];
  for (const c of meta.changelog) {
    prResults.push(await fetchPRForCommit(env, owner, repo, c.hash));
  }

  // Step 2: Build context from PRs (deduplicated) + fallback to commit messages
  const seenPRs = new Set<number>();
  const changeDescriptions: string[] = [];

  for (let i = 0; i < meta.changelog.length; i++) {
    const pr = prResults[i];
    if (pr && !seenPRs.has(pr.number)) {
      seenPRs.add(pr.number);
      const desc = pr.body
        ? `PR #${pr.number}: ${pr.title}\nDescription: ${pr.body}`
        : `PR #${pr.number}: ${pr.title}`;
      changeDescriptions.push(desc);
    } else if (!pr) {
      // No PR — use commit message as fallback
      changeDescriptions.push(meta.changelog[i].message.split('\n')[0]);
    }
  }

  const changesText = changeDescriptions.join('\n\n');

  // Step 3: Generate summary from PR content
  const response = await env.AI.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast', {
    messages: [
      {
        role: 'system',
        content:
          'You write release summaries for e-reader users. Focus on high-impact features and important bug fixes. Write 2-3 short, direct sentences. State what changed. No filler, no preamble, no "this build includes." Skip minor refactors, code cleanup, and internal changes. No bullet points, no markdown.',
      },
      {
        role: 'user',
        content: `Here are the pull requests and commits in the latest nightly build of CrossPoint, an open-source firmware for Xteink e-readers:\n\n${changesText}\n\nSummarize the most important user-facing changes.`,
      },
    ],
    max_tokens: 200,
  });

  const summary =
    (response as { response?: string }).response?.trim() || null;

  // Cache the overall summary on the build meta
  if (summary) {
    meta.summary = summary;
    await env.BUILD_META.put('latest-build', JSON.stringify(meta));
  }

  return json({ summary, commit: meta.commitShort }, 200, headers);
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

// --- Manual Build Trigger (dispatches GitHub Actions workflow) ---

async function handleManualTrigger(
  request: Request,
  env: Env,
  headers: Record<string, string>
): Promise<Response> {
  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405, headers);
  }

  const auth = request.headers.get('Authorization');
  if (auth !== `Bearer ${env.GITHUB_WEBHOOK_SECRET}`) {
    return json({ error: 'Unauthorized' }, 401, headers);
  }

  // Look up the commit the workflow will actually build, so the caller can
  // show it in the UI. The workflow itself queries crosspoint-reader@master,
  // so we mirror that here.
  let commit = '';
  let commitShort = '';
  try {
    const commitRes = await fetch(
      'https://api.github.com/repos/crosspoint-reader/crosspoint-reader/commits/master',
      {
        headers: {
          'User-Agent': 'crosspoint-tools',
          Authorization: `Bearer ${env.GITHUB_TOKEN}`,
          Accept: 'application/vnd.github.v3+json',
        },
      }
    );
    if (commitRes.ok) {
      const data = await commitRes.json() as { sha?: string };
      commit = data.sha || '';
      commitShort = commit.substring(0, 7);
    }
  } catch (err) {
    console.error('Failed to fetch latest commit:', err);
  }

  // Dispatch the GitHub Actions workflow
  const ghRes = await fetch(
    'https://api.github.com/repos/SoFriendly/crosspoint-tools/actions/workflows/build-firmware.yml/dispatches',
    {
      method: 'POST',
      headers: {
        'User-Agent': 'crosspoint-tools',
        Authorization: `Bearer ${env.GITHUB_TOKEN}`,
        Accept: 'application/vnd.github.v3+json',
      },
      body: JSON.stringify({ ref: 'master' }),
    }
  );

  if (!ghRes.ok) {
    const body = await ghRes.text();
    console.error(`GitHub Actions dispatch failed: ${ghRes.status} ${body}`);
    return json({ error: `Failed to trigger build: ${ghRes.status}` }, 502, headers);
  }

  return json({ message: 'Build dispatched to GitHub Actions', commit: commitShort }, 202, headers);
}

// --- Build Status Update (called by GitHub Actions) ---

async function handleBuildStatus(
  request: Request,
  env: Env,
  headers: Record<string, string>
): Promise<Response> {
  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405, headers);
  }

  const auth = request.headers.get('Authorization');
  if (auth !== `Bearer ${env.GITHUB_WEBHOOK_SECRET}`) {
    return json({ error: 'Unauthorized' }, 401, headers);
  }

  const body = await request.json() as Partial<BuildMetadata>;

  if (body.status === 'building' || body.status === 'failed') {
    // Don't overwrite a successful build — write to a separate key
    await env.BUILD_META.put('pending-build', JSON.stringify({
      ...body,
      buildDate: body.buildDate || new Date().toISOString(),
      buildTimestamp: body.buildTimestamp || Date.now(),
    }));
  } else {
    // Success — promote to latest-build, clear pending
    const meta = {
      ...body,
      buildDate: body.buildDate || new Date().toISOString(),
      buildTimestamp: body.buildTimestamp || Date.now(),
    };
    await env.BUILD_META.put('latest-build', JSON.stringify(meta));
    await env.BUILD_META.delete('pending-build');
  }

  return json({ ok: true }, 200, headers);
}

// --- Build Upload (receives firmware.bin from GitHub Actions) ---

async function handleBuildUpload(
  request: Request,
  env: Env,
  headers: Record<string, string>
): Promise<Response> {
  if (request.method !== 'PUT') {
    return json({ error: 'Method not allowed' }, 405, headers);
  }

  const auth = request.headers.get('Authorization');
  if (auth !== `Bearer ${env.GITHUB_WEBHOOK_SECRET}`) {
    return json({ error: 'Unauthorized' }, 401, headers);
  }

  const commit = request.headers.get('X-Build-Commit') || 'unknown';
  const version = request.headers.get('X-Build-Version') || '';
  const buildDate = new Date().toISOString();

  const firmwareData = await request.arrayBuffer();
  const sha256 = await sha256Hex(firmwareData);

  // Upload to R2
  const metadata = { commit, version, buildDate, sha256 };
  await env.FIRMWARE_BUCKET.put(`builds/${commit.substring(0, 7)}/firmware.bin`, firmwareData, {
    customMetadata: metadata,
  });
  await env.FIRMWARE_BUCKET.put('builds/latest/firmware.bin', firmwareData, {
    customMetadata: metadata,
  });

  await env.BUILD_META.put(`sha256:insider:${commit}`, sha256);

  return json({ ok: true, size: firmwareData.byteLength, sha256 }, 200, headers);
}

// --- Stable Release (from GitHub Releases) ---

function ghFetchHeaders(env: Env): Record<string, string> {
  const h: Record<string, string> = {
    'User-Agent': 'crosspoint-tools',
    Accept: 'application/vnd.github.v3+json',
  };
  if (env.GITHUB_TOKEN) {
    h.Authorization = `Bearer ${env.GITHUB_TOKEN}`;
  }
  return h;
}

async function handleLatestRelease(
  env: Env,
  headers: Record<string, string>
): Promise<Response> {
  const res = await fetch(
    'https://api.github.com/repos/crosspoint-reader/crosspoint-reader/releases/latest',
    { headers: ghFetchHeaders(env) }
  );

  if (!res.ok) {
    return json({ error: 'Failed to fetch release' }, 502, headers);
  }

  const release = await res.json() as {
    tag_name: string;
    name: string;
    html_url: string;
    published_at: string;
    body: string;
    assets: Array<{ name: string; browser_download_url: string; size: number }>;
  };

  const firmwareAsset = release.assets.find(a => a.name.endsWith('firmware.bin'));

  return json({
    tag: release.tag_name,
    name: release.name,
    htmlUrl: release.html_url,
    publishedAt: release.published_at,
    body: release.body,
    firmwareUrl: firmwareAsset?.browser_download_url || null,
    firmwareSize: firmwareAsset?.size || null,
  }, 200, {
    ...headers,
    'Cache-Control': 'public, max-age=300',
  });
}

async function handleReleaseFirmware(
  env: Env,
  headers: Record<string, string>
): Promise<Response> {
  const res = await fetch(
    'https://api.github.com/repos/crosspoint-reader/crosspoint-reader/releases/latest',
    { headers: ghFetchHeaders(env) }
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
    ch: 'https://api-prod.xteink.cn/api/v1/check-update?current_version=V5.1.0&device_type=ESP32C3&device_id=12345&lng=en',
    en: 'https://api-prod.xteink.cc/api/v1/check-update?current_version=V5.1.0&device_type=ESP32C3&device_id=12345&lng=en',
  },
  x3: {
    ch: 'https://api-prod.xteink.cn/api/v1/check-update?current_version=V5.1.0&device_type=ESP32C3_X3&device_id=12345&lng=en',
    en: 'https://api-prod.xteink.cc/api/v1/check-update?current_version=V5.1.0&device_type=ESP32C3_X3&device_id=12345&lng=en',
  },
};

type StockFetchResult =
  | { ok: true; data: { version: string; download_url: string } }
  | { ok: false; reason: 'unknown_model' | 'upstream_unreachable' };

async function fetchStockFirmwareInfo(model: string, lang: string): Promise<StockFetchResult> {
  const checkUrl = STOCK_CHECK_URLS[model]?.[lang];
  if (!checkUrl) return { ok: false, reason: 'unknown_model' };

  try {
    const res = await fetch(checkUrl, { signal: AbortSignal.timeout(15000) });
    if (res.ok) {
      const body = await res.json() as { data?: { version: string; download_url: string } };
      if (body.data?.download_url) return { ok: true, data: body.data };
    }
  } catch { /* fall through */ }

  return { ok: false, reason: 'upstream_unreachable' };
}

async function handleStockFirmwareInfo(
  url: URL,
  headers: Record<string, string>
): Promise<Response> {
  const model = url.searchParams.get('model') || 'x4';
  const lang = url.searchParams.get('lang') || 'en';

  const result = await fetchStockFirmwareInfo(model, lang);
  if (!result.ok) {
    if (result.reason === 'unknown_model') {
      return json({ error: 'Invalid model or language' }, 400, headers);
    }
    return json({ error: 'Upstream firmware API unreachable' }, 502, headers);
  }

  return json({ version: result.data.version, downloadUrl: result.data.download_url, model, lang }, 200, headers);
}

async function handleStockFirmwareCache(
  request: Request,
  url: URL,
  env: Env,
  headers: Record<string, string>
): Promise<Response> {
  if (request.method !== 'PUT') {
    return json({ error: 'Method not allowed' }, 405, headers);
  }

  const auth = request.headers.get('Authorization');
  if (auth !== `Bearer ${env.GITHUB_WEBHOOK_SECRET}`) {
    return json({ error: 'Unauthorized' }, 401, headers);
  }

  const model = url.searchParams.get('model');
  const lang = url.searchParams.get('lang');
  const version = request.headers.get('X-Firmware-Version') || '';
  if (!model || !lang) {
    return json({ error: 'model and lang required' }, 400, headers);
  }

  const data = await request.arrayBuffer();
  const r2Key = `stock/${model}-${lang}-${version}.bin`;

  await env.FIRMWARE_BUCKET.put(r2Key, data, {
    customMetadata: { model, lang, version, cachedAt: new Date().toISOString() },
  });

  // Update the R2 key mapping in KV so the worker knows the latest cached key
  await env.BUILD_META.put(`stock-${model}-${lang}`, JSON.stringify({ r2Key, version }));

  return json({ ok: true, r2Key, version, size: data.byteLength }, 200, headers);
}

async function handleStockFirmware(
  url: URL,
  env: Env,
  headers: Record<string, string>
): Promise<Response> {
  const model = url.searchParams.get('model') || 'x4';
  const lang = url.searchParams.get('lang') || 'en';

  // Try R2 cache first (populated by nightly GitHub Actions job)
  const cachedRaw = await env.BUILD_META.get(`stock-${model}-${lang}`);
  if (cachedRaw) {
    const cached = JSON.parse(cachedRaw) as { r2Key: string; version: string };
    const object = await env.FIRMWARE_BUCKET.get(cached.r2Key);
    if (object) {
      return new Response(object.body, {
        headers: {
          ...headers,
          'Content-Type': 'application/octet-stream',
          'Content-Disposition': `attachment; filename="${model}-${lang}-firmware.bin"`,
          'X-Firmware-Version': cached.version,
        },
      });
    }
  }

  // Fetch version info then download directly
  const result = await fetchStockFirmwareInfo(model, lang);
  if (!result.ok) {
    if (result.reason === 'unknown_model') {
      return json({ error: 'Invalid model or language' }, 400, headers);
    }
    return json({ error: 'Upstream firmware API unreachable' }, 502, headers);
  }

  const fwRes = await fetch(result.data.download_url);
  if (!fwRes.ok) {
    return json({ error: 'Failed to download stock firmware' }, 502, headers);
  }

  return new Response(fwRes.body, {
    headers: {
      ...headers,
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${model}-${lang}-firmware.bin"`,
      'X-Firmware-Version': result.data.version,
    },
  });
}

// --- Insider Access Gate ---

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

async function handleInsiderAccess(request: Request, url: URL, env: Env): Promise<Response> {
  // Redirect old /early-access URLs to /insider
  if (url.pathname === '/early-access' || url.pathname === '/early-access.html') {
    const newUrl = new URL('/insider', url.origin);
    newUrl.search = url.search;
    return Response.redirect(newUrl.toString(), 301);
  }

  // Paywall temporarily disabled - serve insider page to everyone
  return env.ASSETS.fetch(request);

  /*
  // Check for royalty_key in URL (new purchase or magic link callback)
  const key = url.searchParams.get('royalty_key');
  if (key) {
    const data = await verifyRoyaltyKey(key);
    if (data.valid) {
      // Set cookie and redirect to clean URL
      const cleanUrl = new URL(url.pathname, url.origin);
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
      // Verified subscriber - serve the insider page
      return env.ASSETS.fetch(request);
    }
    // Invalid cookie - clear it and show gate
    const gateRequest = new Request(new URL('/login.html', url.origin).toString(), request);
    const gateResponse = await env.ASSETS.fetch(gateRequest);
    const response = new Response(gateResponse.body, gateResponse);
    response.headers.set(
      'Set-Cookie',
      'royalty_access=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0'
    );
    return response;
  }

  // No access - serve the login/gate page
  const gateRequest = new Request(new URL('/login.html', url.origin).toString(), request);
  return env.ASSETS.fetch(gateRequest);
  */
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
      redirectUrl: new URL('/insider', request.url).toString(),
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
    headers: { Location: new URL('/insider', url.origin).toString() },
  });
  response.headers.set(
    'Set-Cookie',
    'royalty_access=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0'
  );
  return response;
}

// --- Subscriber Auth Helper ---

function getUserId(request: Request): string | null {
  const cookies = request.headers.get('Cookie') || '';
  const match = cookies.match(/cp_uid=([^;]+)/);
  return match ? match[1] : null;
}

function generateUserId(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(12)))
    .map(b => b.toString(16).padStart(2, '0')).join('');
}

function setUserIdCookie(response: Response, uid: string): void {
  response.headers.append(
    'Set-Cookie',
    `cp_uid=${uid}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${365 * 24 * 60 * 60}`
  );
}

/*
async function getSubscriberEmail(request: Request): Promise<string | null> {
  const cookies = request.headers.get('Cookie') || '';
  const match = cookies.match(/royalty_access=([^;]+)/);
  if (!match) return null;
  const data = await verifyRoyaltyKey(match[1]);
  return data.valid ? (data.email || null) : null;
}
*/

// --- Font List (dynamic from upstream repo) ---

const FONT_SOURCE_PATH = 'lib/EpdFont/builtinFonts/source';
const UPSTREAM_REPO = 'crosspoint-reader/crosspoint-reader';
const FONT_CACHE_KEY = 'font-tree';
const FONT_CACHE_TTL = 60 * 60; // 1 hour

async function fetchFontTree(env: Env): Promise<FontTree> {
  const cached = await env.BUILD_META.get(FONT_CACHE_KEY);
  if (cached) {
    const tree: FontTree = JSON.parse(cached);
    // Use cache if less than 1 hour old
    if (Date.now() - new Date(tree.fetchedAt).getTime() < FONT_CACHE_TTL * 1000) {
      return tree;
    }
  }

  const ghHeaders: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'CrossPoint-Tools',
  };
  if (env.GITHUB_TOKEN) {
    ghHeaders.Authorization = `Bearer ${env.GITHUB_TOKEN}`;
  }

  // Fetch the git tree for the source fonts directory recursively
  const res = await fetch(
    `https://api.github.com/repos/${UPSTREAM_REPO}/contents/${FONT_SOURCE_PATH}`,
    { headers: ghHeaders }
  );
  if (!res.ok) {
    // Return cached even if stale, or empty
    if (cached) return JSON.parse(cached);
    return { families: {}, defaultSizes: {}, fetchedAt: new Date().toISOString() };
  }

  const dirs = await res.json() as Array<{ name: string; type: string }>;
  const families: Record<string, FontFile[]> = {};

  // Fetch each family directory
  for (const dir of dirs) {
    if (dir.type !== 'dir') continue;
    const familyRes = await fetch(
      `https://api.github.com/repos/${UPSTREAM_REPO}/contents/${FONT_SOURCE_PATH}/${dir.name}`,
      { headers: ghHeaders }
    );
    if (!familyRes.ok) continue;
    const files = await familyRes.json() as Array<{ name: string; type: string }>;
    const fontFiles: FontFile[] = files
      .filter(f => f.type === 'file' && /\.(ttf|otf)$/i.test(f.name))
      .map(f => ({
        name: f.name,
        path: `${dir.name}/${f.name}`,
        family: dir.name,
      }));
    if (fontFiles.length > 0) {
      families[dir.name] = fontFiles;
    }
  }

  const defaultSizes: Record<string, number[]> = {
    NotoSerif: [12, 14, 16, 18],
    NotoSans: [12, 14, 16, 18],
    OpenDyslexic: [8, 10, 12, 14],
  };
  const tree: FontTree = { families, defaultSizes, fetchedAt: new Date().toISOString() };
  await env.BUILD_META.put(FONT_CACHE_KEY, JSON.stringify(tree), { expirationTtl: FONT_CACHE_TTL * 2 });
  return tree;
}

async function handleFontList(
  env: Env,
  headers: Record<string, string>
): Promise<Response> {
  const tree = await fetchFontTree(env);
  return json(tree, 200, headers);
}

// --- Custom Font Build ---

const CUSTOM_BUILD_LOCK_TTL = 30 * 60; // 30 minutes

function generateBuildId(): string {
  const ts = Math.floor(Date.now() / 1000);
  const rand = Array.from(crypto.getRandomValues(new Uint8Array(3)))
    .map(b => b.toString(16).padStart(2, '0')).join('');
  return `cf-${ts}-${rand}`;
}

// Validate TTF/OTF magic bytes
function isValidFontFile(data: ArrayBuffer): boolean {
  if (data.byteLength < 4) return false;
  const view = new DataView(data);
  const magic = view.getUint32(0);
  return (
    magic === 0x00010000 || // TrueType
    magic === 0x4F54544F || // OpenType (OTTO)
    magic === 0x74727565    // TrueType (alternate)
  );
}

async function handleCustomBuildUpload(
  request: Request,
  env: Env,
  headers: Record<string, string>
): Promise<Response> {
  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405, headers);
  }

  let uid = getUserId(request);
  if (!uid) uid = generateUserId();

  // Check global build lock
  const lock = await env.BUILD_META.get('custom-build-lock');
  if (lock) {
    return json({ error: 'A custom build is already in progress. Please try again in a few minutes.' }, 409, headers);
  }

  // Parse multipart form data
  const formData = await request.formData();
  const replacements: Map<string, File> = new Map();
  const fontLabels: Record<string, string> = {};
  const fontSizes: Record<string, number[]> = {};

  for (const [key, value] of formData.entries() as IterableIterator<[string, string | File]>) {
    // Font labels come as "label:FamilyName" -> "Custom Name"
    if (typeof value === 'string' && key.startsWith('label:')) {
      const family = key.slice(6);
      if (value.trim()) fontLabels[family] = value.trim();
      continue;
    }
    // Font sizes come as "sizes:FamilyName" -> "10,12,14,16"
    if (typeof value === 'string' && key.startsWith('sizes:')) {
      const family = key.slice(6);
      const sizes = value.split(',').map(s => parseInt(s.trim(), 10));
      if (sizes.length !== 4 || sizes.some(s => isNaN(s) || s < 6 || s > 30)) {
        return json({ error: `Invalid font sizes for ${family}: need 4 values between 6-30` }, 400, headers);
      }
      if (sizes[0] >= sizes[1] || sizes[1] >= sizes[2] || sizes[2] >= sizes[3]) {
        return json({ error: `Font sizes for ${family} must be in ascending order` }, 400, headers);
      }
      fontSizes[family] = sizes;
      continue;
    }
    if (typeof value === 'string') continue;
    // Key is the font path, e.g. "NotoSerif/NotoSerif-Regular.ttf"
    if (!key.includes('/') || !/\.(ttf|otf)$/i.test(key)) {
      return json({ error: `Invalid font path: ${key}` }, 400, headers);
    }
    if (value.size > 5 * 1024 * 1024) {
      return json({ error: `File too large: ${value.name} (max 5 MB)` }, 400, headers);
    }
    replacements.set(key, value);
  }

  if (replacements.size === 0) {
    return json({ error: 'No font files provided' }, 400, headers);
  }

  // Validate font files
  const buildId = generateBuildId();
  const replacedFonts: Record<string, string> = {};
  const validatedFiles: Map<string, ArrayBuffer> = new Map();

  for (const [path, file] of replacements) {
    const data = await file.arrayBuffer();
    if (!isValidFontFile(data)) {
      return json({ error: `Invalid font file: ${file.name}` }, 400, headers);
    }
    validatedFiles.set(path, data);
    replacedFonts[path] = file.name;
  }

  // Auto-fill missing variants within each touched family
  const fontTree = await fetchFontTree(env);
  const touchedFamilies = new Map<string, Set<string>>();
  for (const path of validatedFiles.keys()) {
    const family = path.split('/')[0];
    if (!touchedFamilies.has(family)) touchedFamilies.set(family, new Set());
    touchedFamilies.get(family)!.add(path);
  }

  const autoFilled: Record<string, string> = {};  // path -> source filename
  for (const [family, uploadedPaths] of touchedFamilies) {
    const allVariants = fontTree.families[family];
    if (!allVariants) continue;
    const missingPaths = allVariants
      .map(f => f.path)
      .filter(p => !uploadedPaths.has(p));
    if (missingPaths.length === 0) continue;

    // Pick the best source: prefer Regular, then first uploaded
    const regularPath = [...uploadedPaths].find(p => /regular/i.test(p));
    const sourcePath = regularPath || [...uploadedPaths][0];
    const sourceData = validatedFiles.get(sourcePath)!;
    const sourceName = replacedFonts[sourcePath];

    for (const missing of missingPaths) {
      validatedFiles.set(missing, sourceData);
      replacedFonts[missing] = `${sourceName} (auto-filled)`;
      autoFilled[missing] = sourceName;
    }
  }

  // Upload all font files to R2
  for (const [path, data] of validatedFiles) {
    await env.FIRMWARE_BUCKET.put(`builds/custom/${buildId}/fonts/${path}`, data);
  }

  // Set lock, user mapping, and build metadata
  await env.BUILD_META.put('custom-build-lock', buildId, { expirationTtl: CUSTOM_BUILD_LOCK_TTL });
  await env.BUILD_META.put(`custom-build:user:${uid}`, buildId);

  const meta: CustomBuildMetadata = {
    buildId,
    status: 'pending',
    email: uid,
    createdAt: new Date().toISOString(),
    replacedFonts,
    fontLabels: Object.keys(fontLabels).length > 0 ? fontLabels : undefined,
    fontSizes: Object.keys(fontSizes).length > 0 ? fontSizes : undefined,
  };
  await env.BUILD_META.put(`custom-build:${buildId}`, JSON.stringify(meta));

  // Dispatch GitHub Actions workflow
  const ghRes = await fetch(
    'https://api.github.com/repos/SoFriendly/crosspoint-tools/actions/workflows/build-custom-firmware.yml/dispatches',
    {
      method: 'POST',
      headers: {
        'User-Agent': 'crosspoint-tools',
        Authorization: `Bearer ${env.GITHUB_TOKEN}`,
        Accept: 'application/vnd.github.v3+json',
      },
      body: JSON.stringify({
        ref: 'master',
        inputs: {
          buildId,
          fonts: JSON.stringify(Object.keys(replacedFonts)),
          fontLabels: JSON.stringify(fontLabels),
          fontSizes: JSON.stringify(fontSizes),
        },
      }),
    }
  );

  if (!ghRes.ok) {
    // Clean up on dispatch failure
    await env.BUILD_META.delete('custom-build-lock');
    await env.BUILD_META.delete(`custom-build:${buildId}`);
    const body = await ghRes.text();
    console.error(`Custom build dispatch failed: ${ghRes.status} ${body}`);
    return json({ error: 'Failed to start build' }, 502, headers);
  }

  const response = json({ buildId, autoFilled }, 202, headers);
  setUserIdCookie(response, uid);
  return response;
}

async function handleCustomBuildStatus(
  request: Request,
  env: Env,
  headers: Record<string, string>
): Promise<Response> {
  const uid = getUserId(request);
  if (!uid) {
    return json({ build: null }, 200, headers);
  }

  const buildId = await env.BUILD_META.get(`custom-build:user:${uid}`);
  if (!buildId) {
    return json({ build: null }, 200, headers);
  }

  const raw = await env.BUILD_META.get(`custom-build:${buildId}`);
  if (!raw) {
    return json({ build: null }, 200, headers);
  }

  const meta: CustomBuildMetadata = JSON.parse(raw);
  return json({ build: meta }, 200, headers);
}

async function handleCustomBuildFirmware(
  request: Request,
  env: Env,
  headers: Record<string, string>
): Promise<Response> {
  const uid = getUserId(request);
  if (!uid) {
    return json({ error: 'No custom build found' }, 404, headers);
  }

  const buildId = await env.BUILD_META.get(`custom-build:user:${uid}`);
  if (!buildId) {
    return json({ error: 'No custom build found' }, 404, headers);
  }

  const object = await env.FIRMWARE_BUCKET.get(`builds/custom/${buildId}/firmware.bin`);
  if (!object) {
    return json({ error: 'Firmware not available' }, 404, headers);
  }

  return new Response(object.body, {
    headers: {
      ...headers,
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': 'attachment; filename="crosspoint-custom.bin"',
      'Content-Length': String(object.size),
    },
  });
}

// Clear a user's custom build so they can start over
async function handleCustomBuildClear(
  request: Request,
  env: Env,
  headers: Record<string, string>
): Promise<Response> {
  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405, headers);
  }

  const uid = getUserId(request);
  if (!uid) {
    return json({ ok: true }, 200, headers);
  }

  const buildId = await env.BUILD_META.get(`custom-build:user:${uid}`);
  if (buildId) {
    const raw = await env.BUILD_META.get(`custom-build:${buildId}`);
    if (raw) {
      const meta: CustomBuildMetadata = JSON.parse(raw);
      await env.BUILD_META.delete(`custom-build:user:${uid}`);
      await env.BUILD_META.delete(`custom-build:${buildId}`);
      // Release lock if this build holds it
      const lock = await env.BUILD_META.get('custom-build-lock');
      if (lock === buildId) {
        await env.BUILD_META.delete('custom-build-lock');
      }
    }
  }

  return json({ ok: true }, 200, headers);
}

// Called by GitHub Actions to download uploaded font files
async function handleCustomBuildFontDownload(
  request: Request,
  url: URL,
  env: Env,
  headers: Record<string, string>
): Promise<Response> {
  const auth = request.headers.get('Authorization');
  if (auth !== `Bearer ${env.GITHUB_WEBHOOK_SECRET}`) {
    return json({ error: 'Unauthorized' }, 401, headers);
  }

  // Path: /api/custom-build/fonts/{buildId}/{family}/{filename}
  const parts = url.pathname.replace('/api/custom-build/fonts/', '').split('/');
  if (parts.length !== 3) {
    return json({ error: 'Invalid path' }, 400, headers);
  }
  const [buildId, family, filename] = parts;

  const object = await env.FIRMWARE_BUCKET.get(`builds/custom/${buildId}/fonts/${family}/${filename}`);
  if (!object) {
    return json({ error: 'Font not found' }, 404, headers);
  }

  return new Response(object.body, {
    headers: {
      ...headers,
      'Content-Type': 'application/octet-stream',
      'Content-Length': String(object.size),
    },
  });
}

// Called by GitHub Actions to upload the built firmware
async function handleCustomBuildUploadResult(
  request: Request,
  env: Env,
  headers: Record<string, string>
): Promise<Response> {
  if (request.method !== 'PUT') {
    return json({ error: 'Method not allowed' }, 405, headers);
  }

  const auth = request.headers.get('Authorization');
  if (auth !== `Bearer ${env.GITHUB_WEBHOOK_SECRET}`) {
    return json({ error: 'Unauthorized' }, 401, headers);
  }

  const buildId = request.headers.get('X-Build-Id');
  if (!buildId) {
    return json({ error: 'Missing X-Build-Id header' }, 400, headers);
  }

  const firmwareData = await request.arrayBuffer();
  await env.FIRMWARE_BUCKET.put(`builds/custom/${buildId}/firmware.bin`, firmwareData);

  return json({ ok: true, size: firmwareData.byteLength }, 200, headers);
}

// Called by GitHub Actions to update build status
async function handleCustomBuildStatusUpdate(
  request: Request,
  env: Env,
  headers: Record<string, string>
): Promise<Response> {
  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405, headers);
  }

  const auth = request.headers.get('Authorization');
  if (auth !== `Bearer ${env.GITHUB_WEBHOOK_SECRET}`) {
    return json({ error: 'Unauthorized' }, 401, headers);
  }

  const body = await request.json() as {
    buildId: string;
    status: CustomBuildMetadata['status'];
    firmwareSize?: number;
    version?: string;
    error?: string;
  };

  const raw = await env.BUILD_META.get(`custom-build:${body.buildId}`);
  if (!raw) {
    return json({ error: 'Build not found' }, 404, headers);
  }

  const meta: CustomBuildMetadata = JSON.parse(raw);
  meta.status = body.status;
  if (body.firmwareSize) meta.firmwareSize = body.firmwareSize;
  if (body.version) meta.version = body.version;
  if (body.error) meta.error = body.error;
  if (body.status === 'success' || body.status === 'failed') {
    meta.completedAt = new Date().toISOString();
    // Release the global lock
    await env.BUILD_META.delete('custom-build-lock');
  }

  await env.BUILD_META.put(`custom-build:${body.buildId}`, JSON.stringify(meta));
  return json({ ok: true }, 200, headers);
}

// --- Font Build (.cpfont generation via firmware-repo script) ---
//
// Single source of truth: `lib/EpdFont/scripts/fontconvert_sdcard.py` in the
// crosspoint-reader repo. The web tool uploads TTFs, dispatches a GitHub
// Actions workflow that checks out crosspoint-reader and runs that script
// unmodified, then downloads the resulting .cpfont files. No JS reimplementation.

const FONT_BUILD_LOCK_TTL = 10 * 60;
const FONT_BUILD_STYLES = ['regular', 'bold', 'italic', 'bolditalic'] as const;
type FontBuildStyle = typeof FONT_BUILD_STYLES[number];

async function handleFontBuildUpload(
  request: Request,
  env: Env,
  headers: Record<string, string>
): Promise<Response> {
  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405, headers);
  }

  let uid = getUserId(request);
  if (!uid) uid = generateUserId();

  const lock = await env.BUILD_META.get('font-build-lock');
  if (lock) {
    return json({ error: 'A font build is already in progress. Try again shortly.' }, 409, headers);
  }

  const formData = await request.formData();

  const family = (formData.get('family') as string | null)?.trim();
  if (!family || !/^[A-Za-z0-9 _-]{1,40}$/.test(family)) {
    return json({ error: 'Invalid or missing family name' }, 400, headers);
  }

  const sizesRaw = (formData.get('sizes') as string | null)?.trim() || '';
  const sizes = sizesRaw.split(',').map(s => parseInt(s.trim(), 10));
  if (sizes.length === 0 || sizes.some(s => isNaN(s) || s < 6 || s > 48)) {
    return json({ error: 'Invalid sizes (must be 6–48 pt)' }, 400, headers);
  }

  const intervals = ((formData.get('intervals') as string | null)?.trim() || 'builtin');
  if (!/^[a-zA-Z0-9_,-]{1,200}$/.test(intervals)) {
    return json({ error: 'Invalid intervals' }, 400, headers);
  }

  const uploadedStyles: FontBuildStyle[] = [];
  const validatedFiles = new Map<FontBuildStyle, ArrayBuffer>();
  for (const style of FONT_BUILD_STYLES) {
    const entry = formData.get(style) as string | File | null;
    if (!entry || typeof entry === 'string') continue;
    const file = entry;
    const data = await file.arrayBuffer();
    if (!isValidFontFile(data)) {
      return json({ error: `Invalid font file for ${style}` }, 400, headers);
    }
    validatedFiles.set(style, data);
    uploadedStyles.push(style);
  }

  if (uploadedStyles.length === 0) {
    return json({ error: 'Upload at least one TTF (regular at minimum)' }, 400, headers);
  }
  if (!uploadedStyles.includes('regular')) {
    return json({ error: 'A regular style is required' }, 400, headers);
  }

  const buildId = generateBuildId();

  for (const [style, data] of validatedFiles) {
    await env.FIRMWARE_BUCKET.put(`font-builds/${buildId}/in/${style}.ttf`, data);
  }

  await env.BUILD_META.put('font-build-lock', buildId, { expirationTtl: FONT_BUILD_LOCK_TTL });
  await env.BUILD_META.put(`font-build:user:${uid}`, buildId);

  const meta: FontBuildMetadata = {
    buildId,
    status: 'pending',
    uid,
    family,
    sizes,
    intervals,
    styles: uploadedStyles,
    createdAt: new Date().toISOString(),
  };
  await env.BUILD_META.put(`font-build:${buildId}`, JSON.stringify(meta));

  const ghRes = await fetch(
    'https://api.github.com/repos/SoFriendly/crosspoint-tools/actions/workflows/build-fonts.yml/dispatches',
    {
      method: 'POST',
      headers: {
        'User-Agent': 'crosspoint-tools',
        Authorization: `Bearer ${env.GITHUB_TOKEN}`,
        Accept: 'application/vnd.github.v3+json',
      },
      body: JSON.stringify({
        ref: 'master',
        inputs: {
          buildId,
          family,
          sizes: sizes.join(','),
          intervals,
        },
      }),
    }
  );

  if (!ghRes.ok) {
    await env.BUILD_META.delete('font-build-lock');
    await env.BUILD_META.delete(`font-build:${buildId}`);
    const body = await ghRes.text();
    console.error(`Font build dispatch failed: ${ghRes.status} ${body}`);
    return json({ error: 'Failed to start build' }, 502, headers);
  }

  const response = json({ buildId, styles: uploadedStyles }, 202, headers);
  setUserIdCookie(response, uid);
  return response;
}

async function handleFontBuildStatus(
  request: Request,
  env: Env,
  headers: Record<string, string>
): Promise<Response> {
  const uid = getUserId(request);
  if (!uid) return json({ build: null }, 200, headers);

  const buildId = await env.BUILD_META.get(`font-build:user:${uid}`);
  if (!buildId) return json({ build: null }, 200, headers);

  const raw = await env.BUILD_META.get(`font-build:${buildId}`);
  if (!raw) return json({ build: null }, 200, headers);

  return json({ build: JSON.parse(raw) as FontBuildMetadata }, 200, headers);
}

async function handleFontBuildClear(
  request: Request,
  env: Env,
  headers: Record<string, string>
): Promise<Response> {
  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405, headers);
  }
  const uid = getUserId(request);
  if (!uid) return json({ ok: true }, 200, headers);

  const buildId = await env.BUILD_META.get(`font-build:user:${uid}`);
  if (buildId) {
    await env.BUILD_META.delete(`font-build:user:${uid}`);
    await env.BUILD_META.delete(`font-build:${buildId}`);
    const lock = await env.BUILD_META.get('font-build-lock');
    if (lock === buildId) await env.BUILD_META.delete('font-build-lock');
  }
  return json({ ok: true }, 200, headers);
}

// Workflow downloads input TTFs from here.
async function handleFontBuildFileDownload(
  request: Request,
  url: URL,
  env: Env,
  headers: Record<string, string>
): Promise<Response> {
  const auth = request.headers.get('Authorization');
  if (auth !== `Bearer ${env.GITHUB_WEBHOOK_SECRET}`) {
    return json({ error: 'Unauthorized' }, 401, headers);
  }

  // Path: /api/font-build/files/{buildId}/{style}.ttf
  const parts = url.pathname.replace('/api/font-build/files/', '').split('/');
  if (parts.length !== 2) return json({ error: 'Invalid path' }, 400, headers);
  const [buildId, filename] = parts;
  const style = filename.replace(/\.ttf$/i, '') as FontBuildStyle;
  if (!FONT_BUILD_STYLES.includes(style)) {
    return json({ error: 'Invalid style' }, 400, headers);
  }

  const object = await env.FIRMWARE_BUCKET.get(`font-builds/${buildId}/in/${style}.ttf`);
  if (!object) return json({ error: 'Not found' }, 404, headers);

  return new Response(object.body, {
    headers: {
      ...headers,
      'Content-Type': 'application/octet-stream',
      'Content-Length': String(object.size),
    },
  });
}

// Workflow uploads each .cpfont here. Stored under font-builds/{buildId}/out/.
async function handleFontBuildUploadResult(
  request: Request,
  env: Env,
  headers: Record<string, string>
): Promise<Response> {
  if (request.method !== 'PUT') {
    return json({ error: 'Method not allowed' }, 405, headers);
  }
  const auth = request.headers.get('Authorization');
  if (auth !== `Bearer ${env.GITHUB_WEBHOOK_SECRET}`) {
    return json({ error: 'Unauthorized' }, 401, headers);
  }

  const buildId = request.headers.get('X-Build-Id');
  const filename = request.headers.get('X-Filename');
  if (!buildId || !filename) {
    return json({ error: 'Missing X-Build-Id or X-Filename' }, 400, headers);
  }
  if (!/^[A-Za-z0-9 _.-]+\.cpfont$/.test(filename)) {
    return json({ error: 'Invalid filename' }, 400, headers);
  }

  const data = await request.arrayBuffer();
  await env.FIRMWARE_BUCKET.put(`font-builds/${buildId}/out/${filename}`, data);

  // Track filename in metadata so the client can list outputs.
  const raw = await env.BUILD_META.get(`font-build:${buildId}`);
  if (raw) {
    const meta = JSON.parse(raw) as FontBuildMetadata;
    meta.outputs = Array.from(new Set([...(meta.outputs || []), filename]));
    await env.BUILD_META.put(`font-build:${buildId}`, JSON.stringify(meta));
  }

  return json({ ok: true, size: data.byteLength }, 200, headers);
}

async function handleFontBuildStatusUpdate(
  request: Request,
  env: Env,
  headers: Record<string, string>
): Promise<Response> {
  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405, headers);
  }
  const auth = request.headers.get('Authorization');
  if (auth !== `Bearer ${env.GITHUB_WEBHOOK_SECRET}`) {
    return json({ error: 'Unauthorized' }, 401, headers);
  }

  const body = await request.json() as {
    buildId: string;
    status: FontBuildMetadata['status'];
    readerRef?: string;
    log?: string;
    error?: string;
  };

  const raw = await env.BUILD_META.get(`font-build:${body.buildId}`);
  if (!raw) return json({ error: 'Build not found' }, 404, headers);

  const meta = JSON.parse(raw) as FontBuildMetadata;
  meta.status = body.status;
  if (body.readerRef) meta.readerRef = body.readerRef;
  if (body.log) meta.log = body.log;
  if (body.error) meta.error = body.error;
  if (body.status === 'success' || body.status === 'failed') {
    meta.completedAt = new Date().toISOString();
    await env.BUILD_META.delete('font-build-lock');
  }

  await env.BUILD_META.put(`font-build:${body.buildId}`, JSON.stringify(meta));
  return json({ ok: true }, 200, headers);
}

// User downloads a built .cpfont. Path: /api/font-build/result/{filename}
// Looked up against the user's current build (via cookie), so users can't
// snoop each other's outputs by guessing buildIds.
async function handleFontBuildResultDownload(
  request: Request,
  url: URL,
  env: Env,
  headers: Record<string, string>
): Promise<Response> {
  const uid = getUserId(request);
  if (!uid) return json({ error: 'Not found' }, 404, headers);

  const buildId = await env.BUILD_META.get(`font-build:user:${uid}`);
  if (!buildId) return json({ error: 'Not found' }, 404, headers);

  const filename = url.pathname.replace('/api/font-build/result/', '');
  if (!/^[A-Za-z0-9 _.-]+\.cpfont$/.test(filename)) {
    return json({ error: 'Invalid filename' }, 400, headers);
  }

  const object = await env.FIRMWARE_BUCKET.get(`font-builds/${buildId}/out/${filename}`);
  if (!object) return json({ error: 'Not found' }, 404, headers);

  return new Response(object.body, {
    headers: {
      ...headers,
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': String(object.size),
    },
  });
}

// --- Beta Testing ---

const BETA_LIST_KEY = 'beta-builds';

async function getBetaList(env: Env): Promise<BetaBuild[]> {
  const raw = await env.BUILD_META.get(BETA_LIST_KEY);
  return raw ? JSON.parse(raw) : [];
}

async function saveBetaList(env: Env, list: BetaBuild[]): Promise<void> {
  await env.BUILD_META.put(BETA_LIST_KEY, JSON.stringify(list));
}

async function handleBetaList(
  env: Env,
  headers: Record<string, string>
): Promise<Response> {
  const list = await getBetaList(env);
  return json({ builds: list }, 200, headers);
}

// Resolve a tag on crosspoint-reader to a firmware.bin (or first *.bin) asset
// and stream it back. Used by beta builds whose source is a GitHub release.
async function fetchReleaseFirmware(
  env: Env,
  owner: string,
  repo: string,
  tag: string
): Promise<{ data: ArrayBuffer; assetName: string } | { error: string; status: number }> {
  const ghHeaders: Record<string, string> = {
    'User-Agent': 'crosspoint-tools',
    Accept: 'application/vnd.github+json',
  };
  if (env.GITHUB_TOKEN) ghHeaders.Authorization = `Bearer ${env.GITHUB_TOKEN}`;

  const relRes = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/releases/tags/${encodeURIComponent(tag)}`,
    { headers: ghHeaders }
  );
  if (!relRes.ok) {
    return { error: `Release "${tag}" not found in ${owner}/${repo}`, status: 404 };
  }
  const release = await relRes.json() as { assets?: Array<{ name: string; browser_download_url: string }> };
  const assets = release.assets || [];
  // Prefer firmware.bin, otherwise first .bin asset.
  const asset = assets.find(a => a.name === 'firmware.bin') ||
                assets.find(a => a.name.toLowerCase().endsWith('.bin'));
  if (!asset) {
    return { error: `No .bin asset on release "${tag}"`, status: 422 };
  }

  const binRes = await fetch(asset.browser_download_url, {
    headers: { 'User-Agent': 'crosspoint-tools' },
    redirect: 'follow',
  });
  if (!binRes.ok) {
    return { error: `Failed to download asset (HTTP ${binRes.status})`, status: 502 };
  }
  const data = await binRes.arrayBuffer();
  return { data, assetName: asset.name };
}

async function handleBetaCreate(
  request: Request,
  env: Env,
  headers: Record<string, string>
): Promise<Response> {
  const auth = request.headers.get('Authorization');
  if (auth !== `Bearer ${env.GITHUB_WEBHOOK_SECRET}`) {
    return json({ error: 'Unauthorized' }, 401, headers);
  }

  const formData = await request.formData();
  const name = formData.get('name');
  const notes = formData.get('notes');
  const firmware = formData.get('firmware') as string | File | null;
  const releaseTagRaw = formData.get('releaseTag');
  const releaseTag = typeof releaseTagRaw === 'string' ? releaseTagRaw.trim() : '';
  const releaseRepoRaw = formData.get('releaseRepo');
  const releaseRepo = (typeof releaseRepoRaw === 'string' && releaseRepoRaw.trim())
    ? releaseRepoRaw.trim()
    : 'crosspoint-reader/crosspoint-reader';

  if (!name || typeof name !== 'string' || !name.trim()) {
    return json({ error: 'Name is required' }, 400, headers);
  }

  const id = `beta-${Date.now().toString(36)}`;
  let data: ArrayBuffer;
  let source: BetaSource;
  let version: string | undefined;

  const hasUpload = firmware && typeof firmware !== 'string';
  if (hasUpload && releaseTag) {
    return json({ error: 'Provide either a firmware file OR a release tag, not both' }, 400, headers);
  }

  if (hasUpload) {
    data = await (firmware as File).arrayBuffer();
    source = { type: 'upload' };
  } else if (releaseTag) {
    const [owner, repo] = releaseRepo.split('/');
    if (!owner || !repo) {
      return json({ error: 'Invalid releaseRepo (use "owner/repo")' }, 400, headers);
    }
    const fetched = await fetchReleaseFirmware(env, owner, repo, releaseTag);
    if ('error' in fetched) {
      return json({ error: fetched.error }, fetched.status, headers);
    }
    data = fetched.data;
    source = { type: 'github-release', owner, repo, tag: releaseTag, asset: fetched.assetName };
    version = releaseTag;
  } else {
    return json({ error: 'Provide either a firmware .bin file or a release tag' }, 400, headers);
  }

  const sha256 = await sha256Hex(data);
  await env.FIRMWARE_BUCKET.put(`builds/beta/${id}/firmware.bin`, data, {
    customMetadata: { sha256 },
  });

  const build: BetaBuild = {
    id,
    name: name.trim(),
    notes: (typeof notes === 'string' ? notes.trim() : '') || '',
    version,
    createdAt: new Date().toISOString(),
    firmwareSize: data.byteLength,
    firmwareSha256: sha256,
    source,
  };

  const list = await getBetaList(env);
  list.unshift(build);
  await saveBetaList(env, list);

  return json({ build }, 201, headers);
}

async function handleBetaUpdate(
  request: Request,
  url: URL,
  env: Env,
  headers: Record<string, string>
): Promise<Response> {
  const auth = request.headers.get('Authorization');
  if (auth !== `Bearer ${env.GITHUB_WEBHOOK_SECRET}`) {
    return json({ error: 'Unauthorized' }, 401, headers);
  }

  const id = url.pathname.replace('/api/beta/', '');
  const list = await getBetaList(env);
  const build = list.find(b => b.id === id);

  if (!build) {
    return json({ error: 'Beta build not found' }, 404, headers);
  }

  const body = await request.json() as {
    name?: string;
    notes?: string;
    releaseTag?: string;
    releaseRepo?: string;
  };

  if (body.name !== undefined) {
    if (typeof body.name !== 'string' || !body.name.trim()) {
      return json({ error: 'Name cannot be empty' }, 400, headers);
    }
    build.name = body.name.trim();
  }
  if (body.notes !== undefined) {
    build.notes = typeof body.notes === 'string' ? body.notes.trim() : '';
  }

  // Re-link to (or refresh from) a GitHub release. Replaces the R2 binary in place.
  if (body.releaseTag !== undefined && body.releaseTag !== '') {
    const repoSpec = (body.releaseRepo && body.releaseRepo.trim())
      ? body.releaseRepo.trim()
      : 'crosspoint-reader/crosspoint-reader';
    const [owner, repo] = repoSpec.split('/');
    if (!owner || !repo) {
      return json({ error: 'Invalid releaseRepo (use "owner/repo")' }, 400, headers);
    }
    const fetched = await fetchReleaseFirmware(env, owner, repo, body.releaseTag);
    if ('error' in fetched) {
      return json({ error: fetched.error }, fetched.status, headers);
    }
    const sha = await sha256Hex(fetched.data);
    await env.FIRMWARE_BUCKET.put(`builds/beta/${build.id}/firmware.bin`, fetched.data, {
      customMetadata: { sha256: sha },
    });
    // Drop cached sha so the catalog recomputes against the new bytes.
    await env.BUILD_META.delete(`sha256:beta:${build.id}`);

    build.source = { type: 'github-release', owner, repo, tag: body.releaseTag, asset: fetched.assetName };
    build.version = body.releaseTag;
    build.firmwareSize = fetched.data.byteLength;
    build.firmwareSha256 = sha;
  }

  await saveBetaList(env, list);
  return json({ build }, 200, headers);
}

async function handleBetaDelete(
  request: Request,
  url: URL,
  env: Env,
  headers: Record<string, string>
): Promise<Response> {
  const auth = request.headers.get('Authorization');
  if (auth !== `Bearer ${env.GITHUB_WEBHOOK_SECRET}`) {
    return json({ error: 'Unauthorized' }, 401, headers);
  }

  const id = url.pathname.replace('/api/beta/', '');
  const list = await getBetaList(env);
  const filtered = list.filter(b => b.id !== id);

  if (filtered.length === list.length) {
    return json({ error: 'Beta build not found' }, 404, headers);
  }

  await env.FIRMWARE_BUCKET.delete(`builds/beta/${id}/firmware.bin`);
  await saveBetaList(env, filtered);

  return json({ ok: true }, 200, headers);
}

async function handleBetaFirmware(
  url: URL,
  env: Env,
  headers: Record<string, string>
): Promise<Response> {
  // Path: /api/beta/{id}/firmware
  const parts = url.pathname.replace('/api/beta/', '').replace('/firmware', '');
  const id = parts;

  const object = await env.FIRMWARE_BUCKET.get(`builds/beta/${id}/firmware.bin`);
  if (!object) {
    return json({ error: 'Firmware not found' }, 404, headers);
  }

  return new Response(object.body, {
    headers: {
      ...headers,
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${id}.bin"`,
      'Content-Length': String(object.size),
    },
  });
}

// --- Catalog (aggregate of stable + insider + beta) ---

interface CatalogRelease {
  id: string;
  channel: 'stable' | 'insider' | 'beta';
  name: string;
  version: string;
  released_at: string;
  firmware_url: string;
  firmware_sha256: string;
  size: number;
  supported_devices: ('x3' | 'x4')[];
}

const ORIGIN = 'https://crosspointreader.com';

async function sha256Hex(data: ArrayBuffer): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, '0')).join('');
}

async function getOrComputeR2Sha(
  env: Env,
  cacheKey: string,
  r2Key: string
): Promise<{ sha: string; size: number } | null> {
  const cached = await env.BUILD_META.get(cacheKey);
  const head = await env.FIRMWARE_BUCKET.head(r2Key);
  if (!head) return null;
  const size = head.size;
  if (cached) return { sha: cached, size };

  const meta = head.customMetadata?.sha256;
  if (meta) {
    await env.BUILD_META.put(cacheKey, meta);
    return { sha: meta, size };
  }

  const obj = await env.FIRMWARE_BUCKET.get(r2Key);
  if (!obj) return null;
  const buf = await obj.arrayBuffer();
  const sha = await sha256Hex(buf);
  await env.BUILD_META.put(cacheKey, sha);
  return { sha, size };
}

async function fetchStableForCatalog(env: Env): Promise<CatalogRelease | null> {
  try {
    const res = await fetch(
      'https://api.github.com/repos/crosspoint-reader/crosspoint-reader/releases/latest',
      { headers: ghFetchHeaders(env), cf: { cacheTtl: 300, cacheEverything: true } as RequestInitCfProperties }
    );
    if (!res.ok) return null;
    const release = await res.json() as {
      tag_name: string;
      name: string;
      published_at: string;
      body: string;
      assets: Array<{ name: string; browser_download_url: string; size: number }>;
    };
    const asset = release.assets.find(a => a.name.endsWith('firmware.bin'));
    if (!asset) return null;

    const cacheKey = `sha256:stable:${release.tag_name}`;
    let sha = await env.BUILD_META.get(cacheKey);
    if (!sha) {
      const fwRes = await fetch(asset.browser_download_url, {
        headers: { 'User-Agent': 'crosspoint-tools' },
      });
      if (!fwRes.ok) return null;
      const buf = await fwRes.arrayBuffer();
      sha = await sha256Hex(buf);
      await env.BUILD_META.put(cacheKey, sha);
    }

    return {
      id: `stable-${release.tag_name}`,
      channel: 'stable',
      name: release.name || release.tag_name,
      version: release.tag_name,
      released_at: release.published_at,
      firmware_url: `${ORIGIN}/api/release/firmware`,
      firmware_sha256: sha,
      size: asset.size,
      supported_devices: ['x4'],
    };
  } catch (err) {
    console.error('Stable catalog fetch failed:', err);
    return null;
  }
}

async function fetchInsiderForCatalog(env: Env): Promise<CatalogRelease | null> {
  const raw = await env.BUILD_META.get('latest-build');
  if (!raw) return null;
  const meta: BuildMetadata = JSON.parse(raw);
  if (meta.status !== 'success') return null;

  const cacheKey = `sha256:insider:${meta.commit}`;
  const result = await getOrComputeR2Sha(env, cacheKey, 'builds/latest/firmware.bin');
  if (!result) return null;

  return {
    id: `insider-${meta.commitShort}`,
    channel: 'insider',
    name: `master-${meta.commitShort}`,
    version: meta.version || `master-${meta.commitShort}`,
    released_at: meta.buildDate,
    firmware_url: `${ORIGIN}/api/build/firmware`,
    firmware_sha256: result.sha,
    size: meta.firmwareSize || result.size,
    supported_devices: ['x3', 'x4'],
  };
}

async function fetchBetasForCatalog(env: Env): Promise<CatalogRelease[]> {
  const list = await getBetaList(env);
  const out: CatalogRelease[] = [];
  for (const b of list) {
    let sha = b.firmwareSha256;
    let size = b.firmwareSize;
    if (!sha) {
      const result = await getOrComputeR2Sha(env, `sha256:beta:${b.id}`, `builds/beta/${b.id}/firmware.bin`);
      if (!result) continue;
      sha = result.sha;
      size = result.size;
    }
    out.push({
      id: b.id,
      channel: 'beta',
      name: b.name,
      version: b.version || b.name,
      released_at: b.createdAt,
      firmware_url: `${ORIGIN}/api/beta/${b.id}/firmware`,
      firmware_sha256: sha,
      size,
      supported_devices: ['x3', 'x4'],
    });
  }
  return out;
}

async function handleCatalog(
  env: Env,
  headers: Record<string, string>
): Promise<Response> {
  const [stable, insider, betas] = await Promise.all([
    fetchStableForCatalog(env),
    fetchInsiderForCatalog(env),
    fetchBetasForCatalog(env),
  ]);

  const releases: CatalogRelease[] = [];
  if (stable) releases.push(stable);
  if (insider) releases.push(insider);
  for (const b of betas) releases.push(b);

  return json({
    schema_version: 1,
    generated_at: new Date().toISOString(),
    releases,
  }, 200, {
    ...headers,
    'Cache-Control': 'public, max-age=300',
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
