# Screenshot pipeline guide

This pipeline uses [crosspoint-simulator](https://github.com/crosspoint-reader/crosspoint-simulator) to capture real firmware screens from your EPUBs. It exports beige, 3× PNG and WebP images for the website. Edit [settings.json](settings.json) to choose books, their folder, font sizes, screen settings, and navigation. You do not need to edit Python for normal captures.

Agents should also read [AGENTS.md](AGENTS.md).

## 1. Set up once

Run commands from the `crosspoint-tools` repository root. You need Python 3.11+, Git, a C++ compiler, PlatformIO, and SDL2. The existing `~/.platformio/penv/bin/pio` installation is supported; otherwise put `pio` on your PATH. On macOS, install SDL2 with `brew install sdl2`. On Debian/Ubuntu, the system packages are `libsdl2-dev libssl-dev build-essential`.

Install the Python requirement in your existing environment:

```sh
python3 -m pip install -r scripts/screenshots/requirements.txt
npm run screenshots:setup
```

If your Python requires a virtual environment, create one outside the repository, activate it, then run those commands. The npm scripts use `python3` from your PATH. Setup downloads and builds the pinned firmware and simulator for X4 Pro under the gitignored `.screenshots/` directory. It does not change another firmware checkout or flash a device. Skip setup on subsequent captures unless the executable is missing or you intentionally change the source pins.

macOS was verified end to end. The simulator opens an SDL window; leave it alone during capture. Linux needs a working display and accelerated SDL renderer. A headless runner needs a suitable display setup, such as Xvfb with Mesa; SDL's dummy driver is insufficient. Native Windows is not supported by the upstream simulator; use WSL with a working display.

## 2. Edit settings.json

The default file is `scripts/screenshots/settings.json`. Its top-level structure is:

```json
{
  "booksDirectory": "/Users/jmitch/Books/Common Stacks",
  "fontsDirectory": "fonts",
  "books": ["Project Hail Mary - Andy Weir.epub"],
  "palette": {"paper": "#f4f1e9", "ink": "#242820"},
  "settings": {
    "fontSize": 12,
    "screenMargin": 20,
    "paragraphAlignment": 0,
    "textAntiAliasing": 1,
    "hyphenationEnabled": 1,
    "sdFontFamilyName": "Libron"
  },
  "scenes": [
    {
      "name": "hero-reader",
      "book": "Project Hail Mary - Andy Weir.epub",
      "position": [19, 1],
      "at": 12000
    },
    {
      "name": "reader-large-type",
      "book": "Project Hail Mary - Andy Weir.epub",
      "position": [19, 1],
      "settings": {"fontSize": 14, "lineHeight": 3, "screenMargin": 24},
      "at": 12000
    }
  ]
}
```

This is a complete two-scene example. The supplied file has eleven scenes and 30 sample EPUBs. Its library scene selects the Author tab. JSON does not allow comments or trailing commas.

### Choose another EPUB folder

Change `booksDirectory`, for example:

```json
"booksDirectory": "/Volumes/Library/EPUBs"
```

Absolute paths, `~/Books/EPUBs`, and relative paths are supported. A relative `booksDirectory` is resolved beside the configuration file, not the shell's current directory. For example, `../../my-books` in `scripts/screenshots/settings.json` points to `my-books` at the repository root.

### Choose the book to capture

Add the exact EPUB filename to `books`, then set the scene's `book` to the same filename. “Book title” means this book selection; the displayed title and author come from the EPUB's metadata and are not rewritten.

The `books` list controls which books appear on the simulated SD card and in the library. Only listed files are copied. Each entry must be a filename ending in `.epub`, not a folder path. Files must be directly inside `booksDirectory`; there is no recursive search. Every listed book must exist, even when capturing only one scene. The scene's `book` must also appear in `books`.

For a different book, remove the old `position` initially, capture it, and then choose a suitable position for that EPUB. The example's `[19, 1]` is specific to the selected edition of *Project Hail Mary*; it is not a universal chapter shortcut.

### Change font size and other reader settings

Top-level `settings` apply to every scene. A scene's `settings` override individual values. The built-in font supports **12, 14, 16, and 18 pt**; larger values snap to 18. SD fonts can provide other sizes. The supplied configuration stages Libron from `fontsDirectory` and selects it with `sdFontFamilyName`.

| Setting | What to change |
| --- | --- |
| `fontSize` | Point size, e.g. `12` for the standard Libron view and `14` for larger type. |
| `screenMargin` | Reader margin; supplied examples use `20` and `24`. |
| `lineHeight` | Firmware spacing enum, not CSS line height; the spacious example uses `3`. |
| `paragraphAlignment` | `0` = justified, `1` = left, `2` = center, `3` = right, `4` = book style in the pinned firmware. |
| `hyphenationEnabled` | `1` explicitly enables hyphenation for all reading captures. |
| `sdFontFamilyName` | Selects a staged SD font family, e.g. `"Libron"`. |
| `textAntiAliasing` | `1` enables firmware text anti-aliasing. |
| `focusReadingEnabled` | `1` enables Focus Reading. The supplied scene uses Libron at 12 pt; review spacing when changing fonts or sizes. |
| `orientation` | `0` = portrait, `1` = landscape clockwise, `2` = inverted portrait, `3` = landscape counterclockwise. |
| `uiTheme` | Firmware theme enum; the supplied scenes use `1` (Lyra). Theme changes can change navigation. |

Other firmware settings can go in the same objects. Check the **pinned** `.screenshots/firmware/src/SettingsList.cpp` and `CrossPointSettings.cpp` for keys, values, ranges, and defaults. The pipeline passes these values through; firmware may ignore unknown keys or clamp unsupported values. Confirm the effect in the capture instead of assuming the JSON was accepted.

For landscape, set `"orientation": 1` in the scene's `settings` and `"size": [800, 480]` on the scene itself. This sets the expected capture geometry; `size` does not change the simulated hardware.

### Define a screen and its navigation

| Scene field | Meaning |
| --- | --- |
| `name` | Unique lowercase letters/digits separated by hyphens. Becomes the PNG/WebP filename. |
| `book` | EPUB to open at startup. Omit to start at Home. |
| `position` | Optional zero-based `[spine, page]`: EPUB reading-order section and page within that section. Font or margin changes alter page contents, so the same page number need not show the same passage. |
| `settings` | Overrides for this scene only. |
| `inputs` | Ordered `[milliseconds, button]` pairs. Omit when no input is needed. |
| `at` | Capture time, 1000–180000 milliseconds after startup. |
| `size` | Expected native logical panel size, default `[480, 800]`. Output is three times this size. |

For example, the supplied settings-screen recipe starts at Home, selects the final menu item, then opens it:

```json
{
  "name": "hero-settings",
  "inputs": [[6000, "UP"], [7000, "ENTER"]],
  "at": 11000
}
```

Supported buttons are `BACK`, `ENTER`, `LEFT`, `RIGHT`, `UP`, `DOWN`, `HOME`, and `POWER`. Append a hold duration for a long press, such as `BACK:1200`. Input times must increase and precede `at`; leave time between actions for rendering and button release. The pipeline adds `QUIT` automatically. The upstream simulator supports additional actions, but this runner currently accepts only these button actions.

Every scene starts with fresh SD state. When `position` is present, the pipeline first runs a nine-second indexing pass, writes the pinned firmware's supported progress record, and starts a second process. `inputs` and `at` refer to that second process. Each scene receives copies of all selected books; originals are never modified or symlinked into writable simulator storage.

### Load a different font

Set `fontsDirectory` to a folder containing font-family subfolders. Like `booksDirectory`, it accepts absolute paths, `~`, or paths relative to this JSON file. Font binaries (`.ttf`, `.otf`, `.ttc`, `.cpfont`) are copied into the temporary SD card's `/fonts/`, preserving family subfolders; source files are left untouched. License and documentation files stay in the source folder so they cannot appear as books in the library. Omit `fontsDirectory` and `sdFontFamilyName` to use the built-in font.

The included layout is:

```text
fonts/
  Libron/
    Libron-Regular.ttf
    Libron-Bold.ttf
    Libron-Italic.ttf
    Libron-BoldItalic.ttf
    LICENSE
    SOURCE.md
```

Set `settings.sdFontFamilyName` to the family folder name. For another family, keep its style filenames and license in its own folder, then update this value. X4 Pro supports these TTF files. CPFont families can also be staged in their device-compatible folder layout. Match font formats to the chosen device's capabilities. Inspect simulator logs for `Loaded TTF font: Libron` (or the corresponding family) to confirm selection rather than silently using a fallback.

Libron is included unmodified under its SIL Open Font License; see [font provenance](fonts/Libron/SOURCE.md). The simulator build enables the firmware's FreeType auto-hinting for legible small text. Font-source hashes are recorded in each run's manifest. Fonts are not copied to the website by `--publish`.

## 3. Capture and review

```sh
# All scenes in settings.json
npm run screenshots

# Only the scenes you are adjusting
npm run screenshots -- --scene hero-reader --scene reader-large-type

# A separate configuration, for another book collection or campaign
npm run screenshots -- --config /path/to/settings.json

# Temporarily override the EPUB folder
npm run screenshots -- --books '/another/library'
```

The old `--recipe` option remains an alias for `--config`. A command-line `--books` overrides `booksDirectory`; relative CLI paths are resolved from the shell's current directory. Older custom configurations without `booksDirectory` retain the original Common Stacks default. Use `--binary /path/to/program` to supply an already-built simulator for another device; adjust the scene sizes and navigation accordingly. Setup builds the X4 Pro simulator (`simulator_x4_pro`); captures use that executable by default.

The full supplied batch takes a few minutes. The command prints an exact review path under `.screenshots/runs/<timestamp>/`. Wait for successful completion before opening files or publishing: images may still be being written while a run is active.

Open `index.html` in a browser. On macOS you can use `open` followed by the printed path. Check every screen for the intended state, readable text, the correct book/chapter, finished indexing, unwanted blank areas, clipped UI, and matching paper color. Inspect at the website's display size as well as at full resolution. Each card links to its raw BMP for comparison.

| Output | Purpose |
| --- | --- |
| `index.html` | Local review gallery. |
| `<scene>.png` | RGB, lossless website asset. Standard portrait exports are 1440×2400. |
| `<scene>.webp` | Smaller, high-quality alternative. |
| `raw/<scene>.bmp` | Unprocessed simulator capture. |
| `raw/<scene>.log` | Simulator diagnostics; positioned scenes also have a `-prepare.log`. |
| `manifest.json` | Recipe, book hashes, executable hash, dimensions, and output hashes. Written after the batch succeeds. |

The pipeline preserves available firmware grayscale, normalizes Retina captures, smooths regular dither in flat areas, softens hard transitions, and enlarges with Lanczos. It maps the whole grayscale range between `palette.ink` and `palette.paper`, avoiding white fringes. This cannot recover detail absent from a 1-bit source or correct a firmware layout error. Do not paint over wrong screens or replace real UI with generated content.

## 4. Copy reviewed assets to the website

Use the exact completed run path printed by the capture command, replacing `<timestamp>` below:

```sh
npm run screenshots -- --publish .screenshots/runs/<timestamp>
npm run build
```

`--publish` verifies hashes and copies the batch's PNG/WebP files into `public/screenshots/`, overwriting matching names. It **does not deploy** the website. Publishing a one-scene batch updates only that scene. It uses the saved run, not your current `settings.json`; do not combine capture options with `--publish` expecting a new capture.

The homepage already references matching PNG filenames, so those images update automatically. A new scene name creates an asset but does not add a section to the page. WebP alternatives are generated but are not automatically selected by the existing PNG references. Preserve descriptive image alt text if you change a page to use a new asset.

Raw captures, logs, manifests, and copied EPUBs must stay out of `public/`. `.screenshots/` is gitignored; the temporary SD folders are removed after each scene. Commit only intended pipeline/configuration changes and reviewed public assets. Keep unrelated local edits intact.

## Troubleshooting

| Problem | What to check |
| --- | --- |
| `Simulator missing` | Run `npm run screenshots:setup`, or pass the correct `--binary`. |
| Missing Pillow, PlatformIO, or SDL2 | Check the active Python environment, `pio` or `~/.platformio/penv/bin/pio`, and `sdl2-config` on PATH. |
| Book not found | Check `booksDirectory` and every exact filename in `books`, including capitalization. |
| Wrong screen or indexing popup | Inspect the raw image/log, increase input delays and `at`, then capture only that scene again. A nonblank wrong screen can pass automated checks. |
| Expected exactly one indexed book | Inspect `raw/<scene>-prepare.log`. The preparation pass lasts nine seconds; changing `at` does not extend it. Confirm the EPUB opens successfully; a slower indexing pass requires changing the preparation timing in `pipeline.py`. |
| Wrong chapter/page | Check the edition's EPUB spine, the scene's `position`, and typography. Do not reuse another book's indexes blindly. |
| Font size appears unchanged | The built-in sizes are 12/14/16/18; unsupported larger sizes snap to 18. |
| Blank capture, missing BMP, or SDL error | Inspect the log and ensure a working graphical renderer. A headless dummy driver does not suffice. |
| Unexpected aspect ratio | Match `size` to the orientation and the device built into the supplied binary. |
| Output hash changed | Recapture the scene and review it. Do not edit the manifest to bypass validation. |
| Setup reports a different revision | Preserve the cached checkout by moving it aside before rebuilding at the intentional pin. Do not reset another working checkout. |

Dictionary captures need extra SD data beyond the existing font and EPUB staging. The supplied scenes regenerate the font picker but do not regenerate the site's older dictionary, RTL, or bookmarks screens. The font, dictionary, and bookmarks assets were initially recolored from existing captures; those are not newly captured X4 Pro screens unless explicitly regenerated.

## Maintaining the pipeline

Run `npm run test:screenshots` after code changes. It checks image processing, original-book isolation, progress seeding, configuration path/override behavior, and publication integrity. Perform a real capture when changing navigation, settings, source versions, or image processing; tests cannot judge the intended screen. After publishing assets, run `npm run build`.

Firmware and simulator revisions are pinned in [sources.json](sources.json). The firmware pin precedes a web-server change that failed to compile with the pinned simulator. Do not update pins for routine captures. When deliberately upgrading, preserve old cached checkouts, rerun setup, check the firmware settings/progress schema, and review the affected scenes again. See the firmware checkout's own instructions before modifying it.

Automation runs on the machine holding the EPUB collection. Hosted GitHub runners cannot access `/Users/jmitch/Books/Common Stacks`; no hosted capture job or scheduled task is installed by this pipeline.
