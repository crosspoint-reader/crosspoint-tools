# CrossPoint Tools

Web-based firmware flasher and build system for [CrossPoint Reader](https://github.com/crosspoint-reader/crosspoint-reader) devices. Hosted at [crosspointreader.com](https://crosspointreader.com).

## What it does

- **Stable firmware flashing** — Flash the latest CrossPoint release or stock Xteink firmware to X3 and X4 devices directly from the browser using WebSerial
- **Early access builds** — Nightly firmware builds compiled automatically from the master branch, gated behind a [Royalty.dev](https://royalty.dev) subscription
- **Stock firmware** — Restore original Xteink firmware (English or Chinese) for both X3 and X4
- **Full flash backup/restore** — Save and restore the entire 16MB flash contents
- **Admin dashboard** — Manually trigger builds and monitor build status

## How it works

The project runs on [Cloudflare Workers](https://workers.cloudflare.com/) with [GitHub Actions](https://github.com/features/actions) handling firmware compilation:

- **Worker** (`src/index.ts`) — Handles API routes, firmware proxying, early access gating via Royalty.dev, and serves static assets
- **GitHub Actions** (`.github/workflows/build-firmware.yml`) — Compiles firmware from the upstream CrossPoint repo using PlatformIO, matching the exact CI toolchain
- **R2** — Stores compiled firmware binaries
- **KV** — Caches build metadata for fast reads
- **Static assets** (`public/`) — HTML pages, the WebSerial flasher module, and bundled X3 firmware

### Build pipeline

1. A daily cron job (or manual trigger from `/admin`) dispatches the GitHub Actions workflow
2. The workflow checks for new commits on the upstream [crosspoint-reader/crosspoint-reader](https://github.com/crosspoint-reader/crosspoint-reader) master branch
3. If there's a new commit (or a previous build failed), it clones the repo with submodules, installs the [pioarduino PlatformIO fork](https://github.com/pioarduino/platformio-core), and runs `pio run -e gh_release`
4. The compiled `firmware.bin` is uploaded to R2 via the Worker API
5. Build metadata (version, commit, changelog since last tag) is stored in KV

### Flashing

The browser-based flasher (`public/js/flasher.js`) uses [esptool-js](https://github.com/nicholasgasior/nicholasgasior.github.io) via WebSerial to perform OTA flashing:

1. Connects to the ESP32-C3 over USB serial
2. Reads and validates the partition table (X3 or X4)
3. Writes firmware to the backup OTA partition
4. Updates the OTA boot selector to swap partitions on next boot

## Setup

### Prerequisites

- Node.js 20+
- A [Cloudflare Workers Paid plan](https://www.cloudflare.com/plans/developer-platform/)
- A GitHub classic personal access token with `workflow` scope

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

Set these on the `SoFriendly/crosspoint-tools` repo (Settings > Secrets > Actions):

- `WEBHOOK_SECRET` — Same value as `GITHUB_WEBHOOK_SECRET` in Cloudflare (used to authenticate CI callbacks to the Worker API)
- `GH_PAT` — GitHub classic PAT with no scopes (for reading the upstream public repo without rate limits)

### Local development

```bash
npm run dev   # Starts wrangler dev server on localhost:8787
```

## Acknowledgments

The WebSerial flasher is based on [xteink-flasher](https://github.com/crosspoint-reader/xteink-flasher), licensed under the MIT License. The partition table handling, OTA flashing logic, and device model support were adapted from that project.

## License

MIT
