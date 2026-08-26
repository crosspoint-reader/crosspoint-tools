---
title: Custom Firmware for Dummies
summary: A CrossPoint Guide for custom firmwares
author: Uri Tauber
github: Uri-Tauber
date: 2026-08-26T08:36:53+03:00
---

So you bought an Xteink e-reader, and someone online told you to flash CrossPoint on it. You have no idea what that means. Let's fix that.

## What Is Firmware, Anyway?

When you download an app for Windows, macOS, or Android, it runs inside an operating system that handles most of the hard stuff for you. Firmware skips that layer entirely. It's the software that talks directly to the screen, the buttons, the storage, the battery — everything. That's why it can be so much faster and more capable than a normal app, and also why it's so easy to wreck. Your OS usually stops you from bricking your laptop. Firmware won't.

"Flashing" firmware means installing a new copy of that software into the device’s internal memory — roughly comparable to replacing the operating system on a computer.

## Why Would I Want to Replace My Firmware?

Good question. If you bought an M5PaperMono or a reTerminal Sticky, your device shipped with no firmware at all, and flashing CrossPoint (or something else) is the only way to turn them into a working device.

If you bought an Xteink X3 or X4 Pro, though, your e-reader already came with firmware from the factory. In that case, there are still a few reasons you might consider flashing CrossPoint:

- **Better typography.** Stock firmware renders bold or italic text fine but skips anything more complicated. If your books look off on stock firmware, CrossPoint is your best bet.
- **Syncing progress across devices.** If you read on a different e-reader at home, CrossPoint supports syncing with KOReader — we even run our own sync server.
- **Right-to-left languages.** If you read in Hebrew, Arabic, or Persian, stock firmware simply doesn't handle right-to-left text. CrossPoint does.
- **Offline dictionaries.** If you're reading in a language that isn't your first, you can look up unfamiliar words in real time without a data connection.
- **You believe in FOSS.** Maybe you just don't want to run proprietary software that could be doing who-knows-what in the background. CrossPoint will never track you or quietly phone home with your data.

## Which Firmware Should I Install?

Once you've decided to flash something custom, you're probably overwhelmed by how many options exist. That's one of the blessings — and curses — of open source.

Because CrossPoint is open source, anyone can take our code and modify it: strip out features they don't like, bolt on ones they do. That's why there are hundreds of CrossPoint forks. Some extend the reading experience. Others add games. A few turn your e-reader into a Swiss Army knife for network hacking. Someone added a virtual pet. Someone else added reading stats. The list is endless.

So which one do you pick? Honestly, you'd need to be extremely bored to try them all.

CrossPoint’s main advantage is its large testing and contributor base. Stable releases are used across many devices and hardware variants, and changes are reviewed before they are included. If reliability matters more to you than getting every new feature immediately, use the latest stable release. If you are comfortable encountering bugs and reporting them, you can instead try a nightly build — a version generated automatically from the newest, less-tested code.

Forks vary considerably. Some are maintained by experienced developers and used by hundreds of people. Others are personal experiments maintained by one person with extensive AI help and not much testing.

(AI-assisted development is not a bad thing by itself; CrossPoint contributors use AI tools too. What matters is whether the maintainer understands and reviews the resulting code, tests it on the hardware they claim to support, responds to failures, and provides a reliable recovery path.)

Before installing a fork, check whether it explicitly supports your exact device and hardware revision, and whether it has incorporated CrossPoint’s recent hardware-compatibility changes.

### Two warnings worth taking seriously

**Forks die.** One maintainer gets busy, or bored, or just moves on, and the updates stop. Sometimes it still works fine. Sometimes it quietly stops booting on your specific hardware and nobody's around to fix it.

**Xteink doesn't owe the firmware community anything.** Some of their business decisions have made life a bit harder for developers. In April 2026, they started selling devices in mainland China that are locked against alternative firmware — the idea being to sell devices cheaper domestically without cutting into what overseas buyers paid full price for. You can get around the lock with an SD card install or our [unlocker tool](https://crosspointreader.com/unlock), but not every firmware supports that. A lot of people swapped CrossPoint for some fork or another, regretted it, and found out there was no going back. Stuck on firmware that doesn't work — for good.

Then in July 2026, Xteink started shipping different hardware variants for the exact same model. There are now two versions of the X3, three of the X4 Pro. Even if two e-readers look identical on the outside, a revised internal display chip requires entirely different instructions to render text — which is how people end up flashing firmware and getting a device that just... stops responding.

The latest version of CrossPoint supports every variant currently on the market. We don't recommend flashing an older CrossPoint build, or any firmware you haven't first confirmed actually matches your specific device.

As of writing, **Crossink** and **witch(hunt)-reader** support all X3 variants, but only **Crossink** covers the X4 Pro — and that can change, so double-check the project's current compatibility info before you flash.

## FAQ

**Q: What are the actual risks of flashing CrossPoint?** 

A: If you're flashing the latest stable CrossPoint onto a supported device with our official tool, the risk is very low. Use a decent USB cable, make sure the e-reader and your PC have power, and don't unplug mid-flash. It'll void your warranty though, so make sure the reader works properly first.

**Q: Wouldn't it be great if CrossPoint had feature X from some other firmware?** 

A: CrossPoint's scope is intentionally narrow, but if a feature fits within that scope, we're happy to look at code contributions.

**Q: Help! I flashed firmware X and now my device is dead and unresponsive. What do I do?** 

A: If this teaches you to read the instructions first next time, it was worth it. That said, your device isn't really "dead." It's almost certainly still running fine — it just has no idea how to drive your specific variant's screen. If you bought it from the official store, plug it into a computer and [flash](https://crosspointreader.com/#flash-tools) the current CrossPoint build. If you ordered a locked device off AliExpress, this gets harder — if your firmware supports SD card installs, put the CrossPoint `.bin` file on an SD card and feel your way to the update menu blind. Ask on Reddit for the exact button sequence.

**Q: I don't like CrossPoint. It's missing features X and Y.** 

A: Fair enough — you can always flash back to stock firmware anytime using our [flashing tool](https://crosspointreader.com/#flash-tools). You're also welcome to open a feature request [on GitHub](https://github.com/crosspoint-reader/crosspoint-reader/issues) explaining what you miss from the stock firmware. It might make it into a future release.
