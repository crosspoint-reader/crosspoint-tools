export type AccessoryType = 'ready-made' | '3d-print';

export function isAccessoryType(value: unknown): value is AccessoryType {
  return value === 'ready-made' || value === '3d-print';
}

const LEGACY_PRINT_SITES = new Map([
  ['makerworld.com', /^\/(?:[a-z]{2}\/)?models\//],
  ['makeronline.com', /^\/(?:[a-z]{2}\/)?model\//],
  ['printables.com', /^\/(?:[a-z]{2}\/)?model\//],
]);

export function getAccessoryType(item: { accessoryType?: unknown; link?: string }): AccessoryType {
  if (isAccessoryType(item.accessoryType)) return item.accessoryType;

  // Existing catalog entries lack a type. Recognize their model-page links until an admin assigns one.
  try {
    const url = new URL(item.link || '');
    const modelPath = LEGACY_PRINT_SITES.get(url.hostname.replace(/^www\./, ''));
    if (modelPath?.test(url.pathname)) return '3d-print';
  } catch {
    // An empty or invalid legacy link does not identify a printable model.
  }
  return 'ready-made';
}
