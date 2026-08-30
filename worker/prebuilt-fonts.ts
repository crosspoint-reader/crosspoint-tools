import type { Env } from './types';

export interface PrebuiltFontFile {
  name: string;
  size: number;
  crc32: number;
}

export interface PrebuiltFontFamily {
  name: string;
  description: string;
  files: PrebuiltFontFile[];
}

export interface PrebuiltFontManifest {
  version: number;
  baseUrl: string;
  families: PrebuiltFontFamily[];
}

const MANIFEST_URL =
  'https://github.com/crosspoint-reader/crosspoint-fonts/releases/latest/download/fonts.json';
const CACHE_KEY = 'prebuilt-fonts:latest';
const LAST_GOOD_KEY = 'prebuilt-fonts:last-good';
const CACHE_TTL = 60 * 60;

function isManifest(value: unknown): value is PrebuiltFontManifest {
  if (!value || typeof value !== 'object') return false;
  const manifest = value as Partial<PrebuiltFontManifest>;
  return (
    typeof manifest.version === 'number' &&
    typeof manifest.baseUrl === 'string' &&
    Array.isArray(manifest.families) &&
    manifest.families.every(family =>
      typeof family?.name === 'string' &&
      typeof family.description === 'string' &&
      Array.isArray(family.files) &&
      family.files.every(file =>
        typeof file?.name === 'string' &&
        typeof file.size === 'number'
      )
    )
  );
}

export async function getPrebuiltFontManifest(env: Env): Promise<PrebuiltFontManifest> {
  const cached = await env.BUILD_META.get(CACHE_KEY);
  if (cached) return JSON.parse(cached) as PrebuiltFontManifest;

  try {
    const response = await fetch(MANIFEST_URL, {
      headers: { 'User-Agent': 'CrossPoint-Tools' },
    });
    if (!response.ok) throw new Error(`manifest: ${response.status}`);

    const manifest = await response.json();
    if (!isManifest(manifest)) throw new Error('manifest: invalid schema');

    const body = JSON.stringify(manifest);
    await env.BUILD_META.put(CACHE_KEY, body, { expirationTtl: CACHE_TTL });
    await env.BUILD_META.put(LAST_GOOD_KEY, body);
    return manifest;
  } catch (error) {
    const lastGood = await env.BUILD_META.get(LAST_GOOD_KEY);
    if (lastGood) return JSON.parse(lastGood) as PrebuiltFontManifest;
    throw error;
  }
}

export function getPrebuiltFontAssetUrl(
  manifest: PrebuiltFontManifest,
  filename: string
): URL | null {
  if (!manifest.families.some(family => family.files.some(file => file.name === filename))) {
    return null;
  }

  const baseUrl = new URL(manifest.baseUrl);
  if (
    baseUrl.protocol !== 'https:' ||
    baseUrl.hostname !== 'github.com' ||
    !baseUrl.pathname.startsWith('/crosspoint-reader/crosspoint-fonts/releases/download/')
  ) {
    return null;
  }

  return new URL(encodeURIComponent(filename), baseUrl);
}
