export type Model = "x3" | "x4" | "x4pro";
export type Locale = "english" | "chinese";
export type Channel = "stable" | "beta" | "insider";
export type Source = "xteink" | "crosspoint_ko" | "crossink";

export const SOURCE_LABELS: Record<Source, string> = {
  xteink: "CrossPoint",
  crosspoint_ko: "CrossPoint KO",
  crossink: "CrossInk",
};

export type StateKind =
  | "idle"
  | "consenting"
  | "selecting_device_and_region"
  | "selecting_firmware"
  | "downloading_firmware"
  | "setting_up_hotspot"
  | "waiting_for_internet_sharing"
  | "awaiting_client"
  | "awaiting_device_request"
  | "awaiting_confirmation"
  | "setting_up_trust"
  | "armed"
  | "serving"
  | "flashing"
  | "verifying"
  | "done"
  | "cleaning_up"
  | "failed";

export interface OrchState {
  kind: StateKind;
}

export interface StateEvent {
  state: OrchState;
  message: string | null;
  error: string | null;
}

export interface CrossPointRelease {
  id: string;
  channel: Channel;
  name: string;
  version: string;
  released_at: string;
  notes?: string;
  firmware_url: string;
  firmware_sha256: string | null;
  size: number;
  supported_devices: Model[];
  variant?: string | null;
  source: Source;
}

export interface Catalog {
  schema_version: number;
  releases: CrossPointRelease[];
}

export interface HotspotInfo {
  ssid: string;
  psk: string;
  bridge_ip: string;
}

export interface LogEntry {
  ts: string;
  level: string;
  message: string;
  data: unknown;
}

export interface HelperLogTail {
  available: boolean;
  path: string | null;
  content: string;
}
