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

## X4 Pro OTA system

The X4 Pro (`ESP32S3_X4_TL`) is a different, more locked-down OTA design than the X3/X4 (`ESP32C3` / `ESP32C3_X3`). Everything below was reverse-engineered from live traffic capture, the companion app, and a full-flash dump. It matters here because the plain-firmware manifest spoof that unlocks the X3/X4 does **not** directly work on the Pro (see *Implications* at the end).

### Check-update request

The device calls the same host as the X3/X4 but over **plain HTTP**, and the exact identifiers differ from what you'd guess:

```
GET http://api-prod.xteink.cc/api/v1/check-update
      ?current_version=V7.0.8
      &device_type=ESP32S3_X4_TL_SSD1677     # note the panel/controller suffix
      &device_id=11226248                    # short numeric id
      &lng=en
      &ota_type=1                            # 0 and 1 both return the same image
Headers:
  user-agent:     ESP32 HTTP Client/1.0
  device_id:      11226248_7C_E8_B1_AB_4C_88 # numericId_MAC
  device_type:    ESP32S3_X4_TL              # NO panel suffix in the header
  device_version: V7.0.8
  request_source: eink
```

Key gotcha: the query-string `device_type` is **`ESP32S3_X4_TL_SSD1677`** (model + `_SSD1677` panel-controller suffix), while the header `device_type` is the bare `ESP32S3_X4_TL`. Querying with the bare type returns `{"data":null,"message":"No update available"}` — that string was the reason this endpoint looked empty for a long time. China mirror is `api-prod.xteink.cn`.

### Check-update response

```jsonc
{ "code": 0, "data": {
  "version": "V7.0.8",
  "download_url": "https://overseas-static-file.oss-ap-southeast-1.aliyuncs.com/firmware/encrypted/ESP32S3_X4_TL_SSD1677/<uuid>/ota_type_1/xteink_app_update_x4pro_7.0.8_<date>.xota",
  "size": 6792746,              // encrypted .xota size (on-wire)
  "ota_format": "encrypted_v1", // <-- the whole problem
  "ota_type": 1,
  "plain_size": 6792544,        // decrypted image size
  "plain_sha256": "369cfee9…",  // sha256 of the DECRYPTED image
  "checksum": { "crc32": null, "sha256": "369cfee9…" },
  "force_update": false, "change_log": "", "upload_time": "…"
}, "message": "Update available" }
```

Firmware is delivered **encrypted** (`ota_format: encrypted_v1`, `.xota`). There is no plain variant — `ota_type` 0 and 1 return the same bytes under different OSS paths.

### `.xota` encryption

- Layout: 4-byte magic `XOTA`, then a **202-byte header** (includes an IV; no plaintext EC point), then the encrypted body of exactly `plain_size` bytes (size-preserving cipher, so the body decrypts in place).
- Scheme (from strings in the app: `xteink.xtapp.appdek.wrap.v2`, `P256-ECDH-HKDF-SHA256-AESKW`, `crypto_chunk`): ECIES-family — P-256 ECDH → HKDF-SHA256 → AES-Key-Wrap of a content key → AES body cipher. The recipient key is **firmware-global** (one `.xota` decrypts on every X4 Pro — proven because the published `plain_sha256` is the same for all units), so the key is a constant baked into the app image, not per-device.
- The decryption key/format has **not** been fully extracted yet (RE in progress). Blind brute-force of the obvious layouts failed; it needs disassembly of the app's XOTA parser.
- **You don't need to decrypt to get a plain image.** Once installed, the decrypted firmware lives in the device's app partition, so an app-slot dump over USB yields the plain, flashable image. Verified: the first `plain_size` bytes of a dumped `app0` hash to the server's `plain_sha256`. This is how `crosspointreader.com` currently pins the plain X4 Pro stock build.

### Flash layout & OTA state

16 MB flash, dual OTA:

```
nvs      @ 0x009000  (0x5000)
otadata  @ 0x00e000  (0x2000)
app0/ota_0 @ 0x010000 (0x7e0000)   # main app (xteink_app); factory devices boot this
app1/ota_1 @ 0x7f0000 (0x7e0000)   # blank on a factory device
spiffs   @ 0xfd0000
coredump @ 0xfe4000
```

The Pro's bootloader has **app-rollback enabled** — the device's own otadata sits at state `VALID` (`0x2`). An externally-flashed slot written with state `NEW` gets booted once as "pending verify" and then **rolled back** to the old slot unless the freshly-booted app self-confirms via `esp_ota_mark_app_valid_cancel_rollback()`. A USB flasher has no such handshake, so writing `NEW` shows up to users as "had to flash twice." Fix: mark the flashed slot `VALID` directly (the CRC covers only the sequence number, so the state byte can be changed freely).

### NTP gate

The X4 Pro syncs its clock over NTP (`pool.ntp.org`, `time.google.com`, …) **before** it will hit check-update. On the unlocker's internet-less hotspot those lookups fail and the device spins forever on NTP, never reaching the OTA endpoint. The helper therefore also spoofs the NTP hostnames to the bridge IP and runs a minimal **SNTP responder** on UDP 123 (see `unlocker-core/src/ntp.rs`) that answers with the host clock. Without it, X4 Pro capture/flash never starts.

### Account binding & sync (context, not used by the unlocker)

Beyond check-update, the Pro also talks to an account-bound layer: it GETs `/api/v1/device/binding/query` and there's a separate sync service at `http://8.130.157.48:5000/api/v1/sync/check`. The companion app (`com.xteink.xtplushpaper`, Flutter) and web console (`xtcloud.xteink.cc`, whose runtime config points back at `api-prod.xteink.cc`) authenticate with a Bearer `xt_token` (`/auth/login`, HTTP Basic) and read per-device state via `/api/v1/device/tasks` (scoped to the logged-in user — passing a `user_id` param does nothing). None of this is needed to serve firmware; it's documented so unfamiliar hosts in the log aren't mistaken for OTA endpoints.

### Implications for the unlocker

- The X3/X4 unlock works because their OTA accepts a **plain** firmware image via the check-update manifest. The X4 Pro expects an `encrypted_v1` `.xota` and verifies the decrypted image against `plain_sha256`, so returning a plain image the same way will not install — producing a valid `.xota` needs the (not-yet-extracted) firmware key. Until then, the Pro is flashed over **USB** (the `crosspointreader.com` WebSerial flasher writes the OTA partition directly), not via the WiFi manifest spoof.
- Any X4 Pro capture/flow **must answer NTP first** (handled by the SNTP responder above).
- To diagnose a Pro without flashing anything, use Settings → **Start traffic capture** (capture-only mode): it arms the hotspot + DNS/HTTP/HTTPS + NTP and logs every request (full method/URI/headers/body) while returning "no update" to everything, so you can read exactly what the device sends.

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
  build-linux.sh          Linux x86_64/aarch64 (AppImage + deb + rpm)
  upload-to-cloudflare.sh push macOS artifacts to R2 + refresh latest-darwin-*.json
  upload-to-cloudflare.ps1 Windows equivalent
  upload-to-cloudflare-linux.sh Linux equivalent (latest-linux-*.json)
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

- `dns query host=… spoofed=true|false` — every DNS lookup the device makes. New unfamiliar hosts here mean the firmware is talking to an endpoint we don't yet spoof. (NTP hosts like `pool.ntp.org` show `spoofed=true` and are answered by the SNTP responder — see the X4 Pro section.)
- `http request (full capture) method=… uri=… host=… headers=[…] body=…` — middleware logs every HTTP/HTTPS hit before any handler runs (including ones that fall through to `catch_all`), with the **full headers and body**. This is where a device's real `device_id`, `device_type`, and any auth token show up. Note: it logs bearer tokens verbatim — it's a local debugging tool, but don't paste raw logs anywhere.
- `answered NTP time sync src=…` — the SNTP responder handed the device a clock (X4 Pro and other devices that time-sync before OTA).
- `stock device requested update` / `device requested update via GitHub API` / `device activate` — handler-level logs for the recognized OTA endpoints.
- `unknown request — returning ok stub` (warn level) — fallback handler. Returns a `{code:0,message:"ok",data:{}}` envelope on any unrecognized path so the device doesn't see a 404. Watch this in logs to find new endpoints to promote to real handlers.
- `firmware download requested` / `serving firmware` — the actual OTA payload transfer. Includes the device's `x-esp32-*` headers, range, and SHA verification of the bytes on disk against the catalog hash.

For OTA install failures, the helper log shows everything *we* see; it can't show the device-side `esp_err_t` from `esp_https_ota_*`. For that, attach USB serial to the device (`screen /dev/cu.usbmodem* 115200` on macOS) and watch the firmware's own `LOG_ERR("OTA", …)` lines.

## License

MIT.
