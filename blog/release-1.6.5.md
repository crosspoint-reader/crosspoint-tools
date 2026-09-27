---
title: CrossPoint 1.6.5
summary: A new Library view, TrueType fonts, Cover Grid, X4 Classic support, and more control over reading.
author: Uri Tauber
github: Uri-Tauber
date: 2026-09-27T12:22:02+03:00
---



CrossPoint 1.6.5 is out, and it’s a pretty substantial one: a new Library for browsing everything on your SD card, direct TrueType font support, a Cover Grid home theme, more control over reading and touch gestures, and official support for the X4 Classic.

### A proper library for the books on your card

Recent Books has grown into **Library**. Instead of only showing books you’ve already opened, CrossPoint can now browse every book on the SD card.

You can switch between **Recent**, **Title**, and **Author** views. Recent keeps whatever you’re currently reading at the top, followed by the rest of your collection in the order it was added.

Search works across both titles and authors, so you no longer need to remember which folder a book is hiding in. Turn on **Use Book Metadata** in **Settings** and CrossPoint will read titles and authors directly from EPUB metadata; when that information isn’t available, it falls back to the filename.

Added or removed some books outside CrossPoint? **Refresh library** rescans the card.

You can also rename book files directly from the file browser now.

### Bring your own TrueType fonts

Readers with external RAM can now load `.ttf` fonts directly from the SD card. No conversion to CrossPoint’s `.cpfont` format required.

Drop a font into `/fonts/` or `/.fonts/`, restart the reader, and it will appear in Text Settings. If a font family has separate regular, bold, italic, and bold-italic files, put them together in their own folder.

TrueType fonts are available from 8 to 22 points in one-point steps. OpenType `.otf` files are supported too, although compatibility varies between fonts.

This feature needs external RAM, so the X3 and original X4 will continue using `.cpfont` for SD-card fonts. Existing `.cpfont` families still work exactly as before.

### Covers on the home screen

There’s a new **Cover Grid** home theme for people who recognise a book by its cover before they remember its title.

Instead of the usual list, your recent books are shown as a grid of cover art, giving the home screen a much more visual feel.

Cover Grid is available on readers with external RAM, so it isn’t offered on the X3 or original X4. You can select it from the home theme setting on supported devices.

### More control over the page

Text Settings now separates **word spacing** and **character spacing** from line spacing.

Word spacing can be adjusted from 50% to 200% of the normal width, while character spacing lets you tighten or loosen the gaps between letters by up to two pixels in either direction.

Footnotes also behave better when there are several on the same page. CrossPoint now highlights each reference directly on the reading page so you can move between them and choose the one you want. If there’s only one footnote, it skips the selector and opens it immediately.

And bookmarks can finally have names. Long-press one and choose **Rename**. That makes it much easier to label importnat stuff.

### Better touch controls and Home shortcuts

Touch readers now have separate gesture settings for going forward and backward.

Each direction can use taps, swipes, both, inverted tap zones, or no gesture at all. That means you can, for example, use a tap to go forward and a swipe to go back.

Right-to-left EPUBs automatically reverse page-turn directions and shared tap zones to match the reading direction.

Touch devices also get back buttons in screen headers, along with fixes for scrolling in reader lists and Settings.

On the **X4 Pro**, the Home key is much more flexible now. Tap, double-tap, and long-press can each be assigned independently. You can use them to open the reader menu, add a bookmark, start KOSync, toggle the frontlight, or jump to whichever action you use most.

### X4 Classic support

The **Xteink X4 Classic**, based on the ESP32-S3, is now officially supported.

### Languages, EPUB fixes, and the smaller stuff

Portuguese now has hyphenation support, and the on-screen keyboard gets an Arabic layout.

Korean justification has also been improved: CrossPoint now expands the spaces between words without inserting unwanted gaps between characters inside a word.

There are several EPUB fixes too, including better handling of numbered lists and indentation, content marked with the HTML `hidden` attribute, chapter-position displays, and selection in the end-of-book menu.

KOSync can now preserve your position within a paragraph, including the text offset, making progress syncing more precise.

USB Drive mode handles cable disconnections properly, and the web file browser now normalises paths and escapes filenames before displaying them.

Thanks, as always, to everyone who reported bugs, tested builds, and contributed fixes.

The [full release notes](https://github.com/crosspoint-reader/crosspoint-reader/releases/tag/1.6.5) include every individual change and contributor.

---

## Downloads

[M5Stack PaperMono](https://github.com/crosspoint-reader/crosspoint-reader/releases/download/1.6.5/crosspoint-1.6.5-papermono.bin)

[Seeed reTerminal Sticky](https://github.com/crosspoint-reader/crosspoint-reader/releases/download/1.6.5/crosspoint-1.6.5-sticky.bin)

[Xteink X4 and X3](https://github.com/crosspoint-reader/crosspoint-reader/releases/download/1.6.5/crosspoint-1.6.5-x3-x4.bin)

[Xteink X4 Classic](https://github.com/crosspoint-reader/crosspoint-reader/releases/download/1.6.5/crosspoint-1.6.5-x4c.bin)

[Xteink X4 Pro](https://github.com/crosspoint-reader/crosspoint-reader/releases/download/1.6.5/crosspoint-1.6.5-x4pro.bin)
