# CrossPoint Tools

[![Fund contributors](https://img.shields.io/badge/%F0%9F%91%91_Fund_contributors-royalty.dev-BB953A?style=for-the-badge&labelColor=1a1a1a)](https://app.royalty.dev/crosspoint-reader/crosspoint-reader)

Web-based firmware flasher, build system, and font builder for [CrossPoint Reader](https://github.com/crosspoint-reader/crosspoint-reader) devices. Hosted at [crosspointreader.com](https://crosspointreader.com).

## What it does

- **Stable firmware flashing** — Flash the latest CrossPoint release or stock Xteink firmware to X3 and X4 devices directly from the browser using WebSerial
- **Insider builds** — Nightly firmware compiled automatically from the upstream `master` branch
- **Beta builds** — Curated test builds exposed alongside stable, sourced from either an admin-uploaded `.bin` or a tagged GitHub release on the firmware repo
- **Custom font firmware** — Replace built-in fonts in the firmware with user-supplied TTF/OTF files via a CI build
- **SD-card font builder** — Convert TTF/OTF files into `.cpfont` files for SD-card font loading on the device, entirely in the browser via a WebAssembly build of FreeType (nothing is uploaded)
- **Stock firmware** — Restore original Xteink firmware (English or Chinese) for both X3 and X4
- **Admin dashboard** — Manually trigger builds, manage beta entries, and monitor build status

## Architecture

The project runs on [Cloudflare Workers](https://workers.cloudflare.com/) with [GitHub Actions](https://github.com/features/actions) handling everything that needs a real toolchain (firmware compilation, including custom-font firmware):

- **Worker** (`worker/index.ts`) — API routes, firmware proxying, beta/custom-build orchestration, static asset serving
- **R2 (`crosspoint-firmware`)** — Compiled firmware binaries and custom-build artifacts
- **KV (`BUILD_META`)** — Build metadata, sha caches, build state
- **Static assets** (`public/`) — HTML pages, the WebSerial flasher module, the admin dashboard, and bundled X3 firmware
- **GitHub Actions workflows** in `.github/workflows/` — long-running build jobs the Worker can dispatch
- **Browser (WebAssembly)** — the SD-card font builder; no server involved

## Build pipelines

### 1. Stable / insider firmware (`build-firmware.yml`)

A daily cron job (or manual trigger from `/admin`) dispatches the workflow, which:

1. Checks the upstream [crosspoint-reader/crosspoint-reader](https://github.com/crosspoint-reader/crosspoint-reader) `master` for new commits
2. If there's a new commit (or the previous run failed), clones with submodules, installs the [pioarduino PlatformIO fork](https://github.com/pioarduino/platformio-core), and runs `pio run -e gh_release`
3. Uploads the resulting `firmware.bin` to R2 via the Worker API
4. Stores build metadata (version, commit, changelog since last tag) in KV

Insider builds are exposed at `/insider` and surfaced in the catalog under the `insider` channel.

### 2. Custom font firmware (`build-custom-firmware.yml`)

Lets a user replace one or more built-in fonts in the firmware:

1. The user uploads TTFs via `/fonts` (the "Custom Font Firmware" form)
2. Worker stores them in R2 under `builds/custom/{buildId}/fonts/...` and dispatches the workflow
3. Workflow checks out the firmware repo, drops the user's TTFs over the built-in font sources, applies any label/size overrides, runs the firmware-side font conversion, then builds the firmware
4. The completed `firmware.bin` is uploaded back to the Worker; the user is offered a download

### 3. SD-card font builder (in the browser)

Converts arbitrary TTF/OTF files into `.cpfont` files for SD-card loading **without recompiling firmware** and without a server: the conversion runs in the visitor's browser on a WebAssembly build of FreeType (`src/lib/cpfont`). See [SD-card font builder](#sd-card-font-builder) below.

Built `.cpfont` files install on the device by copying to the SD card under `/fonts/YourFont/` (or `/.fonts/YourFont/` for a hidden folder).

## SD-card font builder

`/fonts` converts TTF/OTF files to `.cpfont` entirely in the browser. The user's fonts are never uploaded, there is no build queue, and a full CJK family (6 sizes, ~27k glyphs each) takes a few seconds instead of a GitHub Actions round trip.

| Piece | What it does |
|---|---|
| `src/lib/cpfont/wasm/freetype.{mjs,wasm}` | Committed build artifacts: `cpfont_ft.c` + FreeType + HarfBuzz compiled to WebAssembly (1.4 MB `.wasm` plus 16 KB of glue), fetched only when a build starts |
| `src/lib/cpfont/wasm-url.js` | Hands the wrapper the bundler-resolved `.wasm` URL; node reads the file instead |
| `scripts/font-builder/wasm/` | Sources for that artifact — the C shim and `build.sh` |
| `src/lib/cpfont/freetype.js` | JS wrapper over the wasm module (faces, coverage, glyph rendering, metrics) |
| `src/lib/cpfont/opentype.js` | Kerning and ligature extraction via [fontkit](https://github.com/foliojs/fontkit) (replaces fontTools) |
| `src/lib/cpfont/intervals.js` | Unicode coverage presets and custom range parsing |
| `src/lib/cpfont/build.js` | Rasterization, kern-class derivation, and the `.cpfont` container writer |
| `src/lib/cpfont/cpfont.worker.js` | Web Worker host: downloads fallback fonts, runs the build, streams log lines to the page |
| `src/lib/cpfont/fallbacks.js` | The bundled fallback chain, served from `/font-fallbacks/` (emitted by a plugin in `vite.config.js` from `scripts/font-builder/default-fallback-fonts/`) |

`scripts/font-builder/fontconvert_sdcard.py` stays in the repo as the reference implementation. Glyph rasterization, 2-bit packing, coverage resolution, kerning classes, ligature chaining, and the binary layout are ports of that script — change both together.

### Verifying parity

```bash
pip install freetype-py fonttools      # same deps the old CI step installed
node scripts/font-builder/parity.mjs --regular path/to/Font-Regular.ttf \
  --bold path/to/Font-Bold.ttf --default-fallbacks \
  --intervals reading,greek --sizes 12,14,16,18
```

The harness runs both generators over the same inputs and compares the output. Every section — header, style TOC, intervals, glyph metrics, kerning tables, ligatures — must match byte for byte. Glyph bitmaps get a small tolerance: FreeType's TrueType bytecode interpreter does its hinting math in C `long`, which is 32-bit under wasm and 64-bit in the Python generator's native build, so a few antialiased edge pixels can land one 2-bit level apart (measured: 3 bytes in 458 KB, 33 in 784 KB on hinted Latin families). CFF/OTF outlines, autohinted and unhinted rendering all match exactly.

### Rebuilding the wasm module

Needs [emsdk](https://emscripten.org/docs/getting_started/downloads.html) and CMake:

```bash
scripts/font-builder/wasm/build.sh      # rewrites src/lib/cpfont/wasm/freetype.{mjs,wasm}
```

The module is built for `web,worker` only and the wasm ships as a separate
file, so the browser streams and caches it like any other asset (`worker.format: 'es'`
in `vite.config.js` is what lets the worker bundle carry a split-out asset). Under
node the wrapper passes `wasmBinary` straight from disk.

The script pins the FreeType version and builds HarfBuzz in. Both matter for parity: FreeType's hinting changes between releases, and FreeType's auto-hinter asks HarfBuzz which characters a script covers when computing blue zones — a build without HarfBuzz hints symbol and emoji fonts up to a pixel differently. Keep `FT_VERSION` equal to what the reference generator links against (`python3 -c "import freetype; print(freetype.version())"`).

### Backend-less deployment

`NO_BACKEND=1 WEB_ONLY=1 npm run build` produces a client bundle that never
touches the Worker API: `WEB_ONLY` drops the Cloudflare plugin (no bindings or
credentials needed) and `NO_BACKEND` tells the UI to hide the features that need
the Worker — the pre-built font library on `/fonts` and the site-wide banner. The
SD-card font builder is unaffected because it runs entirely in the browser, so
the page loads and converts fonts with **zero** `/api/` requests.

Any static host works: point it at `dist`, send unknown paths to
`index.html`, and cache `/font-fallbacks/*` immutably. The pre-built library
cannot work there even as a direct browser fetch — GitHub serves release assets
from a host that sends no CORS headers, which is why the Worker proxies them in
the first place.

## Beta builds

Beta builds appear in the catalog as a separate channel and are managed from the admin dashboard. A beta has a stable title plus a separate version, so updating `Page Turner` from `v9` to `v10` does not require deleting and recreating the entry. Each entry has one of two sources:

- **Upload** — Admin attaches a local `.bin`. Stored verbatim in R2.
- **GitHub release** — Admin enters a release tag (default repo `crosspoint-reader/crosspoint-reader`). The Worker resolves the release via the GitHub API, fetches its `firmware.bin` asset (or the first `.bin` asset if `firmware.bin` isn't present), and caches the bytes into R2 under the same key as an upload. The original release tag is recorded so the entry can be re-fetched later.

Editing an entry can update its title, version, notes, and device visibility. It can also replace the existing binary in place with either a newly uploaded `.bin` or the asset from a different release tag. Existing upload-backed betas keep working — legacy entries are normalized to the new model when read.

When the Instatus variables in `wrangler.jsonc` and the `INSTATUS_API_KEY` Worker secret are configured, beta changes are mirrored to the persistent X3 and X4 Beta components. Creating a beta or replacing its binary also sends a subscriber notification containing the beta notes as its changelog; metadata-only edits and deletions update the component descriptions without sending an alert.

## Shop catalog

Accessories appear in two sections on `/accessories`: ready-made products first, then 3D print files. Set the accessory type when adding or editing an item in the admin. Existing model links from MakerWorld, MakerOnline, and Printables appear as 3D prints until an explicit type is saved. Search covers both sections, and each section keeps the admin ordering.

## Flashing

The guided installer is at `/install`, linked from the homepage and header. It recommends the latest compatible stable release, shows nightly, beta, and factory firmware below stable, reserves Advanced options for custom uploads, and links Xteink users to model-specific alternatives when their reader is not listed. Existing `/#flash-tools` and `/sticky` links redirect to the installer.

The browser-based flasher (`public/js/flasher.js`) uses [esptool-js](https://github.com/nicholasgasior/nicholasgasior.github.io) via WebSerial:

1. Connects to the ESP32-C3 over USB serial
2. Reads and validates the partition table (X3 or X4)
3. Writes firmware to the backup OTA partition
4. Updates the OTA boot selector to swap partitions on next boot

## Debug page

`/debug` is a diagnostic tool for inspecting a device over WebSerial without flashing anything. It connects to the ESP32-C3, reads the partition table, and reports whether the layout matches a known profile:

- **CrossPoint** — X4 CrossPoint layout, ready to flash
- **X4 Pro factory-compatible** — Original X4 Pro layout with two 0x7e0000 OTA slots, ready to flash
- **CrossPoint KO fork** — KO community fork layout, ready to flash
- **Stock X3** — Needs repartition before CrossPoint can be flashed
- **Unknown** — No match; the raw table is shown for inspection

Useful when a user reports a flash failure or unexpected behavior — ask them to load `/debug`, connect the device, and share the layout badge and dumped partition entries.

### Repair boot region

If the dumped partition entries are garbage (rows of `unknown` types with huge offsets that decode as ASCII), the partition table sector at `0x8000` has been overwritten — typically by a firmware image flashed at `0x0` with a generic esptool guide — and flashing fails with `Partition table has no otadata partition`. The **Repair boot region** card on `/debug` recovers this: it restores the correct second-stage bootloader at `0x0`, writes a known-good device-specific partition table at `0x8000`, preserves NVS by default, and resets otadata so the repaired app0 can boot. NVS can be erased explicitly when it is known to be corrupt. By default the tool also flashes the appropriate CrossPoint firmware into app0; uncheck that option to repair only the boot region and flash another build afterward.

## Setup

### Prerequisites

- Node.js 20+
- A [Cloudflare Workers Paid plan](https://www.cloudflare.com/plans/developer-platform/)
- A GitHub classic personal access token with `workflow` scope (for dispatching workflows in this repo)

### Deploy

```bash
npm install

# Create Cloudflare resources (first time only)
npx wrangler r2 bucket create crosspoint-firmware
npx wrangler kv namespace create BUILD_META
# Update the KV namespace ID in wrangler.jsonc

# Set secrets
npx wrangler secret put GITHUB_WEBHOOK_SECRET   # Generate with: openssl rand -hex 32
npx wrangler secret put GITHUB_TOKEN             # Classic PAT with workflow scope

# Deploy
npm run deploy
```

### GitHub Actions secrets

Set these on the `SoFriendly/crosspoint-tools` repo (Settings → Secrets → Actions):

- `WEBHOOK_SECRET` — Same value as `GITHUB_WEBHOOK_SECRET` in the Worker. Used by every workflow to authenticate callbacks (status updates, asset downloads, result uploads).
- `GH_PAT` — GitHub classic PAT (no scopes needed if everything you read is public). Used by the workflows for higher API rate limits when reading the upstream firmware repo.

### Local development

```bash
npm run dev   # Starts wrangler dev server on localhost:8787
npm run tunnel   # Exposes localhost:8787 through a temporary public tunnel
```

If you want local builds to dispatch GitHub Actions, set `GITHUB_TOKEN` in `.dev.vars` to a token that can trigger workflows on the repo you are targeting. By default that is `crosspoint-reader/crosspoint-tools`, but you can override it with:

- `GITHUB_ACTIONS_REPO=owner/repo`
- `GITHUB_ACTIONS_REF=branch-or-tag`

Without `GITHUB_TOKEN`, custom/manual build triggers will fail before the GitHub Actions step starts.

If Wrangler fails while downloading `cloudflared`, install it yourself and rerun the tunnel command:

```bash
brew install cloudflared
npm run tunnel
```

The `tunnel` script prefers an existing `cloudflared` on your `PATH` via `CLOUDFLARED_PATH`, so Wrangler can skip its own download step.

On Windows, run `npm run tunnel` from Git Bash/WSL if you want Unix-like tooling, or set `CLOUDFLARED_PATH` to your `cloudflared.exe` path before launching it from PowerShell or Command Prompt.

For end-to-end build testing, the worker now passes the current request origin to GitHub Actions as the webhook callback base URL. In practice that means:

- Use `npm run dev` for local handler testing only.
- Run `npm run dev` in one terminal and `npm run tunnel` in a second terminal when you need GitHub Actions to call your dev worker back.
- Open the site through the tunnel URL, not `localhost`, so the worker dispatches GitHub Actions with the tunnel origin.
- If you want to keep browsing on `localhost` while callbacks go elsewhere, set `WEBHOOK_BASE_URL=https://your-tunnel-or-dev-host` in `.dev.vars`.
- If you do not know the shared GitHub `WEBHOOK_SECRET`, set `ALLOW_INSECURE_DEV_WEBHOOKS=true` in `.dev.vars` for local-only testing so your dev worker accepts GitHub callbacks without matching the production secret.
- If you want to use your own fork or sandbox repo for Actions, set `GITHUB_ACTIONS_REPO` and optionally `GITHUB_ACTIONS_REF` in `.dev.vars`, then add the same workflow files and `WEBHOOK_SECRET` secret to that repo.

## Acknowledgments

The WebSerial flasher is based on [xteink-flasher](https://github.com/crosspoint-reader/xteink-flasher), licensed under the MIT License. The partition table handling, OTA flashing logic, and device model support were adapted from that project.

Thanks to [daveallie](https://github.com/daveallie) for the original browser flasher.

The SD-card font builder descends from the generator in the [crosspoint-reader](https://github.com/crosspoint-reader/crosspoint-reader) firmware repo (`lib/EpdFont/scripts/fontconvert_sdcard.py`). Kerning, ligature, and interval behavior now live here, so website-only font features can move without waiting on firmware-repo updates. The browser build uses [FreeType](https://freetype.org/) and [HarfBuzz](https://harfbuzz.github.io/) compiled to WebAssembly, and [fontkit](https://github.com/foliojs/fontkit) for OpenType table parsing.

## License

MIT
