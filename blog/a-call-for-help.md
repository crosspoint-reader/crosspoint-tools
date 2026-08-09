---
title: A call for help
summary: We need help reviewing PRs
author: Uri Tauber
github: Uri-Tauber
date: 2026-07-26T01:00:57+03:00
---

Eight months in, Crosspoint is one of the most popular ESP32 projects around, and a lot of the code in it came from you. Bug annoys someone, PR appears. Someone wants a feature, writes it. Someone reads a function they didn't write, decides it's slower than it needs to be, and opens PR. It feels like the early days of the Linux kernel, and I'm privileged to be part of it.

Here's the problem: we can't keep up. I spend three to seven hours a day on Crosspoint. Justin probably spends more. It's still not enough time to give every PR that comes in a proper review. So we're asking for help.

## What we need

Four kinds of help, roughly in order of difficulty.

### 1. Issue triage

No code involved. The goal is to get every open issue into a state where whoever picks it up next doesn't have to start from scratch.

That means checking whether something has already been reported and linking the original if it has, asking for the details a report is missing (device, firmware version, steps to reproduce), asking whether a request is in scope when it looks like it might not be, and labeling things.

**Who can do this:** anyone. You don't need a device and you don't need to read C++.

### 2. Testing

Take a PR and flash it on real hardware. UI/UX-only changes can be checked on the simulator.

If it's a new feature, make sure it does what it claims. Throw heavy epubs at it, connect to the network, try awkward situations, and check that it doesn't break anything that used to work.

If it's a bug fix, flash the current develop, reproduce the bug, then flash the PR and confirm the bug is gone.

**Who can do this:** anyone with a physical device and some free time. If a PR touches a large part of the codebase, don't flash it on a locked device.

### 3. Benchmarking

Mostly relevant to changes in the epub reader. The point is to catch new features that make page loads slower.

Flash the current develop and capture how long a new book takes to open and how fast page turns are, using `/scripts/debugging_monitor.py`. Then flash the PR and compare.

**Who can do this:** anyone with an unlocked device.

### 4. Code review

Read through the code in a PR and look for bugs, regressions, things that could be faster, anything worth knowing before it gets merged.

You can use AI to hunt for bugs, but you have to understand and verify whatever it hands you. I don't think anyone here needs a lecture on how much AI can hallucinate.

**Who can do this:** programmers who are reasonably comfortable with C++ or better.


---

## What to report back

For testing and benchmarking, give us as much detail as you can: which commits you flashed, how you reproduced the bug, how you stress tested the feature, before and after screenshots. Any piece of information helps.

## Where to start

Find a PR you like the look of, something you'd want to help get merged. If it makes a significant change to the code, read `SCOPE.md` and `ROADMAP.md` first. If you're not sure about something, ping one of us before you put work into it.

---

Reply in the [Github discussion](https://github.com/crosspoint-reader/crosspoint-reader/discussions/2721).
