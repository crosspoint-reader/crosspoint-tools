# Integration guide

How to use Xteink Unlocker as the install path for a custom firmware other than CrossPoint Reader.

Unlocker is mostly mechanism: hotspot setup, DNS/HTTPS spoofing of Xteink's update API, manifest generation, firmware streaming. The firmware it serves comes from a **catalog** — a JSON document hosted by the firmware project. To support a new firmware, you provide a catalog and (currently) point a build of Unlocker at it.

This document covers what your firmware and your catalog have to do for that to work.

---

## 1. What Unlocker provides

When the user runs Unlocker:

1. The Mac comes up as a Wi-Fi hotspot via Internet Sharing (upstream and bridge interfaces are discovered at runtime, see the README).
2. A spoofed DNS resolver answers the locale's Xteink API host (`api-prod.xteink.cc` or `api-prod.xteink.cn`) with the bridge IP.
3. An HTTPS server on the bridge IP answers `GET /api/v1/check-update` with a manifest pointing at a firmware URL Unlocker also serves.
4. The device fetches the firmware over plain HTTP from the bridge IP and installs via its built-in `esp_https_ota` flow.

The device sees a normal vendor OTA. Your firmware's only job is to be a valid ESP32-C3 OTA app image that the stock bootloader will accept.

---

## 2. Firmware requirements

### 2.1 Image format

A standard ESP-IDF OTA app partition image (the output of `idf.py build`, suitable for `esp_ota_write`). Not a full-flash image — bootloader and partition table stay untouched. Stock images observed in the wild are ~6.3 MB.

### 2.2 Target

ESP32-C3 (single-core RISC-V). Both X3 and X4 ship with the same SoC; the same OTA binary can target both if your build doesn't need per-model differentiation.

### 2.3 Code signing

Stock Xteink builds **do not** ship `CONFIG_SECURE_SIGNED_OTA`. Unlocker depends on this. If a future stock OTA enables signature verification on the running firmware before accepting a new image, this whole approach stops working — for any third-party firmware, not just CrossPoint.

### 2.4 The X3 eFuse blk validity gotcha (critical)

Xteink X3 stock firmware links a prebuilt `libbootloader_support.a` whose `process_segments` reads `min/max_efuse_blk_rev_full` from a misaligned `bootloader_mmap` pointer when validating an incoming OTA image. The values it pulls are garbage (we've seen `v38.83`, `v445.99`, etc.) and fail the eFuse block-revision check, aborting the install with:

```
E (xxxxxx) boot_comm: Image requires efuse blk rev >= vXX.XX, but chip is v1.3
```

**This is a stock-firmware bug, not something your image format can fix.** Patching the appdesc fields in the binary doesn't help — the same garbage gets read regardless of what you write at the documented offsets, and the value even varies with how the file is delivered (TLS record boundaries seem to influence what page lands in mmap).

The only known workaround is to override the check **in the firmware you're shipping**, so that when the *next* OTA after yours runs, the buggy validator is no longer in the image path. Once a build with the override is installed, subsequent OTAs work normally.

Add a file like this to your project, compiled into your app:

```c
// Override the prebuilt libbootloader_support.a implementation.
// The X3's validation code misreads the new image's esp_app_desc_t through a
// misaligned bootloader_mmap pointer, producing garbage eFuse block revision
// values that fail the check. Safe to skip: the eFuse block revision gate is
// a manufacturing concern, not a runtime safety issue.
#include <esp_err.h>
esp_err_t __wrap_bootloader_common_check_efuse_blk_validity(uint32_t min_rev_full, uint32_t max_rev_full) {
    (void)min_rev_full;
    (void)max_rev_full;
    return ESP_OK;
}
```

Then add the linker wrap flag to your component's `CMakeLists.txt`:

```cmake
target_link_options(${COMPONENT_LIB} INTERFACE "-Wl,--wrap=bootloader_common_check_efuse_blk_validity")
```

Reference implementation: see `crosspoint-reader/src/platform/skip_efuse_blk_check.c` in the CrossPoint repo.

X4 has not been observed to need this. If you only target X4 you can skip it, but shipping the override on both is harmless.

### 2.5 Recovery considerations

A botched OTA on a USB-locked device may only be recoverable via the OTA partition's A/B rollback or via UART. Make sure your image marks itself valid (`esp_ota_mark_app_valid_cancel_rollback`) only after enough of the firmware has come up that you'd want to keep it. Otherwise the device self-rollbacks to stock on next boot, which is the safer default while you're iterating.

---

## 3. Catalog endpoint

Unlocker fetches a single JSON document at app launch and at the firmware-selection step. Schema (`schema_version: 1`):

```json
{
  "schema_version": 1,
  "releases": [
    {
      "id": "stable-1.2.0",
      "channel": "stable",
      "name": "1.2.0",
      "version": "1.2.0",
      "released_at": "2026-04-15T00:00:00Z",
      "notes": "Free-text changelog shown to the user.",
      "firmware_url": "https://your.example.com/firmware/1.2.0.bin",
      "firmware_sha256": "abc123...",
      "size": 6291456,
      "supported_devices": ["x3", "x4"]
    }
  ]
}
```

### Field semantics

| Field | Required | Notes |
|---|---|---|
| `schema_version` | yes | Currently `1`. |
| `releases` | yes | Flat array. Empty is allowed (UI shows "no releases"). |
| `id` | yes | Stable identifier. Unlocker uses it as a cache/selection key. |
| `channel` | yes | One of `stable`, `beta`, `insider`. Drives which card the release appears under. |
| `name` | yes | Shown in the UI. For `beta` with multiple active entries, this is the differentiator. |
| `version` | yes | Free-form version string. |
| `released_at` | yes | RFC 3339. |
| `notes` | yes | Plain text or `\n`-separated lines. Shown verbatim. |
| `firmware_url` | yes | Absolute HTTPS URL Unlocker downloads. May follow redirects. |
| `firmware_sha256` | recommended | Hex string. If present, Unlocker verifies post-download and refuses on mismatch. If null, the locally-computed hash is the cache key only. |
| `size` | yes | Bytes. Used for progress reporting; the actual `Content-Length` from the download wins. |
| `supported_devices` | optional | Array of `"x3"`, `"x4"`. If omitted Unlocker assumes both. |

### Channel UI behaviour

Unlocker renders three cards: Stable, Beta, Insider.

- **Stable** / **Insider** — one tap installs the latest release on that channel.
- **Beta** — zero entries disables the card. One entry: tap installs. Two or more: tap expands into a sub-list keyed by `name`.

If a channel has no releases, omit those rows; don't synthesise placeholders.

### Hosting and caching

Edge-cache for ~5 minutes. Unlocker also persists the last successful catalog response to disk and falls back to it if the live fetch fails (so users don't get stuck if your worker is briefly down).

CORS isn't required — Unlocker fetches from a native Rust client.

### Reference implementation

CrossPoint's catalog is built by a Cloudflare Worker that aggregates GitHub Releases (stable), R2-stored nightlies (insider), and manually-uploaded beta builds. See `crosspointreader-com-catalog-spec.md` in this repo for shape rationale and the worker sketch.

---

## 4. Pointing Unlocker at your catalog

The catalog URL is currently a constant in `crates/unlocker-core/src/catalog.rs`:

```rust
pub const CATALOG_URL: &str = "https://crosspointreader.com/api/catalog";
```

For now, integrate by forking and patching that constant (and the bundle identifiers, branding, and signing identity in `app/src-tauri/tauri.conf.json` and `scripts/build-macos.sh`). A future revision will likely make this a build-time configuration with per-firmware branding. If you're integrating, open an issue — that future shape should be informed by your needs.

What you'll want to change in a fork:

- `CATALOG_URL` in `catalog.rs`
- `productName`, `identifier`, and update endpoint in `app/src-tauri/tauri.conf.json`
- App name, helper bundle ID, signing identity in `scripts/build-macos.sh`
- Copy and branding in the React UI under `app/src/`
- The auto-update endpoint and signing key (see README §Auto-update infrastructure)

What you should **not** need to change:

- The orchestrator state machine
- The DNS / HTTP / HTTPS spoofing servers
- Anything in `crates/unlocker-helper`
- The Xteink protocol assumptions in `crates/unlocker-core/src/http.rs`

---

## 5. Testing checklist

Before publishing a build of Unlocker pointed at your catalog:

- [ ] Catalog returns valid JSON matching schema_version 1.
- [ ] `firmware_sha256` matches the actual blob bytes (use `shasum -a 256`).
- [ ] `size` matches `Content-Length` of the firmware URL.
- [ ] Firmware URL is reachable from a fresh client (no auth required, CORS irrelevant, redirects OK).
- [ ] Firmware boots on stock X3 — confirms the eFuse blk override (§2.4) is wired.
- [ ] Firmware boots on stock X4.
- [ ] After install, your firmware can OTA itself (i.e. it doesn't lock out further updates that *also* go through Unlocker, or via your own OTA mechanism if you ship one).
- [ ] Recovery path documented: if your firmware fails to boot, what does the user do? Unlocker can run again as long as stock is still on the rollback slot.

---

## 6. Things that will probably bite you

- **HTTPS to the device.** Stock validates the TLS hostname against `api-prod.xteink.cc`/`.cn` but not the cert chain. Unlocker uses a self-signed cert with the right SAN. If you change hostnames, change the cert.
- **HTTP/2.** ESP32-C3's `esp_http_client` doesn't do HTTP/2. Unlocker pins the HTTPS listener to HTTP/1.1 via ALPN. Don't undo that.
- **Range requests.** Stock has been observed issuing `Range:` requests. The firmware handler honours them; if you swap the handler out, keep that.
- **Streaming vs full-body delivery.** During X3 OTA debugging we observed that *how* the file is delivered (chunked stream vs. single buffered response) deterministically changes which garbage value the buggy bootloader reads. Currently the handler reads the whole file and returns it as a single body. Don't switch back to streaming without re-testing on X3.
- **DHCP lease detection.** Helper polls `/var/db/dhcpd_leases` and matches by subnet (not MAC vendor) to find the device. If you change the bridge subnet, update the matcher.

---

## 7. Getting help

File issues at `github.com/crosspoint-reader/xteink-unlocker`. If you're standing up a new catalog, mention what firmware it serves so we can prioritise making the catalog URL a config rather than a fork point.
