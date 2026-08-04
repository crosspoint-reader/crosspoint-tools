# Biscuit OTA rescue findings

Date verified: 2026-07-27 (Australia/Sydney)

Scope: source analysis and a maintainer-ready `crosspoint-tools` patch. No Biscuit
source was changed, no firmware or installer was built, and nothing was installed
on a device.

> [!CAUTION]
> The leaf certificate currently committed in
> `unlocker-tool/crates/unlocker-helper/certs/fullchain.pem` expires on
> **2026-07-30**. Any maintainer-built Windows test installer must use a
> currently valid `unlocker.crosspointreader.com` certificate, its complete
> chain, and the maintainers' legitimate matching private key. The private key
> must not be requested, shared, generated under that domain, or committed.

## Plain-English diagnosis

There are two independent stages.

1. **Stage A - manifest connection:** Biscuit resolves `api.github.com`, opens
   TLS to port 443, and requests its GitHub release manifest. The old Unlocker
   logged only requests that completed TLS and reached Axum. It could report
   that servers were armed before port 443 had actually bound, and its server
   dependency discarded TLS handshake errors before HTTP middleware. This made
   the observed "DNS works, Biscuit says Update failed, no manifest request is
   logged" sequence possible without revealing the cause.
2. **Stage B - firmware download:** The old generic GitHub response supplied an
   `http://` firmware URL. Biscuit calls `esp_https_ota` with HTTP OTA disabled
   in its pinned ESP32-C3 framework configuration, so that URL would fail even
   after Stage A succeeded. Biscuit needs the HTTPS firmware URL.

This patch fixes the confirmed Stage B mismatch and adds the missing Stage A
observability. It does not weaken TLS.

## Confirmed Biscuit behavior

The Biscuit checkout used for this verification was commit
`483ac2951bc98b71bafacb18adbcac99da04bbe0`.

- Manifest URL:
  `https://api.github.com/repos/yattsu/biscuit/releases/latest`
  ([source](https://github.com/yattsu/biscuit/blob/483ac2951bc98b71bafacb18adbcac99da04bbe0/src/network/OtaUpdater.cpp#L11)).
- User-Agent: `Biscuit-ESP32-<version>`
  ([source](https://github.com/yattsu/biscuit/blob/483ac2951bc98b71bafacb18adbcac99da04bbe0/src/network/OtaUpdater.cpp#L25-L28)).
- `esp_crt_bundle_attach` remains enabled while certificate hostname/common-name
  matching is skipped. The chain is still verified
  ([source](https://github.com/yattsu/biscuit/blob/483ac2951bc98b71bafacb18adbcac99da04bbe0/src/network/OtaUpdater.cpp#L68-L76)).
- The parser requires a string `tag_name`, an `assets` array, and an asset named
  exactly `firmware.bin`
  ([source](https://github.com/yattsu/biscuit/blob/483ac2951bc98b71bafacb18adbcac99da04bbe0/src/network/OtaUpdater.cpp#L122-L156)).
- Versions are parsed with unchecked `sscanf("%d.%d.%d")` calls into
  uninitialized integers. A leading `v` is unsafe; `99.9.9` is the required
  shape
  ([source](https://github.com/yattsu/biscuit/blob/483ac2951bc98b71bafacb18adbcac99da04bbe0/src/network/OtaUpdater.cpp#L163-L176)).
- The manifest callback stores only non-chunked response data and allocates from
  the reported content length. A fixed body with an accurate `Content-Length`
  is required
  ([source](https://github.com/yattsu/biscuit/blob/483ac2951bc98b71bafacb18adbcac99da04bbe0/src/network/OtaUpdater.cpp#L30-L58)).
- Biscuit does not inspect the manifest HTTP status before parsing the body
  ([source](https://github.com/yattsu/biscuit/blob/483ac2951bc98b71bafacb18adbcac99da04bbe0/src/network/OtaUpdater.cpp#L103-L126)).
- Transport, TLS, client setup, JSON, missing-asset, OTA begin, incomplete
  transfer, and OTA finish errors are collapsed into the generic UI failure
  ([result definitions](https://github.com/yattsu/biscuit/blob/483ac2951bc98b71bafacb18adbcac99da04bbe0/src/network/OtaUpdater.h#L16-L24),
  [UI mapping](https://github.com/yattsu/biscuit/blob/483ac2951bc98b71bafacb18adbcac99da04bbe0/src/activities/settings/OtaUpdateActivity.cpp#L29-L46)).

## Confirmed Unlocker behavior before this patch

- DNS already spoofs `api.github.com` and
  `unlocker.crosspointreader.com` and logs DNS query details
  (`unlocker-tool/crates/unlocker-core/src/dns.rs:23-39,122-151`).
- The GitHub-shaped route already matches
  `/repos/{owner}/{repo}/releases/latest`
  (`unlocker-tool/crates/unlocker-core/src/http.rs`).
- The generic manifest already used the bare tag `99.9.9`, the selected
  firmware's byte size, and `firmware.bin` for non-CrossInk repositories.
- Biscuit previously followed the generic HTTP firmware URL. Only INX and
  CrossPet normally selected HTTPS.
- Firmware responses already have an explicit `Content-Length` and log stream
  completion or early disconnect.
- HTTP and HTTPS binds happened inside detached tasks. "manifest servers up"
  was logged immediately after spawning them, before either bind result was
  known.
- `axum-server` 0.8.0 handles acceptor results with `if let Ok(...)`; TLS
  errors were discarded before the Axum request logger.
- Rustls uses one certificate chain for all SNI names. There is no application
  SNI rejection rule.
- The helper embeds `fullchain.pem` and compile-time includes an ignored,
  non-public `privkey.pem`
  (`unlocker-tool/crates/unlocker-helper/src/servers.rs:19-20`,
  `unlocker-tool/.gitignore:12`).
- The source starts Windows Mobile Hotspot but does not create Windows Firewall
  rules. The inspected machine currently has enabled Public-profile inbound
  allow rules for the installed helper on TCP and UDP, so Firewall is not the
  leading explanation on that machine.

## What this patch changes

### Stage A diagnostics

- HTTP port 80 and HTTPS port 443 are synchronously bound before `start`
  returns success (`unlocker-tool/crates/unlocker-core/src/http.rs:798-809,895-928`).
- Bind failures are logged with server name, address, and the OS error, then
  returned to the helper/UI.
- Every accepted HTTPS TCP connection logs client and local addresses before
  the TLS handshake (`http.rs:147-172`).
- The TLS wrapper logs handshake start, success, exact available failure error,
  negotiated TLS version, cipher, ALPN, and SNI on successful handshakes
  (`http.rs:174-220`).
- `axum-server` does not expose its partially parsed ClientHello after a failed
  `RustlsAcceptor` future. The failure record therefore says
  `sni_available=false`; it does not claim a failed-handshake SNI value.
- Server futures are supervised. Unexpected clean exits, returned I/O errors,
  panics, cancellations, and shutdown join errors are surfaced
  (`http.rs:812-842`).
- Existing HTTP method, Host, path, and User-Agent logging remains in place.
  Biscuit responses now additionally log the exact JSON and byte length.

Expected Stage A log order for a successful request:

1. `server socket bound` for HTTP and HTTPS
2. `manifest servers ready; both sockets bound`
3. `incoming HTTPS TCP connection`
4. `TLS handshake start`
5. `TLS handshake success` with SNI/TLS/cipher/ALPN
6. `http request` with method/Host/path/User-Agent
7. `device requested update via GitHub API (latest)`
8. `serving fixed-length Biscuit manifest response`

If the sequence stops earlier, the new last record identifies the stage.

### Biscuit manifest

Only a repository name equal to `biscuit` selects this response:

```json
{
  "tag_name": "99.9.9",
  "name": "CrossPoint <selected version>",
  "assets": [
    {
      "name": "firmware.bin",
      "browser_download_url": "https://unlocker.crosspointreader.com/firmware/firmware.bin",
      "size": "<exact selected firmware byte size>",
      "content_type": "application/octet-stream"
    }
  ]
}
```

The actual `size` is a JSON number. The response is serialized once and sent
with explicit `Content-Type: application/json` and exact `Content-Length`. It
does not set `Transfer-Encoding` (`http.rs:554-590,646-694`).

Stock Xteink, CrossPoint, CrossInk, INX, CrossPet (including its HTTP toggle),
and CPR-vCodex keep their existing behavior. Tests cover those branches.

### Diagnostic chip ID

The image metadata logger incorrectly identified chip ID 5 as ESP32-S3 and 6
as ESP32-C3. Espressif assigns ID 5 to ESP32-C3 and ID 9 to ESP32-S3. The map
and focused test are corrected (`http.rs:86-141,1125-1129`).

## Escape Hatch safety result

No catalog code was changed and no duplicate release was added.

The existing live release and UI entry were verified:

- worker catalog ID: `recovery-escape-hatch`
  (`worker/index.ts:3470-3488`)
- namespaced UI ID: `xteink:recovery-escape-hatch`
  (`unlocker-tool/app/src/screens/Firmware.tsx:71-77,218-228`)
- supported devices: X3 and X4
- current verified image on 2026-07-27: 446,736 bytes, SHA-256
  `843c1f2e4f765f2010728637ed5d77e44cbeb6e68fb170365437ec7f4f8409f4`
- normal ESP application image, ESP32-C3 chip ID 5, secure version 0
- substantially smaller than the `0x640000` OTA application slot
- same 16 MB dual-OTA partition layout as Biscuit and CrossInk
- browses `.bin` files on SD, validates the application image, writes the
  inactive application slot, updates OTA selection data, and reboots

It does not require or supply a bootloader, partition-table image, NVS image,
or full-flash image.

## Validation

Completed locally without any production private key:

- `cargo fmt -p unlocker-core -- --check`
- `cargo test --locked -p unlocker-core` - 4 passed, 0 failed
- `cargo check --locked -p unlocker-core`
- `cargo clippy --locked -p unlocker-core --all-targets` - completed with three
  pre-existing warnings in `transport.rs` and `types.rs`; no warning points to
  the changed HTTP/TLS code
- `git diff --check`

The full workspace `cargo fmt --all -- --check` reports pre-existing format
drift in `unlocker-tool/app/src-tauri/src/lib.rs`. That unrelated file was not
reformatted or included in this focused patch; the modified Rust crate passes
its scoped format check.

Strict Clippy with `-D warnings` is blocked by the same three unrelated
pre-existing warnings (two unnecessary casts in `transport.rs` and a derivable
`Default` implementation in `types.rs`). Those files were left unchanged.

Not run:

- `cargo check/test -p unlocker-helper`: the public checkout intentionally
  lacks `unlocker-tool/crates/unlocker-helper/certs/privkey.pem`, which is
  required by `include_str!` at compile time.
- Windows installer build: only maintainers with the legitimate certificate
  infrastructure can produce a device-usable build.
- Frontend checks: no frontend source or configuration changed.
- Device OTA/install: deliberately out of scope for this patch run.

No temporary key, self-signed replacement, TLS bypass, bootloader image,
partition-table image, or firmware image was created.

## Maintainer testing instructions

The maintainer-produced Windows test installer must contain a currently valid
certificate for `unlocker.crosspointreader.com`, the complete chain, and the
matching legitimate private key.

1. Select X4.
2. Select the verified Escape Hatch recovery image.
3. Start the hotspot and confirm the log reports both port 80 and port 443 as
   bound before it reports the servers ready.
4. Connect the Biscuit device to the hotspot.
5. Confirm Biscuit resolves `api.github.com` to `192.168.137.1`.
6. Run **Check for Updates once**.
7. Save the complete helper log. Confirm it contains either the successful
   Stage A sequence above or an exact bind/TCP/TLS failure.
8. For a successful request, verify the logged Biscuit JSON has one
   `firmware.bin`, exact selected byte size, bare `99.9.9`, and the HTTPS URL.
9. Do **not** confirm installation on the device until the selected application
   image, hash, size, ESP32-C3 chip ID, and manifest have all been reviewed.

## Unresolved risks

- The currently installed helper binary does not contain this logging; a
  maintainer-built test installer is required.
- The exact old Stage A failure remains unknown until a request is captured
  with the new diagnostics.
- The committed certificate is close to expiry and must not be used for a test
  after its validity window.
- SNI is available from the chosen wrapper only after a successful Rustls
  handshake. Failed handshakes report the exact available error but no SNI.
- A successful manifest response does not itself prove that the selected
  firmware is safe. Maintainers must verify the image before allowing install.
- No device installation was performed as part of this work.

## Draft pull request

### Title

`feat(unlocker): support Biscuit OTA rescue and expose TLS failures`

### Body

```markdown
## Summary

Adds an explicit, fixed-length GitHub release response for Biscuit and exposes
the TCP/TLS failures that currently occur before Axum request logging.

## Why

Biscuit requests:

`https://api.github.com/repos/yattsu/biscuit/releases/latest`

It requires a bare numeric tag, an exact `firmware.bin` asset, and a
non-chunked manifest with an accurate `Content-Length`. Its `esp_https_ota`
configuration rejects the generic HTTP firmware URL previously returned by the
Unlocker.

The old listener startup also reported "servers up" before the port 80/443 bind
results were known, while axum-server discarded TLS accept errors before HTTP
middleware. This made pre-manifest failures invisible.

## Changes

- bind HTTP/HTTPS sockets before reporting readiness
- return and log bind errors clearly
- log HTTPS TCP accepts, client address, TLS start/result, negotiated
  TLS/cipher/ALPN, and successful-handshake SNI
- supervise server task exits and failures
- add Biscuit-only `99.9.9` / `firmware.bin` manifest using the exact selected
  size and HTTPS firmware URL
- explicitly set Biscuit JSON `Content-Length`; no chunked transfer encoding
- preserve stock Xteink, CrossPoint, CrossInk, INX, CrossPet, and CPR-vCodex
  behavior
- correct ESP32-C3 image chip ID from 6 to 5 (ESP32-S3 is 9)
- add focused response and compatibility tests
- document Stage A/Stage B findings and Escape Hatch verification

## Validation

- `cargo fmt -p unlocker-core -- --check`
- `cargo test --locked -p unlocker-core` (4 passed)
- `cargo check --locked -p unlocker-core`
- `git diff --check`

Full helper/installer builds were not run because the public repository omits
the production `privkey.pem`. No replacement key or TLS bypass was introduced.

## Certificate action required

The committed leaf certificate expires on 2026-07-30. Any Windows test build
must use a currently valid `unlocker.crosspointreader.com` certificate, complete
chain, and the maintainers' legitimate matching private key.

## Maintainer test request

Please produce a Windows test installer with the renewed legitimate
certificate infrastructure, run one Biscuit update check without confirming
installation, and attach the complete helper log. Please also confirm the
current X4 Escape Hatch catalog image/hash before device installation.
```

## Draft maintainer issue

### Title

`Request: Biscuit OTA rescue review, renewed-cert Windows build, and TLS diagnostic test`

### Body

```markdown
## Request

Please review the Biscuit OTA rescue patch and produce a Windows test installer
using the legitimate Unlocker TLS private key and a currently valid
`unlocker.crosspointreader.com` certificate with its complete chain.

## Urgent certificate note

The leaf certificate currently committed in `fullchain.pem` expires on
2026-07-30. A test installer must not be issued with an expired or nearly
expired chain. Please renew it through the project's normal certificate
infrastructure. Do not publish the private key.

## What needs confirmation

1. Review the Biscuit-only manifest contract:
   - `tag_name` exactly `99.9.9`
   - exactly one `firmware.bin` asset
   - exact selected firmware size
   - `https://unlocker.crosspointreader.com/firmware/firmware.bin`
   - explicit JSON `Content-Length`, no chunked transfer encoding
2. Confirm the current Escape Hatch catalog image is the intended X4/ESP32-C3
   application-only rescue image and confirm its published hash.
3. Build a Windows test installer with the legitimate renewed certificate/key.
4. Run one Biscuit **Check for Updates** attempt and collect the complete helper
   log without confirming installation.
5. Verify the log shows socket bind results, incoming client address, TLS
   handshake start/result, successful-handshake SNI/TLS/cipher/ALPN, HTTP
   method/Host/path/User-Agent, exact manifest JSON, and any firmware stream
   completion or early disconnect.

## Why diagnostics are needed

The observed device resolves `api.github.com` to `192.168.137.1` but reports
`Update failed` without an HTTP manifest request in the old helper log. The old
server could report ready before port 443 bound, and TLS accept errors were
discarded before Axum middleware. The patch makes those stages observable but
the original failure cannot be identified until tested in a maintainer build.

No USB recovery, TLS weakening, self-signed replacement, private-key sharing,
or bootloader/partition-table changes are requested.
```
