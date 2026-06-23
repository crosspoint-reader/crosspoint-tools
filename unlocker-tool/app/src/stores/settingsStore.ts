import { create } from "zustand";

const STORAGE_KEY = "xteink-unlocker-settings";

type PersistedSettings = {
  showCustomFirmwareOption: boolean;
  showPrereleaseFirmware: boolean;
  crosspetHttpOta: boolean;
};

type SettingsState = PersistedSettings & {
  setShowCustomFirmwareOption: (value: boolean) => void;
  setShowPrereleaseFirmware: (value: boolean) => void;
  setCrosspetHttpOta: (value: boolean) => void;
};

function loadSettings(): PersistedSettings {
  const defaults: PersistedSettings = {
    showCustomFirmwareOption: false,
    showPrereleaseFirmware: false,
    crosspetHttpOta: false,
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
    };
  } catch {
    return defaults;
  }
}

function saveSettings(settings: PersistedSettings) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

function persistCurrent(get: () => SettingsState) {
  const { showCustomFirmwareOption, showPrereleaseFirmware, crosspetHttpOta } =
    get();
  saveSettings({
    showCustomFirmwareOption,
    showPrereleaseFirmware,
    crosspetHttpOta,
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
}));
