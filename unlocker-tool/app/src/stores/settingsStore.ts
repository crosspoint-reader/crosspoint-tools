import { create } from "zustand";

const STORAGE_KEY = "xteink-unlocker-settings";

type PersistedSettings = {
  showCustomFirmwareOption: boolean;
  showPrereleaseFirmware: boolean;
  crosspetHttpOta: boolean;
  dnsIntercept: boolean;
};

type SettingsState = PersistedSettings & {
  setShowCustomFirmwareOption: (value: boolean) => void;
  setShowPrereleaseFirmware: (value: boolean) => void;
  setCrosspetHttpOta: (value: boolean) => void;
  setDnsIntercept: (value: boolean) => void;
};

function loadSettings(): PersistedSettings {
  const defaults: PersistedSettings = {
    showCustomFirmwareOption: false,
    showPrereleaseFirmware: false,
    crosspetHttpOta: false,
    dnsIntercept: false,
  };

  if (typeof window === "undefined") return defaults;

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw) as Partial<PersistedSettings>;
    return {
      showCustomFirmwareOption: parsed.showCustomFirmwareOption === true,
      showPrereleaseFirmware: parsed.showPrereleaseFirmware === true,
      crosspetHttpOta: parsed.crosspetHttpOta === true,
      dnsIntercept: parsed.dnsIntercept === true,
    };
  } catch {
    return defaults;
  }
}

function saveSettings(settings: PersistedSettings) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

function persistCurrent(get: () => SettingsState) {
  const {
    showCustomFirmwareOption,
    showPrereleaseFirmware,
    crosspetHttpOta,
    dnsIntercept,
  } = get();
  saveSettings({
    showCustomFirmwareOption,
    showPrereleaseFirmware,
    crosspetHttpOta,
    dnsIntercept,
  });
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  ...loadSettings(),
  setShowCustomFirmwareOption: (showCustomFirmwareOption) => {
    set({ showCustomFirmwareOption });
    persistCurrent(get);
  },
  setShowPrereleaseFirmware: (showPrereleaseFirmware) => {
    set({ showPrereleaseFirmware });
    persistCurrent(get);
  },
  setCrosspetHttpOta: (crosspetHttpOta) => {
    set({ crosspetHttpOta });
    persistCurrent(get);
  },
  setDnsIntercept: (dnsIntercept) => {
    set({ dnsIntercept });
    persistCurrent(get);
  },
}));
