import { invoke } from "@tauri-apps/api/core";
import type {
  Catalog,
  HelperLogTail,
  LogEntry,
  Locale,
  Model,
  OrchState,
} from "./types";

export interface SessionInfo {
  model: Model | null;
  locale: Locale | null;
  release_id: string | null;
  firmware_path: string | null;
  bridge_ip: string | null;
  ssid: string | null;
  psk: string | null;
  device_ip: string | null;
}

export const api = {
  getState: () => invoke<OrchState>("get_state"),
  getSession: () => invoke<SessionInfo>("get_session"),
  fetchCatalog: () => invoke<Catalog>("fetch_catalog"),
  acceptConsent: (general: boolean, recovery: boolean) =>
    invoke<void>("accept_consent", { general, recovery }),
  selectDevice: (model: Model, locale: Locale) =>
    invoke<void>("select_device", { model, locale }),
  selectFirmware: (
    model: Model,
    locale: Locale,
    releaseId: string,
    crosspetHttp: boolean,
  ) =>
    invoke<void>("select_firmware", {
      selection: { model, locale, release_id: releaseId },
      crosspetHttp,
    }),
  selectLocalFirmware: (
    model: Model,
    locale: Locale,
    path: string,
    crosspetHttp: boolean,
  ) => invoke<void>("select_local_firmware", { model, locale, path, crosspetHttp }),
  checkHelper: () => invoke<boolean>("check_helper"),
  cleanupAfterInstall: () => invoke<void>("cleanup_after_install"),
  uninstallHelper: () => invoke<void>("uninstall_helper"),
  repairSystem: () => invoke<void>("repair_system"),
  confirmRunning: () => invoke<void>("confirm_running"),
  cancel: () => invoke<void>("cancel"),
  getLogs: () => invoke<LogEntry[]>("get_logs"),
  getHelperLogTail: (lines = 200) =>
    invoke<HelperLogTail>("get_helper_log_tail", { lines }),
};
