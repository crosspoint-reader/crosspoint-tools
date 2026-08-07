import type { BetaBuild, BetaSource, FirmwareDevice } from './types';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function normalizeSource(value: unknown): BetaSource {
  if (!isRecord(value) || value.type !== 'github-release') return { type: 'upload' };

  const owner = optionalString(value.owner);
  const repo = optionalString(value.repo);
  const tag = optionalString(value.tag);
  const asset = optionalString(value.asset);
  if (!owner || !repo || !tag || !asset) return { type: 'upload' };

  return { type: 'github-release', owner, repo, tag, asset };
}

function normalizeHiddenDevices(value: unknown): FirmwareDevice[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const devices: FirmwareDevice[] = [];
  for (const item of value) {
    if ((item === 'x3' || item === 'x4') && !devices.includes(item)) devices.push(item);
  }
  return devices.length ? devices : undefined;
}

export function normalizeBetaBuild(value: unknown): BetaBuild | null {
  if (!isRecord(value)) return null;

  const id = optionalString(value.id);
  const title = optionalString(value.title) || optionalString(value.name);
  if (!id || !title) return null;

  const createdAt = optionalString(value.createdAt) || new Date(0).toISOString();
  const updatedAt = optionalString(value.updatedAt) || createdAt;
  const binaryUpdatedAt = optionalString(value.binaryUpdatedAt) || updatedAt;
  const hiddenDevices = normalizeHiddenDevices(value.hiddenDevices);
  const firmwareSha256 = optionalString(value.firmwareSha256);

  return {
    id,
    title,
    version: optionalString(value.version) || '',
    name: title,
    notes: typeof value.notes === 'string' ? value.notes : '',
    createdAt,
    updatedAt,
    binaryUpdatedAt,
    firmwareSize: typeof value.firmwareSize === 'number' && Number.isFinite(value.firmwareSize)
      ? value.firmwareSize
      : 0,
    ...(firmwareSha256 ? { firmwareSha256 } : {}),
    source: normalizeSource(value.source),
    ...(hiddenDevices ? { hiddenDevices } : {}),
  };
}

export function normalizeBetaBuildList(value: unknown): BetaBuild[] {
  if (!Array.isArray(value)) return [];
  const builds: BetaBuild[] = [];
  for (const item of value) {
    const build = normalizeBetaBuild(item);
    if (build) builds.push(build);
  }
  return builds;
}

export function betaDisplayName(build: Pick<BetaBuild, 'title' | 'version'>): string {
  return [build.title.trim(), build.version.trim()].filter(Boolean).join(' ');
}

export function betaVisibleOnDevice(
  build: Pick<BetaBuild, 'hiddenDevices'>,
  device: FirmwareDevice
): boolean {
  return !(build.hiddenDevices || []).includes(device);
}

export function betaDevices(build: Pick<BetaBuild, 'hiddenDevices'>): FirmwareDevice[] {
  return (['x3', 'x4'] as const).filter(device => betaVisibleOnDevice(build, device));
}

export function betaComponentDescription(builds: BetaBuild[], device: FirmwareDevice): string {
  const labels = builds
    .filter(build => betaVisibleOnDevice(build, device))
    .map(betaDisplayName);

  if (labels.length === 0) return 'No active beta builds.';
  if (labels.length === 1) return `Current build: ${labels[0]}.`;
  return `Current builds: ${labels.join('; ')}.`;
}

export function betaNotificationMessage(
  build: Pick<BetaBuild, 'title' | 'version' | 'notes' | 'hiddenDevices'>,
  kind: 'created' | 'binary-replaced'
): string {
  const displayName = betaDisplayName(build);
  const deviceNames = betaDevices(build)
    .map(device => `Xteink ${device.toUpperCase()}`)
    .join(' and ');
  const action = kind === 'created' ? 'is now available' : 'has a new firmware binary';
  const notes = build.notes.trim();

  return [
    `${displayName} ${action} for ${deviceNames}.`,
    ...(notes ? [`What's new:\n${notes}`] : []),
    'Flash it at https://crosspointreader.com/#flash-tools',
  ].join('\n\n');
}
