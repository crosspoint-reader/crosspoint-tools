import { useEffect, useState } from "react";
import { Shell } from "./components/Shell";
import { Consent } from "./screens/Consent";
import { DeviceAndRegion } from "./screens/DeviceAndRegion";
import { Firmware } from "./screens/Firmware";
import { Connect } from "./screens/Connect";
import { Done, Failed, Live } from "./screens/Live";
import { useStateMachine } from "./store";
import { api } from "./api";
import type { Locale, Model } from "./types";
import { takeResumeInstall } from "./resumeInstall";
import { useSettingsStore } from "./stores/settingsStore";

export function App() {
  const { state, error } = useStateMachine();
  const [model, setModel] = useState<Model | null>(null);
  const [locale, setLocale] = useState<Locale | null>(null);
  const [resumeAttempted, setResumeAttempted] = useState(false);

  useEffect(() => {
    if (
      state === "selecting_firmware" ||
      state === "downloading_firmware" ||
      state === "setting_up_hotspot" ||
      state === "waiting_for_internet_sharing" ||
      state === "awaiting_client" ||
      state === "awaiting_device_request"
    ) {
      api.getSession().then((s) => {
        if (s.model) setModel(s.model);
        if (s.locale) setLocale(s.locale);
      });
    }
  }, [state]);

  useEffect(() => {
    if (resumeAttempted || (state !== "idle" && state !== "consenting")) return;
    const pending = takeResumeInstall();
    if (!pending) {
      setResumeAttempted(true);
      return;
    }

    setResumeAttempted(true);
    setModel(pending.model);
    setLocale(pending.locale);

    (async () => {
      const { crosspetHttpOta } = useSettingsStore.getState();
      await api.acceptConsent(true, true);
      await api.selectDevice(pending.model, pending.locale);
      if (pending.kind === "catalog") {
        await api.selectFirmware(
          pending.model,
          pending.locale,
          pending.releaseId,
          crosspetHttpOta,
        );
      } else {
        await api.selectLocalFirmware(
          pending.model,
          pending.locale,
          pending.path,
          crosspetHttpOta,
        );
      }
    })().catch((e) => {
      console.error("Failed to resume install after restart:", e);
    });
  }, [resumeAttempted, state]);

  return (
    <Shell state={state}>
      {(state === "idle" || state === "consenting") && <Consent />}
      {state === "selecting_device_and_region" && <DeviceAndRegion />}
      {state === "selecting_firmware" && model && locale && (
        <Firmware model={model} locale={locale} />
      )}
      {(state === "downloading_firmware" ||
        state === "setting_up_hotspot" ||
        state === "waiting_for_internet_sharing" ||
        state === "awaiting_client" ||
        state === "awaiting_device_request") && <Connect state={state} />}
      {(state === "armed" || state === "serving") && (
        <Live state={state} />
      )}
      {state === "done" && <Done />}
      {state === "failed" && <Failed error={error} />}
      {state === "cleaning_up" && (
        <p className="text-sm text-stone-500">Reverting changes…</p>
      )}
    </Shell>
  );
}
