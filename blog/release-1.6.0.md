---
title: CrossPoint 1.6.0
summary: New hardware, night mode, languages, and a long list of fixes.
author: Uri Tauber
github: Uri-Tauber
date: 2026-09-05T21:03:55+03:00
---

CrossPoint 1.6.0 is out. It's mostly bug fixes — the backlog of reports and edge cases people ran into after 1.5.0 — but a few really nice features made it in too.

### Two more supported readers

1.5.0 got CrossPoint onto its first ESP32-S3 device, the Seeed reTerminal Sticky. Now the **Xteink X4 Pro** and **M5Stack PaperMono** are supported as well.

Both get frontlight controls and swipe gestures. The X4 Pro also uses its capacitive Home key, with configurable long-press actions. Some hardware now supports USB Drive mode, so you can plug the reader into your computer and copy books to the SD card without setting up Wi-Fi first.

The interface is starting to pick up bigger touch-friendly changes: a new Reader menu and a frontlight control center with quick settings. Button-only devices won't notice — the X3/X4 experience is untouched.

If you're thinking about picking one up, the supported-device list lives at [crosspointreader.com/devices](https://crosspointreader.com/devices) (Those are affiliate links, so buying through the page helps support CrossPoint.).

### Let your book show through the sleep screen

Custom sleep screens can be transparent now. Drop a transparent PNG or BMP to a `.sleep-overlay` folder and CrossPoint overlays it on the page you were reading.

### Night Mode

Reader settings has a new Night Mode switch. It inverts the display for reading while leaving image polarity alone, so text goes light-on-dark without turning every illustration into a negative.

It's scoped to the Reader on purpose. Full refreshes will briefly flash white, and Home, Settings, and the sleep screen keep their normal white background. That keeps the rest of the interface predictable while giving readers who prefer a dark page the option where it counts most.

### Better dictionaries

Two upgrades for offline dictionary users. StarDict `.syn` files work now, so synonym lookups land on the right entry. And HTML dictionary definitions render through the EPUB engine instead of getting flattened into raw text — so entries with headings, emphasis, and other styling should now read like proper dictionary entries.

### More languages, fonts, and CJK polish

Bulgarian and Persian are now interface languages. Hebrew, Arabic, and Korean readers can grab compatible fonts straight from Manage Fonts instead of sourcing them separately.

The keyboard supports more layouts too, and you can switch between the ones you've enabled. For Chinese, Japanese, and Korean text we fixed a long list of issues across layout, ruby text, spacing, and glyph loading. Big CJK tables of contents and file lists should be much less painful now.

### Anything else

There are a few quality-of-life additions too. Reader line spacing now has an **Extra Wide** option. Password fields for Wi-Fi, KOReader, and OPDS can reveal what you are typing. Lists and tabs have moved onto the new FUI framework, which is the groundwork behind the newer touch interactions and should make the interface more consistent as it continues to grow.

Thanks to everyone who filed reports, opened PRs or tested hardware.

# Downloads

[M5Stack PaperMono](https://github.com/crosspoint-reader/crosspoint-reader/releases/download/1.6.0/crosspoint-1.6.0-papermono.bin)

[Seeed reTerminal Sticky](https://github.com/crosspoint-reader/crosspoint-reader/releases/download/1.6.0/crosspoint-1.6.0-sticky.bin)

[Xteink X4 and X3](https://github.com/crosspoint-reader/crosspoint-reader/releases/download/1.6.0/crosspoint-1.6.0-x3-x4.bin)

[Xteink X4 Pro](https://github.com/crosspoint-reader/crosspoint-reader/releases/download/1.6.0/crosspoint-1.6.0-x4pro.bin)
