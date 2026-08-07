import {
  betaComponentDescription,
  betaDevices,
  betaDisplayName,
  betaNotificationMessage,
} from './betas';
import type { BetaBuild, Env, FirmwareDevice } from './types';

type BetaNotification = {
  kind: 'created' | 'binary-replaced';
  build: BetaBuild;
};

type InstatusBetaTarget = {
  componentId: string;
  groupId: string;
};

type InstatusComponent = {
  name?: string;
  status?: string;
  showUptime?: boolean;
  order?: number;
  archived?: boolean;
  group?: string | { id?: string } | null;
  translations?: unknown;
};

type InstatusConfig = {
  apiKey: string;
  pageId: string;
  targets: Record<FirmwareDevice, InstatusBetaTarget>;
};

function getInstatusConfig(env: Env): InstatusConfig | null {
  if (
    !env.INSTATUS_API_KEY ||
    !env.INSTATUS_PAGE_ID ||
    !env.INSTATUS_X3_GROUP_ID ||
    !env.INSTATUS_X4_GROUP_ID ||
    !env.INSTATUS_X3_BETA_COMPONENT_ID ||
    !env.INSTATUS_X4_BETA_COMPONENT_ID
  ) {
    return null;
  }

  return {
    apiKey: env.INSTATUS_API_KEY,
    pageId: env.INSTATUS_PAGE_ID,
    targets: {
      x3: {
        componentId: env.INSTATUS_X3_BETA_COMPONENT_ID,
        groupId: env.INSTATUS_X3_GROUP_ID,
      },
      x4: {
        componentId: env.INSTATUS_X4_BETA_COMPONENT_ID,
        groupId: env.INSTATUS_X4_GROUP_ID,
      },
    },
  };
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

async function updateBetaComponent(
  config: InstatusConfig,
  builds: BetaBuild[],
  device: FirmwareDevice
): Promise<void> {
  const target = config.targets[device];
  // Instatus uses PUT for updates. Read the component first so manual grouping,
  // ordering, uptime, and translation settings survive each reconciliation.
  const current = await instatusRequest<InstatusComponent>(
    config,
    `/v2/${config.pageId}/components/${target.componentId}`,
    { method: 'GET' }
  );
  const currentGroupId = typeof current?.group === 'string'
    ? current.group
    : current?.group?.id;

  await instatusRequest(
    config,
    `/v2/${config.pageId}/components/${target.componentId}`,
    {
      method: 'PUT',
      body: JSON.stringify({
        name: current?.name || 'Beta',
        description: betaComponentDescription(builds, device),
        status: 'OPERATIONAL',
        order: typeof current?.order === 'number' ? current.order : 0,
        showUptime: current?.showUptime ?? false,
        grouped: true,
        groupId: currentGroupId || target.groupId,
        archived: current?.archived ?? false,
        ...(current?.translations ? { translations: current.translations } : {}),
      }),
    }
  );
}

async function publishBetaNotification(
  config: InstatusConfig,
  notification: BetaNotification
): Promise<void> {
  const devices = betaDevices(notification.build);
  if (devices.length === 0) return;

  const componentIds = devices.map(device => config.targets[device].componentId);
  const displayName = betaDisplayName(notification.build);
  const name = notification.kind === 'created'
    ? `New beta: ${displayName}`
    : `Beta updated: ${displayName}`;

  await instatusRequest(config, `/v1/${config.pageId}/incidents`, {
    method: 'POST',
    body: JSON.stringify({
      name,
      message: betaNotificationMessage(notification.build, notification.kind),
      components: componentIds,
      started: new Date().toISOString(),
      status: 'RESOLVED',
      notify: true,
      statuses: componentIds.map(id => ({ id, status: 'OPERATIONAL' })),
    }),
  });
}

export async function reconcileBetaStatus(
  env: Env,
  builds: BetaBuild[],
  notification?: BetaNotification
): Promise<void> {
  const config = getInstatusConfig(env);
  if (!config) return;

  await Promise.all([
    updateBetaComponent(config, builds, 'x3'),
    updateBetaComponent(config, builds, 'x4'),
  ]);

  if (notification) await publishBetaNotification(config, notification);
}
