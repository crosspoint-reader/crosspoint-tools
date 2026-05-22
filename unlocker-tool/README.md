# Xteink Unlocker

Desktop app that installs CrossPoint Reader (and other compatible firmwares) on USB-locked Xteink X3/X4 devices by intercepting their OTA update mechanism. Works against stock Xteink firmware as well as already-flashed CrossPoint and CrossInk devices, enabling cross-flashing between firmwares.

See [`RELEASING.md`](./RELEASING.md) for the build, signing, and release pipeline.

## How it works

1. The Mac becomes a Wi-Fi hotspot via a `feth` virtual upstream + Internet Sharing. (Windows uses Mobile Hotspot — see below.)
2. The privileged helper runs DNS / HTTP / HTTPS listeners bound to the bridge IP. DNS spoofs three hostnames: the locale's Xteink API host (`api-prod.xteink.cc` / `.cn`), `api.github.com`, and `unlocker.crosspointreader.com`. HTTPS uses a real Let's Encrypt cert for `unlocker.crosspointreader.com` — trusted by ESP-IDF's `esp_crt_bundle`, so both stock and CrossPoint/CrossInk firmwares accept it.
3. The user taps **Check for Updates** on the device. Depending on what's running:
   - **Stock Xteink** → hits `https://api-prod.xteink.{cc,cn}/api/v1/check-update`. We return a manifest pointing at a plain-HTTP firmware URL on the bridge IP.
   - **CrossPoint / CrossInk / INX** → hits `https://api.github.com/repos/{owner}/{repo}/releases/latest`. We return a GitHub-shaped releases JSON with the expected asset names (`firmware.bin`, plus CrossInk's `firmware-{tiny,xlarge,no_emoji}-…bin` variants) all pointing at the same firmware bytes on `unlocker.crosspointreader.com`. INX receives an HTTPS asset URL because its updater requires it; CrossPoint/CrossInk receive HTTP to reduce OTA memory pressure.
4. Whichever name the device picked, the bytes returned are whatever firmware the user chose in the unlocker UI — the asset name is decoupled from the bytes, which is what enables cross-flashing.
5. The device installs via its own `esp_https_ota` flow.

The firmware Unlocker serves comes from a **catalog** — currently `https://crosspointreader.com/api/catalog`. For other firmwares, see [`INTEGRATION.md`](./INTEGRATION.md).

## Layout

```
crates/
  unlocker-core/    library: orchestrator, runtime, manifest server, DNS, certs, catalog, helper RPC client
  unlocker-helper/  privileged helper binary (runs as root via osascript admin prompt)
app/
  src/              React + Tailwind frontend
  src-tauri/        Tauri 2 shell
scripts/
  bump-version.sh         bump tauri.conf + Cargo.toml + package.json (major|minor|patch)
  build-macos.sh          tauri build → inject helper → sign → notarize → update bundle
  build-macos-dev.sh      same as above but skips notarization (faster local iteration)
  build-windows.ps1       Windows equivalent of build-macos.sh (NSIS + MSI + signtool)
  build-linux.sh          Linux x86_64 (AppImage + deb + rpm)
  upload-to-cloudflare.sh push macOS artifacts to R2 + refresh latest-darwin-*.json
  upload-to-cloudflare.ps1 Windows equivalent
  upload-to-cloudflare-linux.sh Linux equivalent (latest-linux-x86_64.json)
  release.sh              the whole pipeline: bump → build → commit → tag → push → upload
firmware-patches/         pre-patched firmware bins for cases the catalog can't cover
                          (e.g. the X3 eFuse blk validity workaround)
workers/
  releases/               Cloudflare Worker fronting the R2 bucket at
                          unlocker-releases.crosspointreader.com
```

## Development

```bash
cd app && npm install

# headless checks
cargo check --workspace
npm run build

# dev mode (frontend only — helper integration needs the bundled flow below)
npm run tauri dev
```

In dev mode the bundled helper isn't available. To exercise the helper path locally, build it and let the app launch it on demand via the admin prompt:

```bash
cargo build --release -p unlocker-helper
```

The signed app bundles the helper binary at `Contents/MacOS/unlocker-helper` and launches it as root on demand via `osascript`'s admin password prompt — no LaunchDaemon, no SMAppService, no provisioning profile. The helper writes a crash-recovery state file to `/var/db/com.sofriendly.crosspoint.unlocker.helper.state.json` and reverses any leftover changes (pfctl rules, `feth` interfaces, NAT plist) on next launch.

For producing signed bundles to test the full flow, see [`RELEASING.md`](./RELEASING.md) — `scripts/build-macos-dev.sh` is the fastest path (skips notarization).

## Helper launch at runtime

When the orchestrator needs the helper, the app shells out to `osascript` with an admin password prompt and exec's `unlocker-helper` from inside the bundle as root. This replaced an earlier SMAppService/LaunchDaemon design that ran into provisioning-profile requirements on macOS 26. The helper exits when the app does (or via explicit teardown RPC); next session, a fresh prompt.

On Windows the equivalent is a UAC prompt: the app calls `Start-Process -Verb RunAs` to launch `unlocker-helper.exe`, which carries a `requireAdministrator` manifest. The RPC channel is a named pipe at `\\.\pipe\com.sofriendly.crosspoint.unlocker.helper` instead of a Unix socket.

On Linux the app uses `pkexec` to authorize a short root shell trampoline. That shell kills any stale helper, starts the bundled `unlocker-helper` in the background, and exits so the unprivileged app can connect to the helper's Unix socket.

## Windows

Windows uses Mobile Hotspot (`NetworkOperatorTetheringManager`) for AP + NAT + DHCP in one step — no equivalent of macOS's "enable Internet Sharing in System Settings" handoff. The host always lands at `192.168.137.1` and clients are on `192.168.137.0/24`. Device discovery scans the system ARP table under that subnet rather than reading a `dhcpd_leases` file.

Requirements:
- Windows 10 1607 or newer (Windows 11 recommended).
- A Wi-Fi adapter that supports Mobile Hotspot.
- An active internet connection — Windows' tethering API requires a profile to share. (macOS bypasses this with a fake `lo0` upstream; Windows doesn't allow it.)

## Debugging

The helper writes a verbose log of every DNS query, every HTTP/HTTPS request, and every state transition. This is the primary tool for diagnosing OTA failures and noticing when firmware OEMs change their API shape.

- **macOS:** `/tmp/unlocker-helper.log`
- **Linux:** `/tmp/unlocker-helper.log` and `/tmp/unlocker-helper.stdout`
- **Windows:** `C:\ProgramData\CrossPoint\unlocker-helper\unlocker-helper.log`

The file is overwritten on each helper launch. Bump verbosity by setting `RUST_LOG=unlocker_core=debug,unlocker_helper=debug` in the environment that launches the app.

What gets logged on every session:

- `dns query host=… spoofed=true|false` — every DNS lookup the device makes. New unfamiliar hosts here mean the firmware is talking to an endpoint we don't yet spoof.
- `http request method=… uri=… host=… ua=…` — middleware logs every HTTP/HTTPS hit before any handler runs, including ones that fall through to `catch_all`.
- `stock device requested update` / `device requested update via GitHub API` / `device activate` — handler-level logs for the recognized OTA endpoints.
- `unknown request — returning ok stub` (warn level) — fallback handler. Returns a `{code:0,message:"ok",data:{}}` envelope on any unrecognized path so the device doesn't see a 404. Watch this in logs to find new endpoints to promote to real handlers.
- `firmware download requested` / `serving firmware` — the actual OTA payload transfer. Includes the device's `x-esp32-*` headers, range, and SHA verification of the bytes on disk against the catalog hash.

For OTA install failures, the helper log shows everything *we* see; it can't show the device-side `esp_err_t` from `esp_https_ota_*`. For that, attach USB serial to the device (`screen /dev/cu.usbmodem* 115200` on macOS) and watch the firmware's own `LOG_ERR("OTA", …)` lines.

## License

MIT.
