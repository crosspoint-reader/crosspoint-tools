import {
  betaComponentDescription,
  betaDevices,
  betaDisplayName,
  betaNotificationMessage,
} from './betas.ts';
import type { BetaBuild, Env, FirmwareDevice } from './types';

export type BetaNotification = {
  kind: 'created' | 'version-bumped' | 'binary-replaced';
  build: BetaBuild;
};

export type DeviceBuildStatusDevice = 'x4pro' | 'sticky' | 'm5paper' | 'lilygo' | 'papermono';

export type PublishedBuildStatus = {
  name: string;
  version: string;
  fingerprint: string;
  notes?: string;
};

export type ReleaseStatusSnapshot = {
  stable: PublishedBuildStatus | null;
  insider: PublishedBuildStatus | null;
  betas: BetaBuild[];
  deviceBuilds: Partial<Record<DeviceBuildStatusDevice, PublishedBuildStatus[]>>;
};

type InstatusConfig = {
  apiKey: string;
  pageId: string;
};

type InstatusTranslations = {
  name?: Record<string, string> | null;
  description?: Record<string, string> | null;
  [key: string]: unknown;
};

type InstatusComponent = {
  id?: string;
  name?: string;
  status?: string;
  description?: string;
  showUptime?: boolean;
  order?: number;
  archived?: boolean;
  group?: string | { id?: string } | null;
  groupId?: string | null;
  translations?: InstatusTranslations | null;
};

type ComponentTarget = {
  name: string;
  groupId?: string;
  componentId?: string;
  order: number;
};

const NOTIFIED_KEY_PREFIX = 'instatus:notified:';
const PENDING_BETA_NOTIFICATION_PREFIX = 'instatus:pending:beta:';
const PENDING_DEVICE_NOTIFICATION_PREFIX = 'instatus:pending:device:';

function getInstatusConfig(env: Env): InstatusConfig | null {
  if (!env.INSTATUS_API_KEY || !env.INSTATUS_PAGE_ID) return null;
  return {
    apiKey: env.INSTATUS_API_KEY,
    pageId: env.INSTATUS_PAGE_ID,
  };
}

function componentGroupId(component: InstatusComponent): string | undefined {
  return (typeof component.group === 'string' ? component.group : component.group?.id)
    || component.groupId
    || undefined;
}

function localizedDescriptionsMatch(
  translations: InstatusTranslations | null | undefined,
  description: string
): boolean {
  const localized = translations?.description;
  return !localized || Object.values(localized).every(value => value === description);
}

function translationsWithDescription(
  translations: InstatusTranslations | null | undefined,
  description: string
): InstatusTranslations | undefined {
  if (!translations) return undefined;
  const localized = translations.description;
  if (!localized) return translations;
  return {
    ...translations,
    description: Object.fromEntries(Object.keys(localized).map(locale => [locale, description])),
  };
}

function requireTarget(target: ComponentTarget, label: string): ComponentTarget {
  if (!target.groupId) throw new Error(`Missing Instatus group ID for ${label}`);
  return target;
}

function betaTarget(env: Env, device: FirmwareDevice): ComponentTarget {
  return requireTarget(
    device === 'x3'
      ? {
          name: 'Beta',
          groupId: env.INSTATUS_X3_GROUP_ID,
          componentId: env.INSTATUS_X3_BETA_COMPONENT_ID,
          order: 2,
        }
      : {
          name: 'Beta',
          groupId: env.INSTATUS_X4_GROUP_ID,
          componentId: env.INSTATUS_X4_BETA_COMPONENT_ID,
          order: 2,
        },
    `${device} beta`
  );
}

function stableTarget(env: Env, device: FirmwareDevice): ComponentTarget {
  return requireTarget(
    device === 'x3'
      ? {
          name: 'Stable',
          groupId: env.INSTATUS_X3_GROUP_ID,
          componentId: env.INSTATUS_X3_STABLE_COMPONENT_ID,
          order: 0,
        }
      : {
          name: 'Stable',
          groupId: env.INSTATUS_X4_GROUP_ID,
          componentId: env.INSTATUS_X4_STABLE_COMPONENT_ID,
          order: 0,
        },
    `${device} stable`
  );
}

function insiderTarget(env: Env, device: FirmwareDevice): ComponentTarget {
  return requireTarget(
    device === 'x3'
      ? {
          name: 'Nightly',
          groupId: env.INSTATUS_X3_GROUP_ID,
          componentId: env.INSTATUS_X3_NIGHTLY_COMPONENT_ID,
          order: 1,
        }
      : {
          name: 'Nightly',
          groupId: env.INSTATUS_X4_GROUP_ID,
          componentId: env.INSTATUS_X4_NIGHTLY_COMPONENT_ID,
          order: 1,
        },
    `${device} nightly`
  );
}

function deviceBuildTargets(env: Env): Record<DeviceBuildStatusDevice, ComponentTarget> {
  return {
    x4pro: {
      name: 'Beta',
      groupId: env.INSTATUS_X4_PRO_GROUP_ID,
      componentId: env.INSTATUS_X4_PRO_BETA_COMPONENT_ID,
      order: 0,
    },
    sticky: {
      name: 'Beta',
      groupId: env.INSTATUS_STICKY_GROUP_ID,
      componentId: env.INSTATUS_STICKY_BETA_COMPONENT_ID,
      order: 0,
    },
    m5paper: {
      name: 'Beta',
      groupId: env.INSTATUS_M5PAPER_GROUP_ID,
      componentId: env.INSTATUS_M5PAPER_BETA_COMPONENT_ID,
      order: 0,
    },
    lilygo: {
      name: 'Beta',
      groupId: env.INSTATUS_LILYGO_GROUP_ID,
      componentId: env.INSTATUS_LILYGO_BETA_COMPONENT_ID,
      order: 0,
    },
    papermono: {
      name: 'Beta',
      groupId: env.INSTATUS_PAPERMONO_GROUP_ID,
      componentId: env.INSTATUS_PAPERMONO_BETA_COMPONENT_ID,
      order: 0,
    },
  };
}

function deviceBuildTarget(env: Env, device: DeviceBuildStatusDevice): ComponentTarget {
  return requireTarget(deviceBuildTargets(env)[device], `${device} beta`);
}

async function instatusRequest<T = unknown>(
  config: InstatusConfig,
  apiPath: string,
  init: RequestInit
): Promise<T | null> {
  const response = await fetch(`https://api.instatus.com${apiPath}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
      ...init.headers,
    },
  });

  if (!response.ok) {
    const responseText = await response.text();
    throw new Error(`Instatus ${response.status} on ${apiPath}: ${responseText.slice(0, 300)}`);
  }

  const responseText = await response.text();
  return responseText ? JSON.parse(responseText) as T : null;
}

async function resolveComponent(
  config: InstatusConfig,
  target: ComponentTarget,
  description: string,
  knownComponents?: InstatusComponent[]
): Promise<InstatusComponent> {
  if (knownComponents) {
    const known = knownComponents.find(component =>
      (target.componentId && component.id === target.componentId) ||
      (component.name?.toLowerCase() === target.name.toLowerCase() &&
        componentGroupId(component) === target.groupId)
    );
    if (known?.id) return known;
  }

  if (target.componentId) {
    const component = await instatusRequest<InstatusComponent>(
      config,
      `/v2/${config.pageId}/components/${target.componentId}`,
      { method: 'GET' }
    );
    if (!component?.id) throw new Error(`Instatus returned no component for ${target.name}`);
    return component;
  }

  const components = knownComponents || await listComponents(config);
  const existing = (components || []).find(component =>
    component.name?.toLowerCase() === target.name.toLowerCase() &&
    componentGroupId(component) === target.groupId
  );
  if (existing?.id) return existing;

  const created = await instatusRequest<InstatusComponent>(
    config,
    `/v1/${config.pageId}/components`,
    {
      method: 'POST',
      body: JSON.stringify({
        name: target.name,
        description,
        status: 'OPERATIONAL',
        order: target.order,
        showUptime: false,
        grouped: true,
        group: target.groupId,
        archived: false,
      }),
    }
  );
  if (!created?.id) throw new Error(`Instatus did not return an ID for new ${target.name} component`);
  knownComponents?.push(created);
  return created;
}

async function listComponents(config: InstatusConfig): Promise<InstatusComponent[]> {
  return await instatusRequest<InstatusComponent[]>(
    config,
    `/v2/${config.pageId}/components?per_page=100`,
    { method: 'GET' }
  ) || [];
}

async function removeDuplicateComponents(
  config: InstatusConfig,
  target: ComponentTarget,
  components: InstatusComponent[]
): Promise<void> {
  if (!target.componentId) return;
  const duplicates = components.filter(component =>
    component.id &&
    component.id !== target.componentId &&
    component.name?.toLowerCase() === target.name.toLowerCase() &&
    componentGroupId(component) === target.groupId
  );
  await Promise.all(duplicates.map(component =>
    instatusRequest(config, `/v1/${config.pageId}/components/${component.id}`, { method: 'DELETE' })
  ));
  for (const duplicate of duplicates) {
    const index = components.indexOf(duplicate);
    if (index >= 0) components.splice(index, 1);
  }
}

async function updateComponent(
  config: InstatusConfig,
  target: ComponentTarget,
  description: string,
  knownComponents?: InstatusComponent[]
): Promise<string> {
  const current = await resolveComponent(config, target, description, knownComponents);
  if (
    current.name === target.name &&
    current.description === description &&
    current.status === 'OPERATIONAL' &&
    componentGroupId(current) === target.groupId &&
    current.archived !== true &&
    localizedDescriptionsMatch(current.translations, description)
  ) {
    return current.id!;
  }
  const translations = translationsWithDescription(current.translations, description);
  await instatusRequest(
    config,
    `/v2/${config.pageId}/components/${current.id}`,
    {
      method: 'PUT',
      body: JSON.stringify({
        name: target.name,
        description,
        status: 'OPERATIONAL',
        order: typeof current.order === 'number' ? current.order : target.order,
        showUptime: current.showUptime ?? false,
        grouped: true,
        groupId: componentGroupId(current) || target.groupId,
        archived: current.archived ?? false,
        ...(translations ? { translations } : {}),
      }),
    }
  );
  current.description = description;
  current.translations = translations;
  return current.id!;
}

async function publishNotification(
  config: InstatusConfig,
  componentIds: string[],
  name: string,
  message: string
): Promise<void> {
  if (componentIds.length === 0) return;
  await instatusRequest(config, `/v1/${config.pageId}/incidents`, {
    method: 'POST',
    body: JSON.stringify({
      name,
      message,
      components: componentIds,
      started: new Date().toISOString(),
      status: 'RESOLVED',
      notify: true,
      statuses: componentIds.map(id => ({ id, status: 'OPERATIONAL' })),
    }),
  });
}

async function publishNotificationOnce(
  env: Env,
  config: InstatusConfig,
  channel: string,
  fingerprint: string,
  componentIds: string[],
  name: string,
  message: string
): Promise<void> {
  const key = `${NOTIFIED_KEY_PREFIX}${channel}`;
  if (await env.BUILD_META.get(key) === fingerprint) return;
  await publishNotification(config, componentIds, name, message);
  await env.BUILD_META.put(key, fingerprint);
}

function betaNotificationFingerprint(notification: BetaNotification): string {
  const build = notification.build;
  return [
    notification.kind,
    build.version,
    build.firmwareSha256 || build.binaryUpdatedAt,
  ].join(':');
}

function pendingBetaNotificationKey(buildId: string): string {
  return `${PENDING_BETA_NOTIFICATION_PREFIX}${buildId}`;
}

export async function queueBetaNotification(
  env: Env,
  notification: BetaNotification
): Promise<void> {
  if (!getInstatusConfig(env)) return;
  await env.BUILD_META.put(
    pendingBetaNotificationKey(notification.build.id),
    JSON.stringify(notification)
  );
}

// Edits that queue no notification of their own (e.g. a title typo fix) must
// still reach any not-yet-delivered notice, or it fires with the stale copy.
export async function refreshPendingBetaNotification(
  env: Env,
  build: BetaBuild
): Promise<void> {
  const key = pendingBetaNotificationKey(build.id);
  const raw = await env.BUILD_META.get(key);
  if (!raw) return;
  let notification: BetaNotification;
  try {
    notification = JSON.parse(raw) as BetaNotification;
  } catch {
    return;
  }
  await env.BUILD_META.put(key, JSON.stringify({ ...notification, build }));
}

export async function discardPendingBetaNotification(env: Env, buildId: string): Promise<void> {
  await env.BUILD_META.delete(pendingBetaNotificationKey(buildId));
}

async function deliverBetaNotification(
  env: Env,
  config: InstatusConfig,
  notification: BetaNotification
): Promise<void> {
  const devices = betaDevices(notification.build);
  if (devices.length === 0) {
    await env.BUILD_META.delete(pendingBetaNotificationKey(notification.build.id));
    return;
  }

  const componentIds = devices.map(device => betaTarget(env, device).componentId);
  if (componentIds.some(id => !id)) {
    throw new Error('Missing Instatus beta component ID');
  }

  const displayName = betaDisplayName(notification.build);
  const notificationName = notification.kind === 'created'
    ? `New beta: ${displayName}`
    : notification.kind === 'version-bumped'
      ? `New beta release: ${displayName}`
      : `Beta updated: ${displayName}`;

  await publishNotificationOnce(
    env,
    config,
    `beta:${notification.build.id}`,
    betaNotificationFingerprint(notification),
    componentIds as string[],
    notificationName,
    betaNotificationMessage(notification.build, notification.kind)
  );
  await env.BUILD_META.delete(pendingBetaNotificationKey(notification.build.id));
}

export async function flushPendingBetaNotifications(env: Env): Promise<void> {
  const config = getInstatusConfig(env);
  if (!config) return;

  let cursor: string | undefined;
  do {
    const page = await env.BUILD_META.list({
      prefix: PENDING_BETA_NOTIFICATION_PREFIX,
      ...(cursor ? { cursor } : {}),
    });
    for (const key of page.keys) {
      const raw = await env.BUILD_META.get(key.name);
      if (!raw) continue;
      let notification: BetaNotification;
      try {
        notification = JSON.parse(raw) as BetaNotification;
      } catch {
        await env.BUILD_META.delete(key.name);
        continue;
      }
      if (
        !notification?.build?.id ||
        !['created', 'version-bumped', 'binary-replaced'].includes(notification.kind)
      ) {
        await env.BUILD_META.delete(key.name);
        continue;
      }
      await deliverBetaNotification(env, config, notification);
    }
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
}

function limitedNotes(notes?: string): string {
  const clean = (notes || '').trim();
  if (clean.length <= 1500) return clean;
  return `${clean.slice(0, 1497)}...`;
}

// Full-page repair/poll path. Read the component list once so a ten-component
// reconciliation stays comfortably below Instatus's per-endpoint rate limit.
// Immediate upload hooks below still touch only their own component(s).
export async function reconcileReleaseStatusSnapshot(
  env: Env,
  snapshot: ReleaseStatusSnapshot,
  options: { notifyStable?: boolean } = {}
): Promise<void> {
  const config = getInstatusConfig(env);
  if (!config) return;
  const components = await listComponents(config);
  // A deployment-time race briefly created duplicate X3 Stable components
  // before its ID was known. Keep the configured component and remove only
  // same-name siblings from that same group.
  await removeDuplicateComponents(config, stableTarget(env, 'x3'), components);

  await Promise.all((['x3', 'x4'] as const).map(device =>
    updateComponent(
      config,
      betaTarget(env, device),
      betaComponentDescription(snapshot.betas, device),
      components
    )
  ));

  if (snapshot.stable) {
    const build = snapshot.stable;
    const ids = await Promise.all((['x3', 'x4'] as const).map(device =>
      updateComponent(config, stableTarget(env, device), build.version, components)
    ));
    if (options.notifyStable) {
      await publishNotificationOnce(
        env,
        config,
        'stable',
        build.fingerprint,
        ids,
        `New stable release: ${build.version}`,
        `CrossPoint ${build.version} is now available for Xteink X3 and X4.\n\nRelease notes: https://github.com/crosspoint-reader/crosspoint-reader/releases/latest\n\nFlash it at https://crosspointreader.com/#flash-tools`
      );
    }
  }

  if (snapshot.insider) {
    const build = snapshot.insider;
    await Promise.all((['x3', 'x4'] as const).map(device =>
      updateComponent(config, insiderTarget(env, device), build.version, components)
    ));
  }

  // Devices without a configured Instatus group yet (no component to update)
  // are skipped so one unconfigured device doesn't fail the whole snapshot.
  const targets = deviceBuildTargets(env);
  await Promise.all((Object.keys(DEVICE_BUILD_LABELS) as DeviceBuildStatusDevice[])
    .filter(device => targets[device].groupId)
    .map(device => updateComponent(
      config,
      deviceBuildTarget(env, device),
      deviceBuildComponentDescription(snapshot.deviceBuilds[device] || []),
      components
    )));
}

export async function reconcileBetaStatus(
  env: Env,
  builds: BetaBuild[],
  notification?: BetaNotification
): Promise<void> {
  const config = getInstatusConfig(env);
  if (!config) return;

  const componentUpdates = await Promise.allSettled((['x3', 'x4'] as const).map(device =>
    updateComponent(config, betaTarget(env, device), betaComponentDescription(builds, device))
  ));

  if (notification) await deliverBetaNotification(env, config, notification);

  const failedUpdate = componentUpdates.find(
    (result): result is PromiseRejectedResult => result.status === 'rejected'
  );
  if (failedUpdate) throw failedUpdate.reason;
}

export async function reconcileStableStatus(
  env: Env,
  build: PublishedBuildStatus,
  notify = false
): Promise<void> {
  const config = getInstatusConfig(env);
  if (!config) return;
  const ids = await Promise.all((['x3', 'x4'] as const).map(device =>
    updateComponent(
      config,
      stableTarget(env, device),
      build.version
    )
  ));
  if (notify) {
    await publishNotificationOnce(
      env,
      config,
      'stable',
      build.fingerprint,
      ids,
      `New stable release: ${build.version}`,
      `CrossPoint ${build.version} is now available for Xteink X3 and X4.\n\nRelease notes: https://github.com/crosspoint-reader/crosspoint-reader/releases/latest\n\nFlash it at https://crosspointreader.com/#flash-tools`
    );
  }
}

export async function reconcileInsiderStatus(
  env: Env,
  build: PublishedBuildStatus
): Promise<void> {
  const config = getInstatusConfig(env);
  if (!config) return;
  await Promise.all((['x3', 'x4'] as const).map(device =>
    updateComponent(
      config,
      insiderTarget(env, device),
      build.version
    )
  ));
}

const DEVICE_BUILD_LABELS: Record<DeviceBuildStatusDevice, string> = {
  x4pro: 'X4 Pro',
  sticky: 'Sticky',
  m5paper: 'M5Paper',
  lilygo: 'LilyGo T5',
  papermono: 'M5PaperMono',
};

function pendingDeviceNotificationKey(device: DeviceBuildStatusDevice): string {
  return `${PENDING_DEVICE_NOTIFICATION_PREFIX}${device}`;
}

function deviceBuildComponentDescription(builds: PublishedBuildStatus[]): string {
  if (builds.length === 0) return 'No build is currently available.';
  return builds.map(build => build.name).join('; ');
}

// The queued copy carries the full component description alongside the build
// so a cron retry doesn't collapse the component text to just this build's
// name when the device has several.
type PendingDeviceNotification = PublishedBuildStatus & { componentDescription?: string };

// Release bursts (CI uploading several device builds plus insider/stock in the
// same window) can trip Instatus's per-endpoint rate limit, so a notification
// that fails here must survive to be retried by the cron flush below.
async function deliverDeviceBuildNotification(
  env: Env,
  config: InstatusConfig,
  device: DeviceBuildStatusDevice,
  build: PendingDeviceNotification
): Promise<void> {
  const label = DEVICE_BUILD_LABELS[device];
  const id = await updateComponent(
    config,
    deviceBuildTarget(env, device),
    build.componentDescription || build.name
  );
  const notes = limitedNotes(build.notes);
  await publishNotificationOnce(
    env,
    config,
    `device:${device}`,
    build.fingerprint,
    [id],
    `New ${label} build: ${build.name}`,
    [
      `${build.name} is now available for ${label}.`,
      ...(notes ? [`What's new:\n${notes}`] : []),
      'Flash it at https://crosspointreader.com/#flash-tools',
    ].join('\n\n')
  );
  await env.BUILD_META.delete(pendingDeviceNotificationKey(device));
}

export async function reconcileDeviceBuildStatus(
  env: Env,
  device: DeviceBuildStatusDevice,
  builds: PublishedBuildStatus[],
  notify?: PublishedBuildStatus
): Promise<void> {
  const config = getInstatusConfig(env);
  if (!config) return;
  const description = deviceBuildComponentDescription(builds);
  if (notify) {
    const pending: PendingDeviceNotification = { ...notify, componentDescription: description };
    await env.BUILD_META.put(pendingDeviceNotificationKey(device), JSON.stringify(pending));
    await deliverDeviceBuildNotification(env, config, device, pending);
    return;
  }
  // Metadata edits (e.g. a name typo fix) must also reach any queued notice
  // still waiting on delivery, or it fires with the stale copy; a deleted
  // build's queued notice must never fire at all. The queued build is matched
  // back to the list by fingerprint, which survives name/notes edits.
  const key = pendingDeviceNotificationKey(device);
  const queuedRaw = await env.BUILD_META.get(key);
  if (queuedRaw) {
    let queued: PendingDeviceNotification | null = null;
    try {
      queued = JSON.parse(queuedRaw) as PendingDeviceNotification;
    } catch {
      // unreadable — drop it below
    }
    const current = queued && builds.find(build => build.fingerprint === queued!.fingerprint);
    if (current) {
      await env.BUILD_META.put(key, JSON.stringify({ ...current, componentDescription: description }));
    } else {
      await env.BUILD_META.delete(key);
    }
  }
  await updateComponent(config, deviceBuildTarget(env, device), description);
}

export async function flushPendingDeviceNotifications(env: Env): Promise<void> {
  const config = getInstatusConfig(env);
  if (!config) return;

  for (const device of Object.keys(DEVICE_BUILD_LABELS) as DeviceBuildStatusDevice[]) {
    const key = pendingDeviceNotificationKey(device);
    const raw = await env.BUILD_META.get(key);
    if (!raw) continue;
    let build: PublishedBuildStatus;
    try {
      build = JSON.parse(raw) as PublishedBuildStatus;
    } catch {
      await env.BUILD_META.delete(key);
      continue;
    }
    if (!build?.name || !build?.fingerprint) {
      await env.BUILD_META.delete(key);
      continue;
    }
    await deliverDeviceBuildNotification(env, config, device, build);
  }
}
