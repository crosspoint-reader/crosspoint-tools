# CrossPoint Tools

[![Fund contributors](https://img.shields.io/badge/%F0%9F%91%91_Fund_contributors-royalty.dev-BB953A?style=for-the-badge&labelColor=1a1a1a)](https://app.royalty.dev/crosspoint-reader/crosspoint-reader)

Web-based firmware flasher, build system, and font builder for [CrossPoint Reader](https://github.com/crosspoint-reader/crosspoint-reader) devices. Hosted at [crosspointreader.com](https://crosspointreader.com).

## What it does

- **Stable firmware flashing** — Flash the latest CrossPoint release or stock Xteink firmware to X3 and X4 devices directly from the browser using WebSerial
- **Insider builds** — Nightly firmware compiled automatically from the upstream `master` branch
- **Beta builds** — Curated test builds exposed alongside stable, sourced from either an admin-uploaded `.bin` or a tagged GitHub release on the firmware repo
- **Custom font firmware** — Replace built-in fonts in the firmware with user-supplied TTF/OTF files via a CI build
- **SD-card font builder** — Convert TTF/OTF files into `.cpfont` files for SD-card font loading on the device, using the firmware repo's own conversion script (no client-side reimplementation)
- **Stock firmware** — Restore original Xteink firmware (English or Chinese) for both X3 and X4
- **Admin dashboard** — Manually trigger builds, manage beta entries, and monitor build status

## Architecture

The project runs on [Cloudflare Workers](https://workers.cloudflare.com/) with [GitHub Actions](https://github.com/features/actions) handling everything that needs a real toolchain (firmware compilation, font conversion):

- **Worker** (`src/index.ts`) — API routes, firmware proxying, beta/font orchestration, static asset serving
- **R2 (`crosspoint-firmware`)** — Compiled firmware binaries and font build artifacts
- **KV (`BUILD_META`)** — Build metadata, sha caches, font build state
- **Static assets** (`public/`) — HTML pages, the WebSerial flasher module, the admin dashboard, and bundled X3 firmware
- **GitHub Actions workflows** in `.github/workflows/` — long-running build jobs the Worker can dispatch

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

### 3. SD-card font builder (`build-fonts.yml`)

Converts arbitrary TTF/OTF files into `.cpfont` files for SD-card loading **without recompiling firmware**:

1. The user uploads up to four primary styles (regular, bold, italic, bold-italic), up to two fallback family regular styles, plus a family name, point sizes, and either a Unicode interval preset or custom converter ranges at `/fonts`
2. Worker stores the TTFs in R2 under `font-builds/{buildId}/in/` and dispatches the workflow
3. Workflow checks out this repo, installs `freetype-py fonttools brotli`, and runs the vendored SD-card generator at `scripts/font-builder/fontconvert_sdcard.py`
4. Each `.cpfont` is uploaded back to the Worker under `font-builds/{buildId}/out/`
5. The frontend polls `/api/font-build/status`, streams the script's stderr (glyph counts, kerning pair counts) into the UI, and offers individual or zipped downloads

The current generator started as a snapshot of `crosspoint-reader`'s `lib/EpdFont/scripts/fontconvert_sdcard.py`, but it now lives in this repo so the website can evolve SD-card-specific features like multi-family fallback handling independently.

Built `.cpfont` files install on the device by copying to the SD card under `/fonts/YourFont/` (or `/.fonts/YourFont/` for a hidden folder).

## Beta builds

Beta builds appear in the catalog as a separate channel and are managed from the admin dashboard. Each entry has one of two sources:

- **Upload** — Admin attaches a local `.bin`. Stored verbatim in R2.
- **GitHub release** — Admin enters a release tag (default repo `crosspoint-reader/crosspoint-reader`). The Worker resolves the release via the GitHub API, fetches its `firmware.bin` asset (or the first `.bin` asset if `firmware.bin` isn't present), and caches the bytes into R2 under the same key as an upload. The original release tag is recorded so the entry can be re-fetched later.

Editing an entry lets you re-link it to a different release tag, which transparently replaces the stored binary. Existing upload-backed betas keep working — the source field is optional and absent legacy entries are treated as uploads.

## Flashing

The browser-based flasher (`public/js/flasher.js`) uses [esptool-js](https://github.com/nicholasgasior/nicholasgasior.github.io) via WebSerial:

1. Connects to the ESP32-C3 over USB serial
2. Reads and validates the partition table (X3 or X4)
3. Writes firmware to the backup OTA partition
4. Updates the OTA boot selector to swap partitions on next boot

## Debug page

`/debug` is a diagnostic tool for inspecting a device over WebSerial without flashing anything. It connects to the ESP32-C3, reads the partition table, and reports whether the layout matches a known profile:

- **CrossPoint** — X4 CrossPoint layout, ready to flash
- **CrossPoint KO fork** — KO community fork layout, ready to flash
- **Stock X3** — Needs repartition before CrossPoint can be flashed
- **Unknown** — No match; the raw table is shown for inspection

Useful when a user reports a flash failure or unexpected behavior — ask them to load `/debug`, connect the device, and share the layout badge and dumped partition entries.

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

Without `GITHUB_TOKEN`, font/custom/manual build triggers will fail before the GitHub Actions step starts.

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

The SD-card font builder uses the vendored generator in `scripts/font-builder/`, originally sourced from the [crosspoint-reader](https://github.com/crosspoint-reader/crosspoint-reader) firmware repo. Kerning, ligature, and interval behavior now live here, so changes to website-only font features can be made locally without waiting on firmware-repo updates.

## License

MIT
