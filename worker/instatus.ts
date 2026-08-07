import {
  betaComponentDescription,
  betaDevices,
  betaDisplayName,
  betaNotificationMessage,
} from './betas.ts';
import type { BetaBuild, Env, FirmwareDevice } from './types';

type BetaNotification = {
  kind: 'created' | 'binary-replaced';
  build: BetaBuild;
};

export type DeviceBuildStatusDevice = 'x4pro' | 'sticky' | 'm5paper' | 'lilygo';

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
  deviceBuilds: Partial<Record<DeviceBuildStatusDevice, PublishedBuildStatus | null>>;
};

type InstatusConfig = {
  apiKey: string;
  pageId: string;
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
  translations?: unknown;
};

type ComponentTarget = {
  name: string;
  groupId?: string;
  componentId?: string;
  order: number;
};

const NOTIFIED_KEY_PREFIX = 'instatus:notified:';

function getInstatusConfig(env: Env): InstatusConfig | null {
  if (!env.INSTATUS_API_KEY || !env.INSTATUS_PAGE_ID) return null;
  return {
    apiKey: env.INSTATUS_API_KEY,
    pageId: env.INSTATUS_PAGE_ID,
  };
}

function componentGroupId(component: InstatusComponent): string | undefined {
  return typeof component.group === 'string' ? component.group : component.group?.id;
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

function deviceBuildTarget(env: Env, device: DeviceBuildStatusDevice): ComponentTarget {
  const targets: Record<DeviceBuildStatusDevice, ComponentTarget> = {
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
  };
  return requireTarget(targets[device], `${device} beta`);
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
    throw new Error(`Instatus ${response.status}: ${responseText.slice(0, 300)}`);
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
        ...(current.translations ? { translations: current.translations } : {}),
      }),
    }
  );
  current.description = description;
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
  options: { notifyStable?: boolean; notifyInsider?: boolean } = {}
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
      updateComponent(
        config,
        stableTarget(env, device),
        `Current version: ${build.version}. Stable CrossPoint firmware for the Xteink ${device.toUpperCase()}.`,
        components
      )
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
    const ids = await Promise.all((['x3', 'x4'] as const).map(device =>
      updateComponent(
        config,
        insiderTarget(env, device),
        `Current version: ${build.version}. Nightly/Insider CrossPoint firmware for the Xteink ${device.toUpperCase()}.`,
        components
      )
    ));
    if (options.notifyInsider) {
      await publishNotificationOnce(
        env,
        config,
        'insider',
        build.fingerprint,
        ids,
        `New Insider build: ${build.version}`,
        `CrossPoint Insider ${build.version} is now available for Xteink X3 and X4.\n\nDownload it at https://crosspointreader.com/insider`
      );
    }
  }

  await Promise.all((Object.keys(DEVICE_BUILD_COPY) as DeviceBuildStatusDevice[]).map(device => {
    const build = snapshot.deviceBuilds[device] || null;
    const copy = DEVICE_BUILD_COPY[device];
    return updateComponent(
      config,
      deviceBuildTarget(env, device),
      build ? `Current version: ${build.name}. ${copy.description}` : 'No build is currently available.',
      components
    );
  }));
}

export async function reconcileBetaStatus(
  env: Env,
  builds: BetaBuild[],
  notification?: BetaNotification
): Promise<void> {
  const config = getInstatusConfig(env);
  if (!config) return;

  const componentIds = await Promise.all((['x3', 'x4'] as const).map(device =>
    updateComponent(config, betaTarget(env, device), betaComponentDescription(builds, device))
  ));

  if (!notification) return;
  const devices = betaDevices(notification.build);
  if (devices.length === 0) return;
  const ids = devices.map(device => componentIds[device === 'x3' ? 0 : 1]);
  const displayName = betaDisplayName(notification.build);
  await publishNotification(
    config,
    ids,
    notification.kind === 'created' ? `New beta: ${displayName}` : `Beta updated: ${displayName}`,
    betaNotificationMessage(notification.build, notification.kind)
  );
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
      `Current version: ${build.version}. Stable CrossPoint firmware for the Xteink ${device.toUpperCase()}.`
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
  build: PublishedBuildStatus,
  notify = false
): Promise<void> {
  const config = getInstatusConfig(env);
  if (!config) return;
  const ids = await Promise.all((['x3', 'x4'] as const).map(device =>
    updateComponent(
      config,
      insiderTarget(env, device),
      `Current version: ${build.version}. Nightly/Insider CrossPoint firmware for the Xteink ${device.toUpperCase()}.`
    )
  ));
  if (notify) {
    await publishNotificationOnce(
      env,
      config,
      'insider',
      build.fingerprint,
      ids,
      `New Insider build: ${build.version}`,
      `CrossPoint Insider ${build.version} is now available for Xteink X3 and X4.\n\nDownload it at https://crosspointreader.com/insider`
    );
  }
}

const DEVICE_BUILD_COPY: Record<DeviceBuildStatusDevice, { label: string; description: string }> = {
  x4pro: { label: 'X4 Pro', description: 'CrossPoint beta firmware for the Xteink X4 Pro.' },
  sticky: { label: 'Sticky', description: 'CrossPoint firmware for the Seeed Studio reTerminal E1001/E1002.' },
  m5paper: { label: 'M5Paper', description: 'CrossPoint firmware for the M5Stack M5Paper.' },
  lilygo: { label: 'LilyGo T5', description: 'CrossPoint firmware for the LilyGo T5.' },
};

export async function reconcileDeviceBuildStatus(
  env: Env,
  device: DeviceBuildStatusDevice,
  build: PublishedBuildStatus | null,
  notify = false
): Promise<void> {
  const config = getInstatusConfig(env);
  if (!config) return;
  const copy = DEVICE_BUILD_COPY[device];
  const description = build
    ? `Current version: ${build.name}. ${copy.description}`
    : 'No build is currently available.';
  const id = await updateComponent(config, deviceBuildTarget(env, device), description);
  if (notify && build) {
    const notes = limitedNotes(build.notes);
    await publishNotificationOnce(
      env,
      config,
      `device:${device}`,
      build.fingerprint,
      [id],
      `New ${copy.label} build: ${build.name}`,
      [
        `${build.name} is now available for ${copy.label}.`,
        ...(notes ? [`What's new:\n${notes}`] : []),
        'Flash it at https://crosspointreader.com/#flash-tools',
      ].join('\n\n')
    );
  }
}
