---
title: CrossPoint 1.5.0
summary: The new release is finally out
author: Uri Tauber
github: Uri-Tauber
date: 2026-08-07T10:58:11+03:00
---

This was the longest gap we've ever had between releases. Sorry for the wait — hopefully it was worth it. This one adds our first non-ESP32-C3 device, cuts big-book load times from minutes to seconds, brings offline dictionaries, and finishes the right-to-left work we started in 1.4.0.

### Seeed reTerminal Sticky support

CrossPoint has been ESP32-C3 only since day one (XTeink X3/X4). That changes with this release: we're adding support for **ESP32-S3** devices, starting with the **Seeed reTerminal Sticky**.

Thanks to Seeed Studio for reaching out, sending test hardware, and being genuinely great to work with throughout.

Want one? You can order a Sticky at [crosspointreader.com/devices](https://crosspointreader.com/devices) — that's our affiliate link, and it helps fund the project.

### Big books open fast now

Opening a big book for the first time used to take minutes. Sections now index in the background while you read, so books open in around 5 seconds instead. Page turns are smoother too, from rendering and memory work throughout the app, and we fixed memory allocation and CSS parser bugs that were causing out-of-memory crashes on complex EPUBs.

### Offline dictionary lookups

Drop a StarDict dictionary onto your SD card and look up words with no connection. Select a word, get the definition popup. There's a [setup guide](https://github.com/crosspoint-reader/crosspoint-reader/blob/develop/docs/dictionary.md) if you want to get one running.

### "What to read next"

Finish an EPUB and CrossPoint looks at what's on your device and suggests something next, right on the end-of-book screen.

### Text settings got a rework

Font and layout options now live in one menu, with a live preview so you can watch line spacing, margins, and font changes happen without leaving the settings screen.

There's also a new selection popup. Any setting with three or more choices opens a dialog now instead of making you cycle through options one at a time.

### Arabic, Farsi, and Urdu

1.4.0 added right-to-left text support. This one finishes the job for Arabic, Farsi, and Urdu: proper bidi handling and contextual glyph shaping, built-in fonts with full Arabic character sets, and the UI itself translated into Arabic.

Hebrew niqqud is now rendered correctly too.

### CJK improvements

CJK text rendering got a real boost — it's a lot more usable now. We also added the option to load a Chinese font from your SD card so menu entries display in Chinese (Check the user guide for instructions). It's not perfect yet — some users say it makes the interface noticeably slower — but more improvements are coming. CrossPoint probably won't ever be first-class for Chinese, but we're hoping bilingual readers find it good enough.

### Everything else

KOReader sync now handles custom sync servers, account registration, and metadata uploads. Wi-Fi should behave better — it reconnects to saved networks automatically, including hidden ones, and picks access points more sensibly. The web UI shows image previews in the file browser now and lists device serial numbers. OPDS downloads let you set your own folder and file format.

We also added the Vollkorn serif font (grab it from Manage Fonts), cleaned up `<br>` handling and list bullet alignment, and expanded CSS `text-decoration` support. Translations got updates across almost every language, plus brand new Norwegian Bokmål, Indonesian, and Bosnian translations.

[paulporto](https://github.com/paulporto) managed to save his bricked device by flashing firmware directly to the flash chip on an XTeink X4 motherboard. Not a simple procedure, and fairly risky, but good to know it's possible. His guide is here: [fix-bricked-xteink.md](https://github.com/crosspoint-reader/crosspoint-reader/blob/develop/docs/fix-bricked-xteink.md).

One of the bigger headaches this past month: XTeink started shipping X3 and X4 units with different internal hardware — not an upgrade, just a cost-driven change. A bunch of users who flashed an older CrossPoint build found their screen didn't work, or the battery drained in a day. We think we've now identified all the hardware variants out there, and CrossPoint should handle them fine. If your device isn't working right, please open a GitHub issue ASAP so we can push an emergency fix.

The XTeink X4 Pro isn't supported in this build yet — a beta is up on the site for testers.

> [!NOTE]
> If you're upgrading from **v1.0.0 or earlier**, install **v1.4.1** first before this release. Skipping that step will reset your settings to default.

# Downloads

[Xteink X4/X3](https://github.com/crosspoint-reader/crosspoint-reader/releases/download/v1.5.0/firmware.bin)
[Seeed reTerminal Sticky](https://github.com/crosspoint-reader/crosspoint-reader/releases/download/v1.5.0/sticky.bin)
