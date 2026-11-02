# Screenshot pipeline instructions for agents

These instructions cover the screenshot pipeline and its generated website assets. Read [README.md](README.md) for commands and the configuration schema. Use the existing pipeline for capture requests; do not build another screenshot tool.

## Locate the work

- Run commands from the repository root and inspect `git status --short` first. Preserve unrelated work, including homepage edits and existing assets.
- The user-editable configuration is `scripts/screenshots/settings.json`.
- `booksDirectory` selects the source EPUB folder. `books` lists exact filenames; a scene's `book` chooses which one to open. “Book title” means selection, not changing EPUB metadata.
- Shared firmware values live in the top-level `settings`; a scene's `settings` take precedence. Edit configuration for routine changes to books, font size, margins, spacing, orientation, themes, or navigation.
- `pipeline.py` captures, processes, and publishes. `setup.py` builds the pinned sources in `.screenshots/`. `sources.json` records the pins; `test_pipeline.py` contains the tests.
- Website consumers are currently `src/pages/home/Hero.jsx`, `Features.jsx`, and `ReaderScreenshot.jsx`. Search callers again before renaming assets or changing their format.

## Execute the request

1. Read the configuration and check that all listed EPUBs exist in the resolved folder. Resolve relative `booksDirectory` paths against the configuration directory. `--books` overrides the JSON value and uses the shell's current directory for relative paths.
2. Reuse `.screenshots/firmware/.pio/build/simulator_x4_pro/program` when present. Run `npm run screenshots:setup` only when needed. Use the existing Python, PlatformIO, and SDL2 installations; do not upgrade tools or source pins for an ordinary capture.
3. Edit the relevant scene(s), then run `npm run screenshots -- --scene SCENE_NAME` (repeat `--scene` as needed). For a complete refresh, run `npm run screenshots`. `--config PATH` selects another settings file; `--recipe` is its backward-compatible alias.
4. Wait for successful completion and use the exact printed run path. Open its gallery or inspect its PNG/WebP files with an image-viewing tool. Compare the raw BMP when needed. Never treat file existence or a passing test as visual verification.
5. Check book/chapter, intended menu state, completed indexing, text readability, spacing, clipping, and paper/ink colors at website size. If the screen is wrong, fix the scene or timing and rerun it. Report a blocker if you cannot inspect the images; do not claim visual review.
6. When updating local website assets is in scope, run `npm run screenshots -- --publish .screenshots/runs/RUN_NAME`. This copies reviewed files locally; it does not deploy. A completed one-scene run can replace just that scene without combining manifests from different runs.
7. Run `npm run test:screenshots` for pipeline code changes. Exercise changed settings/navigation with a real capture. Run `npm run build` after publishing or changing website consumers. Documentation-only changes need command/link checking, not a fresh simulator build.
8. Report the configuration changes, reviewed output path, checks actually run, and whether assets were copied or deployed. Mention material limitations. Do not claim unrelated pre-existing changes as your own.

## Preserve capture fidelity and source data

- Never modify the original EPUBs or use them as writable SD-card symlinks. Preserve the per-scene temporary SD copies and cleanup behavior.
- Preserve licenses and provenance for bundled font files. Never overwrite source fonts; copy them to the temporary SD card.
- Keep raw BMPs, logs, manifests, source checkouts, and books outside `public/` and out of commits. Publish only the intended PNG/WebP outputs.
- Keep the beige palette aligned with the current site. The initial values are paper `#f4f1e9` and ink `#242820`; check the current styles before changing them.
- Preserve actual firmware words, icons, and layout. Do not use generative reconstruction or manually paint over broken screens. Upscaling cannot restore information missing from 1-bit captures.
- Keep filename and timeline validation, process timeouts, blank/aspect checks, and publication hash verification. Recapture changed images; do not rewrite hashes to bypass checks.
- Do not deploy, push, or schedule recurring jobs unless the user requests that scope. Do not add a separate approval gate for already-authorized local captures or asset updates.

## Known constraints

- Built-in font sizes are 12, 14, 16, and 18 pt. Larger values clamp to 18. The current reading scenes use staged Libron at 12 pt (14 pt for the larger variant), with `hyphenationEnabled: 1`. Preserve the selected pages without em dashes unless the user asks otherwise; verify rendered pages after font changes.
- Settings keys and enum values follow the pinned firmware, not CSS. Check `.screenshots/firmware/src/SettingsList.cpp` and `CrossPointSettings.cpp`; unknown or invalid values can be ignored/clamped silently.
- `position` is a zero-based EPUB spine/page pair, tied to the edition and pagination. Different typography changes which text appears on a page. When replacing a book, remove or verify its old position.
- Positioned scenes run a separate nine-second preparation pass. Capture `at` does not extend that pass. Inspect the preparation log before changing timing code.
- `size` validates expected native dimensions; it does not switch device hardware. Setup builds the X4 Pro simulator (`simulator_x4_pro`). Another device needs a suitable binary plus matching geometry/navigation.
- The runner supports only its listed button actions, not all upstream simulator actions. Fonts are staged from optional `fontsDirectory` into `/fonts`; dictionaries are not staged automatically. Verify the requested family in simulator logs.
- Every run stages all books listed in the configuration, including runs filtered to one scene. Leave the original collection untouched; reduce the list in a separate config if necessary.
- SDL needs a graphical renderer. macOS was tested; do not claim Linux/WSL verification without running it. Hosted CI cannot read the user's local Books folder.
- Keep the pinned firmware/simulator pair for routine work. If an upgrade is requested, preserve existing checkouts, rebuild, and verify schema/navigation compatibility. Read the cloned firmware's `AGENTS.md` before changing files in that checkout.
