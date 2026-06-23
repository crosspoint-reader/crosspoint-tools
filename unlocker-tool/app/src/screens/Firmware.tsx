import { useEffect, useMemo, useState } from "react";
import {
  open as openFileDialog,
  save as saveFileDialog,
} from "@tauri-apps/plugin-dialog";
import { api } from "../api";
import { useSettingsStore } from "../stores/settingsStore";
import {
  Callout,
  Eyebrow,
  Heading,
  PrimaryButton,
} from "../components/ui";
import {
  SOURCE_LABELS,
  type Catalog,
  type Channel,
  type CrossPointRelease,
  type Locale,
  type Model,
  type Source,
} from "../types";

type ChannelGroups = {
  stable: CrossPointRelease[];
  beta: CrossPointRelease[];
  insider: CrossPointRelease[];
};

const CHANNEL_META: Record<
  Channel,
  { title: string; description: string; emptyText: string; pluralNoun: string }
> = {
  stable: {
    title: "Stable",
    description: "The recommended build. Released after beta testing.",
    emptyText: "no stable release available",
    pluralNoun: "stable builds",
  },
  beta: {
    title: "Beta",
    description: "Pre-release builds. Most features work; some rough edges expected.",
    emptyText: "no betas right now",
    pluralNoun: "active builds",
  },
  insider: {
    title: "Insider (nightly)",
    description: "Auto-built from master. May be unstable. For testing, not daily reading.",
    emptyText: "no nightly build available",
    pluralNoun: "nightly builds",
  },
};

function releaseLabel(r: CrossPointRelease): string {
  return r.variant ? `${r.name} · ${r.variant}` : r.name;
}

// CrossPoint KO is intentionally hidden: its firmware is larger than the
// OTA slot on stock and CrossPoint, so OTA flashing from anything but KO
// itself fails. Re-add once KO ships an OTA-sized build.
const SOURCE_ORDER: Source[] = ["xteink", "crossink"];

// Releases that are present in the catalog but should never be offered in
// the UI. Keys are namespaced release IDs (`{source-slug}:{id}`); values are
// models the hide applies to. CrossPoint stable 1.2.0 on x4 has a known OTA
// regression — users have to escape via the patched .bin in firmware-patches.
const HIDDEN_RELEASES: Record<string, Model[]> = {
  "xteink:stable-1.2.0": ["x4"],
};

// Namespaced catalog id of the Escape Hatch recovery firmware (xteink source).
// It's served from the catalog like any other release so the normal OTA install
// pipeline can flash it, but it must NOT appear in the normal channel cards —
// it's a recovery bridge, not a firmware users should pick casually. We filter
// any `…:recovery-*` id out of the channel grouping and surface this one only
// from the "OTA failing?" recovery panel below.
const ESCAPE_HATCH_ID = "xteink:recovery-escape-hatch";
const isRecoveryRelease = (r: CrossPointRelease) =>
  r.id.includes(":recovery-") || r.id.startsWith("recovery-");

export function Firmware({ model, locale }: { model: Model; locale: Locale }) {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [selectedSource, setSelectedSource] = useState<Source | null>(null);
  const showCustomFirmwareOption = useSettingsStore(
    (state) => state.showCustomFirmwareOption,
  );
  const showPrereleaseFirmware = useSettingsStore(
    (state) => state.showPrereleaseFirmware,
  );
  const crosspetHttpOta = useSettingsStore((state) => state.crosspetHttpOta);

  useEffect(() => {
    api.fetchCatalog().then(setCatalog).catch((e) => setError(String(e)));
  }, []);

  const bySource = useMemo(() => {
    if (!catalog) return null;
    const supportsModel = (r: CrossPointRelease) => {
      if (!r.supported_devices || r.supported_devices.length === 0) return true;
      return r.supported_devices.includes(model);
    };
    const isHidden = (r: CrossPointRelease) =>
      (HIDDEN_RELEASES[r.id] ?? []).includes(model);
    const isHiddenChannel = (r: CrossPointRelease) =>
      !showPrereleaseFirmware && (r.channel === "beta" || r.channel === "insider");
    const eligible = catalog.releases.filter(
      (r) =>
        supportsModel(r) &&
        !isHidden(r) &&
        !isHiddenChannel(r) &&
        !isRecoveryRelease(r),
    );
    const present = new Set<Source>();
    for (const r of eligible) present.add(r.source ?? "xteink");
    // Stable order: CrossPoint default, then related firmware variants.
    const sources = SOURCE_ORDER.filter((s) => present.has(s));
    const map = new Map<Source, ChannelGroups>();
    for (const src of sources) {
      const by = (c: Channel) =>
        eligible
          .filter((r) => (r.source ?? "xteink") === src && r.channel === c)
          .sort((a, b) => b.released_at.localeCompare(a.released_at));
      map.set(src, { stable: by("stable"), beta: by("beta"), insider: by("insider") });
    }
    return { sources, groups: map };
  }, [catalog, model, showPrereleaseFirmware]);

  // Default the dropdown to the first available source (CrossPoint when present).
  useEffect(() => {
    if (!bySource || selectedSource) return;
    if (bySource.sources.length > 0) setSelectedSource(bySource.sources[0]!);
  }, [bySource, selectedSource]);

  if (error) {
    return (
      <Callout variant="error" title="Couldn't reach firmware catalog">
        Check your internet connection and try again. {error}
      </Callout>
    );
  }
  if (!catalog || !bySource) {
    return <p className="text-sm text-stone-500">Loading firmware catalog…</p>;
  }

  async function install(release: CrossPointRelease) {
    setPendingId(release.id);
    try {
      await api.selectFirmware(model, locale, release.id, crosspetHttpOta);
    } catch (e) {
      setPendingId(null);
      setError(String(e));
    }
  }

  // Save a firmware .bin to the user's computer so they can copy it to the
  // device's SD card and flash it from Escape Hatch (no OTA).
  async function saveToFile(release: CrossPointRelease) {
    const suggested = `${releaseLabel(release)
      .replace(/[^a-zA-Z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "")}.bin`;
    let dest: string | null;
    try {
      dest = await saveFileDialog({
        defaultPath: suggested,
        filters: [{ name: "Firmware image", extensions: ["bin"] }],
      });
    } catch (e) {
      setSaveNotice(`Couldn't open save dialog: ${String(e)}`);
      return;
    }
    if (!dest) return; // user cancelled
    setSavingId(release.id);
    setSaveNotice(null);
    try {
      await api.exportFirmware(release.id, dest);
      setSaveNotice(`Saved ${releaseLabel(release)} to ${dest}`);
    } catch (e) {
      setSaveNotice(`Save failed: ${String(e)}`);
    } finally {
      setSavingId(null);
    }
  }

  async function installLocal() {
    setPendingId("local");
    try {
      const picked = await openFileDialog({
        multiple: false,
        filters: [{ name: "Firmware image", extensions: ["bin"] }],
      });
      if (typeof picked !== "string") {
        setPendingId(null);
        return;
      }
      await api.selectLocalFirmware(model, locale, picked, crosspetHttpOta);
    } catch (e) {
      setPendingId(null);
      setError(String(e));
    }
  }

  if (bySource.sources.length === 0) {
    return (
      <p className="text-sm text-stone-500">
        No firmware releases are available for this device yet.
      </p>
    );
  }

  const activeSource = selectedSource ?? bySource.sources[0]!;
  const groups = bySource.groups.get(activeSource)!;

  // The Escape Hatch recovery firmware, if the catalog is serving it and it
  // supports this model. Surfaced only from the recovery panel below, never in
  // the channel cards (filtered out of `eligible` by `isRecoveryRelease`).
  const escapeHatch =
    catalog.releases.find(
      (r) =>
        r.id === ESCAPE_HATCH_ID &&
        (!r.supported_devices ||
          r.supported_devices.length === 0 ||
          r.supported_devices.includes(model)),
    ) ?? null;

  return (
    <div className="space-y-5">
      <div>
        <Eyebrow>Step 3 · Firmware channel</Eyebrow>
        <Heading>Pick a release</Heading>
      </div>

      <div className="flex items-center gap-3">
        <label
          htmlFor="firmware-source"
          className="font-serif text-sm font-medium text-stone-700"
        >
          Firmware
        </label>
        <div className="relative">
          <select
            id="firmware-source"
            value={activeSource}
            onChange={(e) => {
              setSelectedSource(e.target.value as Source);
              setOpenKey(null);
            }}
            disabled={bySource.sources.length === 1 || !!pendingId}
            className="appearance-none rounded-lg border border-stone-200 bg-white py-1.5 pl-3 pr-8 font-serif text-sm font-medium text-stone-900 shadow-sm transition hover:border-stone-300 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {bySource.sources.map((s) => (
              <option key={s} value={s}>
                {SOURCE_LABELS[s]}
              </option>
            ))}
          </select>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            aria-hidden="true"
            className="pointer-events-none absolute right-2 top-1/2 size-4 -translate-y-1/2 text-stone-400"
          >
            <path
              fillRule="evenodd"
              d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.06l3.71-3.83a.75.75 0 1 1 1.08 1.04l-4.25 4.39a.75.75 0 0 1-1.08 0L5.21 8.27a.75.75 0 0 1 .02-1.06z"
              clipRule="evenodd"
            />
          </svg>
        </div>
      </div>

      {activeSource === "xteink" && (
        <details className="group rounded-lg border border-stone-200 bg-stone-50 text-sm/6 text-stone-700">
          <summary className="cursor-pointer list-none px-4 py-3 font-medium marker:hidden">
            <span className="inline-block w-4 text-stone-400 transition-transform group-open:rotate-90">
              ›
            </span>
            Is your OTA update failing to complete?
          </summary>
          <div className="space-y-3 px-4 pb-4 pl-8">
            <p>
              Some firmware (such as crosspet 1.8.3+) forces an encrypted OTA
              download that these devices can't reliably finish — the update
              starts, then stalls or drops partway. If a normal install keeps
              failing, flash the <strong>Escape Hatch</strong> firmware instead,
              then flash your real firmware directly from the SD card.
            </p>
            {escapeHatch ? (
              <>
                <PrimaryButton
                  onClick={() => install(escapeHatch)}
                  disabled={!!pendingId}
                >
                  {pendingId === escapeHatch.id
                    ? "Flashing Escape Hatch…"
                    : "Flash Escape Hatch firmware"}
                </PrimaryButton>
                <p className="text-stone-600">
                  Once the device is on Escape Hatch, copy your firmware{" "}
                  <code>.bin</code> to the SD card and flash it from the device's
                  on-screen menu — no OTA required.
                </p>
              </>
            ) : (
              <p className="text-stone-600">
                The Escape Hatch firmware isn't available from the catalog right
                now. Check your internet connection and try again shortly.
              </p>
            )}
          </div>
        </details>
      )}

      <div className="grid gap-2">
        {(["stable", "beta", "insider"] as Channel[]).map((channel) => {
          const releases = groups[channel];
          if (releases.length === 0) return null;
          const key = `${activeSource}:${channel}`;
          return (
            <ChannelCard
              key={key}
              channel={channel}
              releases={releases}
              open={openKey === key}
              onToggle={() => setOpenKey((v) => (v === key ? null : key))}
              onPick={install}
              onSave={saveToFile}
              pendingId={pendingId}
              savingId={savingId}
              alwaysExpanded={channel === "stable"}
            />
          );
        })}
      </div>

      <p className="text-xs text-stone-500">
        Tip: use <strong>Save for SD</strong> on any release to write its{" "}
        <code>.bin</code> to this computer. Copy it to the device's SD card, then
        flash it from Escape Hatch — handy when an OTA install won't complete.
      </p>
      {saveNotice && (
        <p className="text-xs text-stone-600">{saveNotice}</p>
      )}

      {showCustomFirmwareOption && (
        <div className="rounded-xl border border-stone-300 bg-white p-4 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="font-serif text-sm font-medium text-stone-900">
                Local firmware
              </div>
              <div className="mt-1 text-xs text-stone-500">
                Sideload a firmware .bin from this computer.
              </div>
              <div className="mt-2 text-xs text-stone-500">
                Note: OTA can only write into the device's existing app
                partition. If your .bin is larger than that slot (for example,
                CrossPoint KO is too big for stock and CrossPoint layouts), the
                flash will fail. Switching to a firmware family with a larger
                partition layout requires a wired USB flash (esptool).
              </div>
              <div className="mt-3 rounded-md border border-red-300 bg-red-50 p-3 text-xs text-red-900">
                <p className="font-medium">Warning</p>
                <p className="mt-1 text-red-800">
                  Do not flash any firmware that doesn't support OTA updates or
                  you will be permanently stuck on that firmware forever. (For
                  example, Papyrix.)
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={installLocal}
              disabled={!!pendingId && pendingId !== "local"}
              className={`shrink-0 rounded-md border px-3 py-1 text-xs font-semibold shadow-sm disabled:cursor-not-allowed disabled:opacity-50 ${
                pendingId === "local"
                  ? "border-brand-500 bg-brand-500 text-white"
                  : "border-stone-300 bg-stone-50 text-stone-700"
              }`}
            >
              {pendingId === "local" ? "Preparing…" : "Choose file"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ChannelCard({
  channel,
  releases,
  open,
  onToggle,
  onPick,
  onSave,
  pendingId,
  savingId,
  alwaysExpanded,
}: {
  channel: Channel;
  releases: CrossPointRelease[];
  open: boolean;
  onToggle: () => void;
  onPick: (r: CrossPointRelease) => void;
  onSave: (r: CrossPointRelease) => void;
  pendingId: string | null;
  savingId: string | null;
  alwaysExpanded?: boolean;
}) {
  const meta = CHANNEL_META[channel];
  const installingThisCard =
    !!pendingId && releases.some((r) => r.id === pendingId);

  const list = (
    <ul className={alwaysExpanded ? undefined : "border-t border-stone-200"}>
      {releases.map((r) => {
        const isPending = pendingId === r.id;
        const otherPending = !!pendingId && !isPending;
        const isSaving = savingId === r.id;
        const busy = !!pendingId || !!savingId;
        return (
          <li key={r.id} className="flex items-stretch">
            <button
              type="button"
              onClick={() => onPick(r)}
              disabled={otherPending || !!savingId}
              className="flex flex-1 items-start justify-between gap-4 px-4 py-3 text-left transition hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <div>
                <div className="text-sm font-medium text-stone-900">
                  {releaseLabel(r)}
                </div>
                {r.notes && (
                  <div className="mt-1 line-clamp-2 whitespace-pre-line text-xs text-stone-500">
                    {r.notes}
                  </div>
                )}
                <div className="mt-1 font-mono text-[11px] text-stone-400">
                  {r.version} · {new Date(r.released_at).toLocaleDateString()}
                </div>
              </div>
              <span
                className={`shrink-0 rounded-md border px-3 py-1 text-xs font-semibold shadow-sm ${
                  isPending
                    ? "border-brand-500 bg-brand-500 text-white"
                    : "border-stone-300 bg-stone-50 text-stone-700"
                }`}
              >
                {isPending ? "Downloading…" : "Download"}
              </span>
            </button>
            <button
              type="button"
              onClick={() => onSave(r)}
              disabled={busy}
              title="Save this firmware .bin to your computer, then copy it to the SD card to flash from Escape Hatch"
              className="shrink-0 border-l border-stone-200 px-3 text-xs font-medium text-stone-600 transition hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSaving ? "Saving…" : "Save for SD"}
            </button>
          </li>
        );
      })}
    </ul>
  );

  if (alwaysExpanded) {
    return (
      <div
        className={`overflow-hidden rounded-xl border shadow-sm transition ${
          installingThisCard
            ? "border-brand-500 bg-brand-50 ring-1 ring-brand-500"
            : "border-stone-300 bg-white"
        }`}
      >
        <div className="flex items-center justify-between gap-3 border-b border-stone-200 bg-stone-50 px-4 py-2">
          <span className="font-serif text-sm font-medium text-stone-900">
            {meta.title}
          </span>
          {releases.length > 1 && (
            <span className="font-mono text-[11px] text-stone-500">
              {releases.length} {meta.pluralNoun}
            </span>
          )}
        </div>
        {list}
      </div>
    );
  }

  const tapBehavior: "download" | "expand" =
    releases.length === 1 ? "download" : "expand";
  const handleClick = () => {
    if (tapBehavior === "download") onPick(releases[0]!);
    else onToggle();
  };
  const subtitle =
    tapBehavior === "download"
      ? `latest: ${releaseLabel(releases[0]!)}`
      : `${releases.length} ${meta.pluralNoun}`;

  return (
    <div
      className={`rounded-xl border shadow-sm transition ${
        installingThisCard
          ? "border-brand-500 bg-brand-50 ring-1 ring-brand-500"
          : "border-stone-300 bg-white"
      }`}
    >
      <button
        type="button"
        onClick={handleClick}
        disabled={!!pendingId && !installingThisCard}
        className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left disabled:cursor-not-allowed disabled:opacity-50"
      >
        <div className="min-w-0">
          <div className="font-serif text-sm font-medium text-stone-900">
            {meta.title}
          </div>
          <div className="mt-0.5 truncate font-mono text-xs text-stone-400">
            {subtitle}
          </div>
        </div>
        <span
          className={`shrink-0 rounded-md border px-3 py-1 text-xs font-semibold shadow-sm ${
            installingThisCard
              ? "border-brand-500 bg-brand-500 text-white"
              : "border-stone-300 bg-stone-50 text-stone-700"
          }`}
        >
          {installingThisCard
            ? "Downloading…"
            : tapBehavior === "expand"
              ? open
                ? "Hide"
                : "Choose"
              : "Download"}
        </span>
      </button>

      {tapBehavior === "expand" && open && list}
    </div>
  );
}
