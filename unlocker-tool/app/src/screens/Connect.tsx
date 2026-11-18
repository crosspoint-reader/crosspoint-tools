import { useEffect, useRef, useState } from "react";
import { relaunch } from "@tauri-apps/plugin-process";
import { api } from "../api";
import { Card, Eyebrow, Heading, StatusDot, Subhead } from "../components/ui";
import { HelperDebugLog } from "../components/HelperDebugLog";
import { isWindows, isMac, isLinux } from "../platform";
import { saveResumeInstall } from "../resumeInstall";
import { useSessionLog } from "../store";
import type { Locale, Model, StateKind } from "../types";

type Phase =
  | "preparing"
  | "hotspot_starting"
  | "waiting_for_sharing"
  | "waiting_for_device"
  | "waiting_for_check";

export function Connect({ state }: { state: StateKind }) {
  const phase: Phase =
    state === "downloading_firmware"
      ? "preparing"
      : state === "setting_up_hotspot"
        ? "hotspot_starting"
        : state === "waiting_for_internet_sharing"
          ? "waiting_for_sharing"
          : state === "awaiting_client"
            ? "waiting_for_device"
            : "waiting_for_check";

  const logs = useSessionLog();

  const [info, setInfo] = useState<{
    model: Model | null;
    locale: Locale | null;
    release_id: string | null;
    firmware_path: string | null;
    ssid: string | null;
    psk: string | null;
    bridge_ip: string | null;
    upstream_service: string | null;
    upstream_adhoc: boolean;
    device_ip: string | null;
  }>({
    model: null,
    locale: null,
    release_id: null,
    firmware_path: null,
    ssid: null,
    psk: null,
    bridge_ip: null,
    upstream_service: null,
    upstream_adhoc: false,
    device_ip: null,
  });
  const [restarting, setRestarting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      const s = await api.getSession();
      if (!cancelled) {
        setInfo({
          model: s.model,
          locale: s.locale,
          release_id: s.release_id,
          firmware_path: s.firmware_path,
          ssid: s.ssid,
          psk: s.psk,
          bridge_ip: s.bridge_ip,
          upstream_service: s.upstream_service ?? null,
          upstream_adhoc: s.upstream_adhoc ?? false,
          device_ip: s.device_ip,
        });
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  async function restartAfterSharing() {
    if (!info.model || !info.locale || !info.release_id) return;
    setRestarting(true);
    if (info.release_id === "local" && info.firmware_path) {
      saveResumeInstall({
        kind: "local",
        model: info.model,
        locale: info.locale,
        path: info.firmware_path,
      });
    } else {
      saveResumeInstall({
        kind: "catalog",
        model: info.model,
        locale: info.locale,
        releaseId: info.release_id,
      });
    }
    await relaunch();
  }

  if (phase === "preparing" || phase === "hotspot_starting") {
    return (
      <div className="space-y-6">
        <div>
          <Eyebrow>Step 4 · Preparing</Eyebrow>
          <Heading>
            {phase === "preparing"
              ? "Downloading firmware…"
              : "Setting up the local network…"}
          </Heading>
          <Subhead>
            {phase === "preparing"
              ? `Verifying SHA-256 as it streams. After this Unlocker is fully offline — your ${isWindows() ? "PC" : isMac() ? "Mac" : isLinux() ? "Linux" : "unknown system"} can lose internet without affecting the install.`
              : isWindows()
                ? "Starting Mobile Hotspot…"
                : isMac()
                ? "Detecting your Wi-Fi adapter and internet connection, then pre-configuring Internet Sharing…"
                : isLinux()
                ? "Preparing the virtual network interface…"
                : "Don't know what your system is, please report this..."
            }
          </Subhead>
        </div>
        <Card>
          <ProgressBar />
        </Card>
        <LogPanel entries={logs} />
        <HelperDebugLog />
      </div>
    );
  }

  // On Windows the helper brings the Mobile Hotspot up programmatically (one
  // WinRT call), so this state is short-lived and there is nothing for the
  // user to do. On macOS it's a manual step in System Settings followed by an
  // app relaunch to bind to the new bridge interface.
  if (phase === "waiting_for_sharing") {
    if (isWindows()) {
      return (
        <div className="space-y-6">
          <div>
            <Eyebrow>Step 4 · Hotspot</Eyebrow>
            <Heading>Bringing up Mobile Hotspot…</Heading>
            <Subhead>
              Unlocker is asking Windows to start a private hotspot
              (192.168.137.0/24). This usually takes a couple of seconds.
            </Subhead>
          </div>
          <WpaNote platform="windows" />
          <Card>
            <ProgressBar />
          </Card>
          <LogPanel entries={logs} />
          <HelperDebugLog />
        </div>
      );
    }

    if (isLinux()) {
      return (
        <div className="space-y-6">
          <div>
            <Eyebrow>Step 4 · Hotspot</Eyebrow>
            <Heading>Starting Linux Wi-Fi Hotspot…</Heading>
            <Subhead>
              Unlocker is asking NetworkManager to start a private hotspot
              (10.42.0.0/24). This usually takes a few seconds.
            </Subhead>
          </div>
          <Card>
            <ProgressBar />
          </Card>
          <LogPanel entries={logs} />
          <HelperDebugLog />
        </div>
      );
    }

    return (
      <div className="space-y-6">
        <div>
          <Eyebrow>Step 4 · Enable Internet Sharing</Eyebrow>
          <Heading>Turn on Internet Sharing</Heading>
          <Subhead>
            Unlocker needs your Mac to act as a Wi-Fi hotspot for your device.
            Follow the steps below, connect your Xteink, then restart Unlocker
            so it can arm the update server on the active sharing network.
          </Subhead>
        </div>

        <SharingSlideshow />

        <ol className="space-y-3">
          <Step n={1} title="Open Internet Sharing" done={false} active={true}>
            <strong>System Settings → General → Sharing → Internet Sharing</strong>.
            If Internet Sharing is already on, turn it off first — you
            can't change settings while it's active.
          </Step>

          <Step n={2} title="Configure sharing" done={false} active={true}>
            Set <strong>Share your connection from</strong> to{" "}
            <span className="rounded bg-stone-100 px-1.5 py-0.5 font-mono text-xs text-stone-700">
              {info.upstream_service ?? "Xteink Unlocker"}
            </span>
            <span className="text-stone-500">
              {info.upstream_service && !info.upstream_adhoc
                ? " (your Mac's current internet connection)"
                : " (a temporary service Unlocker created because no wired internet connection was found)"}
            </span>{" "}
            and check{" "}
            <strong>Wi-Fi</strong> in the "To devices using" list. Click{" "}
            <strong>Wi-Fi Options</strong> and set a simple password like{" "}
            <span className="font-mono text-stone-700">11111111</span>{" "}
            <span className="text-stone-500">(8 chars)</span> — you'll need to
            type this on your Xteink.
            <WpaNote platform="macos" />
          </Step>

          <Step n={3} title="Turn it on" done={false} active={true}>
            Toggle Internet Sharing on and click Start when macOS asks to
            confirm. Your Mac's Wi-Fi will disconnect — this is expected.
          </Step>
        </ol>

        <Card>
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <StatusDot variant="active" />
              <div>
                <p className="text-sm font-medium text-stone-900">
                  After Internet Sharing is on
                </p>
                <p className="mt-1 text-sm text-stone-600">
                  Connect your Xteink to the hotspot you created, then click
                  below. Unlocker will restart and resume this install
                  automatically.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={restartAfterSharing}
              disabled={
                restarting ||
                !info.model ||
                !info.locale ||
                !info.release_id ||
                (info.release_id === "local" && !info.firmware_path)
              }
              className="rounded-md border border-brand-500 bg-brand-500 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:border-stone-300 disabled:bg-stone-200 disabled:text-stone-500"
            >
              {restarting ? "Restarting…" : "I've started Internet Sharing"}
            </button>
          </div>
        </Card>
        <LogPanel entries={logs} />
        <HelperDebugLog />
      </div>
    );
  }

  const deviceConnected = phase === "waiting_for_check";

  return (
    <div className="space-y-6">
      <div>
        <Eyebrow>Step 4 · Connect your Xteink</Eyebrow>
        <Heading>Two quick steps on your device</Heading>
        <Subhead>
          Unlocker is now serving a local network for your Xteink. Follow the
          steps below — the install will start as soon as your device asks for
          an update.
        </Subhead>
      </div>

      <ol className="space-y-3">
        <Step
          n={1}
          title="Join the hotspot on your Xteink"
          done={deviceConnected}
          active={!deviceConnected}
        >
          On your Xteink, go to Settings → Wi-Fi and connect to the{" "}
          <span className="rounded bg-stone-100 px-1.5 py-0.5 font-mono text-xs text-stone-700">
            {info.ssid ?? "CrossPoint-Setup"}
          </span>{" "}
          network using password{" "}
          <span className="font-mono text-stone-700">{info.psk ?? "—"}</span>.
          {deviceConnected && info.device_ip && (
            <span className="ml-2 text-xs text-brand-500">
              connected ({info.device_ip})
            </span>
          )}
        </Step>

        <Step
          n={2}
          title="Open System Update"
          done={false}
          active={deviceConnected}
        >
          Sync/APP → System Update. Your Xteink will check for updates, and
          Unlocker will detect the request and continue automatically.
        </Step>
      </ol>

      <LogPanel entries={logs} />
      <HelperDebugLog />
    </div>
  );
}

function LogPanel({ entries }: { entries: { ts: string; level: string; message: string }[] }) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [entries.length]);

  if (entries.length === 0) return null;

  return (
    <div className="rounded-xl border border-stone-200 bg-stone-950 p-4">
      <div className="max-h-48 overflow-y-auto font-mono text-xs leading-5">
        {entries.map((e, i) => (
          <div key={i} className="flex gap-2">
            <span className="shrink-0 text-stone-500">
              {new Date(e.ts).toLocaleTimeString()}
            </span>
            <span
              className={
                e.level === "warn"
                  ? "text-amber-400"
                  : e.level === "error"
                    ? "text-red-400"
                    : "text-stone-300"
              }
            >
              {e.message}
            </span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}

function Step({
  n,
  title,
  done,
  active,
  children,
}: {
  n: number;
  title: string;
  done: boolean;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <li className="flex gap-4 rounded-xl border border-stone-200 bg-white p-4">
      <span
        className={`flex size-7 shrink-0 items-center justify-center rounded-full font-mono text-xs font-semibold ${
          done
            ? "bg-brand-100 text-brand-700"
            : active
              ? "bg-brand-500 text-white"
              : "bg-stone-200 text-stone-500"
        }`}
      >
        {done ? "✓" : n}
      </span>
      <div className="flex-1">
        <div className="flex items-center gap-2 text-sm font-medium text-stone-900">
          {title}
          {active && !done && <StatusDot variant="active" />}
        </div>
        <div className="mt-1 text-sm text-stone-600">{children}</div>
      </div>
    </li>
  );
}

const SHARING_SLIDES: { src: string; title: string; body: React.ReactNode }[] = [
  {
    src: "/sharing-help/01-general.png",
    title: "1. Open System Settings → General → Sharing",
    body: (
      <>
        In System Settings, click <strong>General</strong> in the sidebar, then
        scroll the right pane to <strong>Sharing</strong>.
      </>
    ),
  },
  {
    src: "/sharing-help/02-sharing-list.png",
    title: "2. Find Internet Sharing",
    body: (
      <>
        Scroll to the bottom of the Sharing pane. You'll see{" "}
        <strong>Internet Sharing</strong> with a toggle. Don't toggle it yet —
        click the <strong>(i)</strong> info button next to it first.
      </>
    ),
  },
  {
    src: "/sharing-help/03-pick-source.png",
    title: "3. Set the source to Xteink Unlocker",
    body: (
      <>
        In the popover, set <strong>Share your connection from</strong> to{" "}
        <span className="rounded bg-stone-100 px-1.5 py-0.5 font-mono text-xs text-stone-700">
          Xteink Unlocker
        </span>
        .
      </>
    ),
  },
  {
    src: "/sharing-help/04-toggle-on.png",
    title: "4. Pick Wi-Fi, set a password, then toggle on",
    body: (
      <>
        Check <strong>Wi-Fi</strong> in the "To devices using" list. Click{" "}
        <strong>Wi-Fi Options</strong> and set a simple password like{" "}
        <span className="font-mono text-stone-700">11111111</span>{" "}
        <span className="text-stone-500">(8 chars)</span> — you'll type this on
        your Xteink. Then flip the <strong>Internet Sharing</strong> toggle on
        at the top and click Start.
      </>
    ),
  },
];

function SharingSlideshow() {
  const [i, setI] = useState(0);
  const slide = SHARING_SLIDES[i]!;
  const prev = () => setI((v) => (v - 1 + SHARING_SLIDES.length) % SHARING_SLIDES.length);
  const next = () => setI((v) => (v + 1) % SHARING_SLIDES.length);

  return (
    <Card>
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-serif text-base font-medium text-stone-900">
          Visual walk-through
        </h3>
        <span className="font-mono text-xs text-stone-400">
          {i + 1} / {SHARING_SLIDES.length}
        </span>
      </div>
      <div className="mt-3 overflow-hidden rounded-lg border border-stone-200 bg-stone-50">
        <img
          src={slide.src}
          alt={slide.title}
          className="block w-full object-contain"
        />
      </div>
      <p className="mt-3 text-sm font-medium text-stone-900">{slide.title}</p>
      <p className="mt-1 text-sm text-stone-600">{slide.body}</p>
      <div className="mt-4 flex items-center justify-between">
        <button
          type="button"
          onClick={prev}
          className="rounded-md border border-stone-200 bg-white px-3 py-1.5 text-sm text-stone-700 hover:border-stone-300 disabled:opacity-50"
          disabled={SHARING_SLIDES.length < 2}
        >
          ← Previous
        </button>
        <div className="flex gap-1.5">
          {SHARING_SLIDES.map((_, idx) => (
            <button
              key={idx}
              type="button"
              aria-label={`Go to slide ${idx + 1}`}
              onClick={() => setI(idx)}
              className={`size-2 rounded-full transition ${
                idx === i ? "bg-brand-500" : "bg-stone-300 hover:bg-stone-400"
              }`}
            />
          ))}
        </div>
        <button
          type="button"
          onClick={next}
          className="rounded-md border border-stone-200 bg-white px-3 py-1.5 text-sm text-stone-700 hover:border-stone-300 disabled:opacity-50"
          disabled={SHARING_SLIDES.length < 2}
        >
          Next →
        </button>
      </div>
    </Card>
  );
}

function WpaNote({ platform }: { platform: "macos" | "windows" }) {
  if (platform === "macos") {
    return (
      <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
        <p className="font-medium">
          Turn off VPNs before continuing
        </p>
        <p className="mt-1 text-amber-800">
          Disable Tailscale, Cloudflare WARP, or any other VPN. They reroute
          local traffic and stop your Xteink from reaching the hotspot. The
          default <strong>WPA2/WPA3 Personal</strong> security setting is fine,
          no need to change it.
        </p>
        <p className="mt-2 text-amber-800">
          If your device still refuses to connect, restart this machine.
        </p>
      </div>
    );
  }
  return (
    <div className="mt-3 space-y-3">
      <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
        <p className="font-medium">
          Set the hotspot security to WPA2 only (not WPA2/WPA3)
        </p>
        <p className="mt-1 text-amber-800">
          The Xteink can't join WPA3-mixed networks. If you don't change this,
          the device will fail to connect.
        </p>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-amber-800">
          <li>
            Open <strong>Settings → Network &amp; internet → Mobile hotspot</strong>.
          </li>
          <li>
            Click <strong>Edit</strong> (or <strong>Properties</strong>) under
            the network name.
          </li>
          <li>
            Set <strong>Security</strong> to <strong>WPA2</strong> (not the
            default WPA2/WPA3) and save.
          </li>
        </ol>
      </div>
      <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
        <p className="font-medium">
          Turn off Windows Firewall and Defender, plus any VPN
        </p>
        <p className="mt-1 text-amber-800">
          Windows Defender Firewall blocks the hotspot from reaching the
          helper, and real-time protection can quarantine the firmware mid
          transfer. Disable both for the install, plus any active VPN
          (Tailscale, Cloudflare WARP, etc.). Re-enable everything once
          you're done.
        </p>
        <p className="mt-2 text-amber-800">
          If your device still refuses to connect, restart this machine.
        </p>
      </div>
    </div>
  );
}

function ProgressBar() {
  return (
    <div className="space-y-3">
      <div className="h-2 overflow-hidden rounded-full bg-stone-100">
        <div className="h-full w-2/3 animate-pulse rounded-full bg-brand-500" />
      </div>
      <p className="text-sm text-stone-500">Working…</p>
    </div>
  );
}
