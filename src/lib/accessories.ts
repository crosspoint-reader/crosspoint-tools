export interface ProductLink {
  label: string;
  url: string;
}

export function getProductLinks(item: { links?: ProductLink[]; link?: string }): ProductLink[] {
  return item.links ?? (item.link ? [{ label: '', url: item.link }] : []);
}

// Null means the update did not include links. An empty array explicitly clears them.
export function readProductLinks(formData: FormData): ProductLink[] | null {
  const raw = formData.get('links');
  if (raw === null) {
    const legacy = formData.get('link');
    if (legacy === null) return null;
    return validateProductLinks([{ label: '', url: legacy }]);
  }
  let value: unknown;
  try {
    value = typeof raw === 'string' ? JSON.parse(raw) : null;
  } catch {
    throw new Error('Product links must be a JSON array');
  }
  return validateProductLinks(value);
}

function validateProductLinks(value: unknown): ProductLink[] {
  if (!Array.isArray(value)) throw new Error('Product links must be an array');
  const links: ProductLink[] = [];
  for (const entry of value) {
    if (!entry || typeof entry.label !== 'string' || typeof entry.url !== 'string') {
      throw new Error('Each product link needs a label and URL');
    }
    const label = entry.label.trim();
    const url = entry.url.trim();
    if (!label && !url) continue;
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') throw new Error();
    } catch {
      throw new Error('Each product link must be a valid http(s) URL');
    }
    links.push({ label, url });
  }
  return links;
}

export type AccessoryType = 'ready-made' | '3d-print';

export function isAccessoryType(value: unknown): value is AccessoryType {
  return value === 'ready-made' || value === '3d-print';
}

const LEGACY_PRINT_SITES = new Map([
  ['makerworld.com', /^\/(?:[a-z]{2}\/)?models\//],
  ['makeronline.com', /^\/(?:[a-z]{2}\/)?model\//],
  ['printables.com', /^\/(?:[a-z]{2}\/)?model\//],
]);

export function getAccessoryType(item: { accessoryType?: unknown; link?: string; links?: ProductLink[] }): AccessoryType {
  if (isAccessoryType(item.accessoryType)) return item.accessoryType;

  // Existing catalog entries lack a type. Recognize their model-page links until an admin assigns one.
  for (const link of getProductLinks(item)) {
    try {
      const url = new URL(link.url);
      const modelPath = LEGACY_PRINT_SITES.get(url.hostname.replace(/^www\./, ''));
      if (modelPath?.test(url.pathname)) return '3d-print';
    } catch {
      // An invalid legacy link does not identify a printable model.
    }
  }
  return 'ready-made';
}
