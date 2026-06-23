import { useEffect, useState } from "react";
import { api } from "../api";
import { isWindows, isLinux, isMac } from "../platform";
import { useSettingsStore } from "../stores/settingsStore";
import { PrimaryButton } from "./ui";

function ActionButton({
  onClick,
  disabled,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center gap-1.5 rounded-md border border-stone-300 bg-stone-50 px-3 py-1.5 text-sm font-medium text-stone-800 shadow-sm transition hover:border-stone-400 hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {children}
    </button>
  );
}

export function SettingsModal({ onClose }: { onClose: () => void }) {
  const [repairing, setRepairing] = useState(false);
  const [repairMessage, setRepairMessage] = useState<string | null>(null);
  const [removingHelper, setRemovingHelper] = useState(false);
  const [helperMessage, setHelperMessage] = useState<string | null>(null);
  const showCustomFirmwareOption = useSettingsStore(
    (state) => state.showCustomFirmwareOption,
  );
  const setShowCustomFirmwareOption = useSettingsStore(
    (state) => state.setShowCustomFirmwareOption,
  );
  const showPrereleaseFirmware = useSettingsStore(
    (state) => state.showPrereleaseFirmware,
  );
  const setShowPrereleaseFirmware = useSettingsStore(
    (state) => state.setShowPrereleaseFirmware,
  );
  const crosspetHttpOta = useSettingsStore((state) => state.crosspetHttpOta);
  const setCrosspetHttpOta = useSettingsStore(
    (state) => state.setCrosspetHttpOta,
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function onRepair() {
    setRepairing(true);
    setRepairMessage(null);
    try {
      await api.repairSystem();
      setRepairMessage("Network repair complete. localhost should be restored.");
    } catch (e) {
      setRepairMessage(`Repair failed: ${String(e)}`);
    } finally {
      setRepairing(false);
    }
  }

  async function onRemoveHelper() {
    setRemovingHelper(true);
    setHelperMessage(null);
    try {
      await api.uninstallHelper();
      window.dispatchEvent(new Event("helper-uninstalled"));
    } catch (e) {
      setHelperMessage(`Could not stop helper: ${String(e)}`);
    } finally {
      setRemovingHelper(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/40 px-6"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg space-y-5 rounded-2xl border border-stone-200 bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="font-serif text-xl font-medium text-stone-900">
            Settings &amp; recovery
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-stone-500 hover:bg-stone-100 hover:text-stone-700"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <section className="space-y-2">
          <h3 className="font-serif text-sm font-semibold text-stone-900">
            Repair this {isWindows() ? "PC" : isMac() ? "Mac" : isLinux() ? "Linux" : "unknown system"}'s network settings
          </h3>
          <p className="text-sm text-stone-600">
            {isWindows()
              ? "If Unlocker was closed mid-session and Mobile Hotspot or Wi-Fi routing stopped working, run a cleanup pass to tear down Unlocker-managed network changes. Safe to run any time."
              : isMac()
              ? "If Unlocker was closed mid-session and localhost or Wi-Fi routing stopped working, run a cleanup pass to restore loopback and tear down Unlocker-managed network changes. Safe to run any time. After it finishes, restart your Mac to fully remove the temporary \"Xteink Unlocker\" entry from System Settings → Network."
              : isLinux()
              ? "If Unlocker was closed mid-session and localhost or Wi-Fi routing stopped working, run a cleanup pass to restore loopback and tear down Unlocker-managed network changes. Safe to run any time."
              : "Don't know what your system is, please report this..."
            }
          </p>
          <div className="pt-1">
            <ActionButton onClick={onRepair} disabled={repairing}>
              {repairing ? "Repairing…" : "Repair network settings"}
            </ActionButton>
          </div>
          {repairMessage && (
            <p className="text-sm text-stone-600">{repairMessage}</p>
          )}
        </section>

        <section className="space-y-2 border-t border-stone-200 pt-5">
          <h3 className="font-serif text-sm font-semibold text-stone-900">
            Advanced firmware options
          </h3>
          <label className="flex items-start gap-3 text-sm text-stone-700">
            <input
              type="checkbox"
              checked={showPrereleaseFirmware}
              onChange={(e) => setShowPrereleaseFirmware(e.target.checked)}
              className="mt-0.5 size-4 rounded border-stone-300 text-brand-600 focus:ring-brand-500"
            />
            <span>
              <span className="block font-medium text-stone-900">
                Show CrossPoint betas and nightly builds
              </span>
              <span className="block text-stone-600">
                Reveals beta and insider (nightly) channels in the firmware
                selector. These builds may be unstable.
              </span>
            </span>
          </label>
          <label className="flex items-start gap-3 text-sm text-stone-700">
            <input
              type="checkbox"
              checked={showCustomFirmwareOption}
              onChange={(e) => setShowCustomFirmwareOption(e.target.checked)}
              className="mt-0.5 size-4 rounded border-stone-300 text-brand-600 focus:ring-brand-500"
            />
            <span>
              <span className="block font-medium text-stone-900">
                Show Custom Firmware Option
              </span>
              <span className="block text-stone-600">
                Enables selecting a local .bin file during firmware selection.
              </span>
            </span>
          </label>
          <label className="flex items-start gap-3 text-sm text-stone-700">
            <input
              type="checkbox"
              checked={crosspetHttpOta}
              onChange={(e) => setCrosspetHttpOta(e.target.checked)}
              className="mt-0.5 size-4 rounded border-stone-300 text-brand-600 focus:ring-brand-500"
            />
            <span>
              <span className="block font-medium text-stone-900">
                Serve crosspet firmware over HTTP
              </span>
              <span className="block text-stone-600">
                For devices currently running crosspet firmware: download the
                replacement firmware over plain HTTP instead of HTTPS. Leave off
                unless an install repeatedly stalls or drops partway — some
                crosspet devices can't complete the encrypted download.
              </span>
            </span>
          </label>
        </section>

        <section className="space-y-2 border-t border-stone-200 pt-5">
          <h3 className="font-serif text-sm font-semibold text-stone-900">
            Stop the privileged helper
          </h3>
          <p className="text-sm text-stone-600">
            The helper stays running with admin rights so subsequent runs do
            not need a password. Stop it if you would rather have it gone —
            you will be prompted again next launch.
          </p>
          <div className="pt-1">
            <ActionButton onClick={onRemoveHelper} disabled={removingHelper}>
              {removingHelper ? "Stopping…" : "Stop helper"}
            </ActionButton>
          </div>
          {helperMessage && (
            <p className="text-sm text-stone-600">{helperMessage}</p>
          )}
        </section>

        <div className="flex justify-end border-t border-stone-200 pt-4">
          <PrimaryButton onClick={onClose}>Done</PrimaryButton>
        </div>
      </div>
    </div>
  );
}
