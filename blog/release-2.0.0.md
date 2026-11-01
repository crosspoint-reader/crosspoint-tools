---
title: CrossPoint 2.0
summary: SD card plugins, OPDS 2.0, highlights and clippings, Bluetooth page turners, richer EPUB rendering, and four new devices.
author: Justin Mitchell
github: itsthisjustin
date: 2026-11-01T13:52:36Z
---



CrossPoint 2.0 is here. It's the biggest release we've shipped: **plugins** loaded from the SD card, **OPDS 2.0** catalogs, **highlights and clippings**, **Bluetooth page turners**, a big step forward in EPUB rendering, and support for **four** new devices.

### New devices

2.0 adds support for four ESP32-S3-based readers: the **Metalio E-Ink 4**, the **EEGO A4** (standard and Lite), and the **BOOX Picco**. If you're thinking of buying one, you'll find links on the [devices page](/devices). Those are affiliate links, so buying through them helps support CrossPoint. Still deciding? The new [device comparison](/device-comparison) page lines them all up side by side.

### SD card plugins

CrossPoint now supports plugins installed on the SD card. A plugin can add book catalogs and downloads to the reader, or tools to the device's web interface. To show the **Plugins** entry on Home, enable Plugins under **Settings → Connectivity**.

Plugins are not apps that run arbitrary code on the reader. On-device plugins use the screens and operations the firmware already provides, such as sign-in, catalogs, downloads, and supported reading events. They can't replace the reading engine, install hardware drivers, or add unsupported document formats.

Some plugins include JavaScript, but that code runs in a browser on your phone or computer, so the browser page has to stay open while it works. For example, a browser plugin can turn articles or RSS feeds into an EPUB, which you then read on the device.

The plugin system will stay focused on reading and book services. It won't become a platform for on-device games, calculators, notepads, writing apps, web browsers, or PDF rendering. Those remain outside [CrossPoint's scope](/roadmap#scope), plugins included.

### OPDS 2.0

OPDS, the catalog format used to browse and download books, now supports **version 2.0** alongside existing OPDS 1.x catalogs. OPDS feeds and KOReader Sync can also send **custom HTTP headers**, for servers that sit behind authentication proxies, and a feed that fails to load now tells you why.

### Bluetooth page turners

Bluetooth page turners now work on all devices. Go to **Settings → Connectivity → Bluetooth Page Turner** to scan for a remote, pair it, and map its buttons. Short and long presses can trigger different actions: page turns, chapter navigation, the reader menu, and clipping selection. Touch devices get a Bluetooth toggle in the Control Center.

### Highlights and clippings

You can now select text in EPUBs, highlight passages, and save excerpts as clippings. On button devices, use the reader menu. On touch devices, hold a word and drag the selection handles. Selected text also works for dictionary lookup, including multi-word phrases, and lookups can now follow a word inside a definition. If you turn on **Sync Clippings**, clippings can sync through a compatible CrossPoint Sync server.

### EPUB formatting and reading controls

EPUB rendering now handles more of what books actually contain: drop caps, small caps, mixed text sizes, borders, and shaded blocks. Tables take column content, cell padding, and borders into account. Headings stay attached to the text that follows them, and paragraph indentation has its own setting. EPUBs can also show non-interlaced GIF images, covers included.

Line spacing now has seven options, from 0% to +75% added spacing, replacing Tight/Normal/Wide. A new **Images** option draws EPUB images with black-and-white dithering, avoiding the full refresh on image pages.

### Noto Serif is now optional

To free up space for all of this, Noto Serif moved from a built-in font to an optional SD card font. If you use it, install `NotoSerif` through **Manage Fonts** before or after upgrading. Without it, a Noto Serif selection falls back to Noto Sans. **Libron** is also available for direct download from the font manager.

### Everything else

- The device web interface has a new look and more consistent dialogs.
- Settings are grouped into a cleaner layout that's easier to extend.
- Touch devices get swipe-to-delete in the file browser and a few other places.
- A JPEG viewer for images on the SD card.
- Sleep images shuffle through every image once before repeating.
- KOReader Sync supports multiple server profiles.
- Azerbaijani is now available as a UI language.

Thanks, as always, to everyone who reported bugs, tested release candidates, and contributed fixes.

The [full release notes](https://github.com/crosspoint-reader/crosspoint-reader/releases/tag/2.0.0) include every individual change and contributor.

---

## Downloads

[BOOX Picco](https://github.com/crosspoint-reader/crosspoint-reader/releases/download/2.0.0/crosspoint-2.0.0-picco.bin)

[EEGO A4](https://github.com/crosspoint-reader/crosspoint-reader/releases/download/2.0.0/crosspoint-2.0.0-eego_a4.bin)

[M5Stack PaperMono](https://github.com/crosspoint-reader/crosspoint-reader/releases/download/2.0.0/crosspoint-2.0.0-papermono.bin)

[Metalio E-Ink 4](https://github.com/crosspoint-reader/crosspoint-reader/releases/download/2.0.0/crosspoint-2.0.0-metalio_eink4.bin)

[Seeed reTerminal Sticky](https://github.com/crosspoint-reader/crosspoint-reader/releases/download/2.0.0/crosspoint-2.0.0-sticky.bin)

[Xteink X4 and X3](https://github.com/crosspoint-reader/crosspoint-reader/releases/download/2.0.0/crosspoint-2.0.0-x3-x4.bin)

[Xteink X4 Classic](https://github.com/crosspoint-reader/crosspoint-reader/releases/download/2.0.0/crosspoint-2.0.0-x4c.bin)

[Xteink X4 Pro](https://github.com/crosspoint-reader/crosspoint-reader/releases/download/2.0.0/crosspoint-2.0.0-x4pro.bin)
