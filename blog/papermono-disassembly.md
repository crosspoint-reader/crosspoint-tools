---
title: How (not) to repair the M5PaperMono
summary: I tried to pry open the M5Stack PaperMono. Here's what I learned.
author: Uri Tauber
github: Uri-Tauber
date: 2026-11-04T16:58:11+03:00
---


The day my M5Stack PaperMono arrived, I dropped it on a table from about 10 cm. Not much of a fall, but something inside came loose. I could feel the center of gravity shift when I shook it, and the touchscreen and buttons had gone flaky.

My first step was to contact M5Stack support. To their credit, they immediately shipped me a replacement unit, free of charge. A round of applause for M5Stack's customer service!

With a brand-new, perfectly functional replacement in hand, I felt comfortable taking a few risks with the damaged unit. I wanted to open it up and find out what had gone wrong.

I couldn't find a single PaperMono disassembly guide, so here's mine: what worked, and what I broke along the way.

A little background: I've opened plenty of computers and laptops. This is not like those. The PaperMono clearly wasn't meant to be opened, let alone repaired. If it breaks, you bin it. Naturally, that made me want to try.

M5Stack has put an STL model of the enclosure [on GitHub](https://github.com/m5stack/M5_Hardware/blob/master/Products/C153_PaperMono/Structures/PaperMono.stl), and it turned out to be enormously helpful in figuring out where to start.

There are no clips holding the front assembly. What the enclosure has is a narrow ledge, about 1–2 mm wide, running around the perimeter, and the front seems to be glued to it. Which  meant I would need to soften the adhesive first.

I used two very sophisticated tools: a regular hair dryer and a [cheap pry tool](https://s.click.aliexpress.com/e/_c3HTy5Bh). 
iFixit's [guide to softening adhesive with a hair dryer](https://www.ifixit.com/Guide/How+to+Use+a+Hair+Dryer+to+Soften+Adhesive/157348) helped a lot.

![pic1](./assets/papermono-disassembly/my_photo-2.jpg)

I started at the top-right corner, screen facing me. I put the dryer on its hottest setting, aimed it at the corner for about two minutes, then slid the pry tool in at roughly 45 degrees and pressed gently. It took a few attempts, but the corner finally lifted. I left the tool in so the glue wouldn't re-stick, heated the right edge for another two minutes, and worked my way along it.

Once the entire right edge was free, I moved on to the bottom, and that's where it went wrong. Three ribbon cables positioned very near the bottom of the PaperMono, connecting the display, touchscreen and frontlight to the main board. I didn't know. I pushed the pry tool in a bit too far and felt a snap.

Goodbye, touchscreen. I'd sliced right through its ribbon cable.

![pic2](./assets/papermono-disassembly/my_photo-13.jpg)
![pic3](./assets/papermono-disassembly/my_photo-15.jpg)

So if you try this, **keep the pry tool as shallow as you can along the bottom edge.**

There was no undoing it, so I kept going. The left edge and the top came apart without any more drama.

![pic4](./assets/papermono-disassembly/my_photo-4.jpg)

Then I lifted off the front assembly and looked inside.

![pic5](./assets/papermono-disassembly/my_photo-6.jpg)

The battery fills most of the space, so I assumed that this was what had come loose when I dropped the device. It hadn't. It's glued firmly to the back of the case. The real culprits were four small magnets sitting in channels along both sides of the battery. They had worked free and were sliding back and forth. I don't use the magnetic mounting, so I took them out.

The ribbon cable for the three buttons was loose too. Its connector came apart the moment I touched it.

Two mysteries solved, one touchscreen destroyed. Not a terrible score.

---

Since I'd come this far, I wanted to see the other side of the motherboard. That was harder than it had any right to be. 
M5Stack doesn't use a couple of tiny screws here. Instead, the PCB itself has four small protruding tabs along its edges, which slide into matching slots molded into the plastic enclosure. This holds the board in place without any screws, but also makes removing it surprisingly tricky. With some help from the pry tool, I managed to work it free.

![pic7](./assets/papermono-disassembly/my_photo-8.jpg)
![pic8](./assets/papermono-disassembly/my_photo-9.jpg)
![pic9](./assets/papermono-disassembly/my_photo-11.jpg)


The ESP32-S3 is there, along with several other chips I haven't identified. The board itself looks well made, with a clean, sensible layout.

Putting it back should have been simple, and wasn't. Putting it back should have been simple, and wasn't. However I angled it, I couldn't get those PCB tabs back into their slots. Eventually I lost patience and cut the protruding tabs off the PCB itself. Problem solved. Elegant? No. Would I recommend it? Also no.

I reconnected the button ribbon cable and taped the connector down so it couldn't wander off again. The original adhesive around the front still held, so I didn't need new glue.

Then I put in the microSD card and powered it on. CrossPoint Reader booted. The three side buttons worked, and the E Ink display was fine except for a few pixels at the bottom left that look dead. The touchscreen was dead too, obviously. CrossPoint also showed X4 button hints along the bottom, which means the firmware didn't find a touchscreen and fell back to the wrong input setup.

![pic9](./assets/papermono-disassembly/my_photo-12.jpg)

Obviously, I'm not going to use a PaperMono without a working touchscreen as my main reading device. But I'm happy I didn't destroy anything else in the process. And since CrossPoint lets you remap the three physical buttons, it works fine as a dev and tinkering board.

## Final thoughts on repairability

There's something deeply frustrating about seeing a device designed with so little consideration for how someone might repair it in the future.

Take the battery, for example. Batteries are consumable components. Even if nothing goes wrong, eventually they wear out and need replacing.

On the PaperMono, replacing the battery would require you to:

1. Heating and removing the glued front assembly, with the risk of damaging the display and its cables.
2. Pulling the battery off its adhesive.
3. Desoldering the two battery wires from the PCB. There's no JST-style connector.

I get the economics. When a brand-new device costs just **$65**, paying a professional repair technician might cost more than simply buying another one. A more repairable case adds cost and thickness, and people who like opening devices aren't a big enough market to change that.

Still, we've gotten used to disposable electronics too easily. A couple of screws, a removable front panel, and a simple battery connector could make the difference between a device that lasts a few years and one that can be kept alive for much longer.

Good hardware shouldn't have to become e-waste just because someone decided that glue was cheaper than screws.
