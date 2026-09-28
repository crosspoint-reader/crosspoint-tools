#!/usr/bin/env python3
"""Generate the brand kit in public/brand/ (SVG + PNG).

The mark is rebuilt as vector geometry measured from the original app icon;
the wordmark is Lora SemiBold outlined to paths so the SVGs need no fonts.

Needs: python3 + fontTools, rsvg-convert (brew install librsvg).
Run:   python3 scripts/brand/build.py
"""
import math, os, subprocess, tempfile, urllib.request
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen

OUT = os.path.join(os.path.dirname(__file__), '../../public/brand')
LORA_URL = 'https://github.com/google/fonts/raw/main/ofl/lora/Lora%5Bwght%5D.ttf'

INK, PAPER = '#1c1917', '#fafaf9'          # stone-900 / stone-50
GREEN, GREEN_LIGHT = '#3d6652', '#8fb9a6'  # brand-600 / brand-300

# --- Mark, in a 512x512 tile ---------------------------------------------
# Book/bow-tie silhouette: vertical sides, 0.6-slope top/bottom edges meeting
# at the spine. Convex corners rounded; the two spine notches stay sharp.
OUTER = [(98, 59), (256, 154), (414, 59), (414, 451), (256, 356), (98, 451)]
HOLES = [
    [(123, 104), (242, 175), (242, 319), (123, 248)],  # left page
    [(281, 342.5), (388, 278), (388, 408)],            # bookmark
]
CORNER_R = 26
TILE, TILE_R = 512, 80


def f(n):
    return f'{n:.2f}'.rstrip('0').rstrip('.')


def rounded(poly, r):
    """Closed path with convex corners (clockwise poly) rounded to radius r."""
    d, n = [], len(poly)
    for i, (x, y) in enumerate(poly):
        (px, py), (nx, ny) = poly[i - 1], poly[(i + 1) % n]
        la, lb = math.hypot(px - x, py - y), math.hypot(nx - x, ny - y)
        a = ((px - x) / la, (py - y) / la)  # unit vector to previous vertex
        b = ((nx - x) / lb, (ny - y) / lb)  # unit vector to next vertex
        convex = a[0] * b[1] - a[1] * b[0] < 0  # clockwise in y-down space
        if not convex:
            d.append(f'{"M" if not d else "L"}{f(x)} {f(y)}')
            continue
        t = r / math.tan(math.acos(a[0] * b[0] + a[1] * b[1]) / 2)
        d.append(f'{"M" if not d else "L"}{f(x + a[0] * t)} {f(y + a[1] * t)}')
        d.append(f'A{r} {r} 0 0 1 {f(x + b[0] * t)} {f(y + b[1] * t)}')
    return ''.join(d) + 'Z'


def poly_path(poly):
    return 'M' + 'L'.join(f'{f(x)} {f(y)}' for x, y in poly) + 'Z'


OUTER_D = rounded(OUTER, CORNER_R)
HOLES_D = ''.join(poly_path(h) for h in HOLES)


def tile(x=0, y=0):
    """Green app-icon tile with the mark (white pages), as SVG elements."""
    t = f' transform="translate({f(x)} {f(y)})"' if x or y else ''
    return (
        f'<g{t}><rect width="{TILE}" height="{TILE}" rx="{TILE_R}" fill="url(#cp-bg)"/>'
        f'<path d="{OUTER_D}" fill="#000"/><path d="{HOLES_D}" fill="#fff"/></g>'
    )


GRADIENT = (
    '<defs><radialGradient id="cp-bg" cx="50%" cy="50%" r="70%">'
    '<stop offset="0" stop-color="#80ad95"/><stop offset="1" stop-color="#628a75"/>'
    '</radialGradient></defs>'
)


def svg(w, h, body):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {f(w)} {f(h)}" '
            f'width="{f(w)}" height="{f(h)}">{body}</svg>\n')


# --- Wordmark --------------------------------------------------------------
def load_lora():
    path = os.path.join(tempfile.gettempdir(), 'Lora-wght.ttf')
    if not os.path.exists(path):
        urllib.request.urlretrieve(LORA_URL, path)
    font = TTFont(path)
    instantiateVariableFont(font, {'wght': 600}, inplace=True)
    return font


def text_path(font, text, x0, baseline, scale, tracking):
    """Outline `text` into one SVG path. Returns (d, advance).
    ponytail: no GPOS kerning (no shaper installed); tracking covers it at logo sizes."""
    gs, cmap, hmtx = font.getGlyphSet(), font.getBestCmap(), font['hmtx']
    pen, x = SVGPathPen(gs), x0
    for ch in text:
        name = cmap[ord(ch)]
        gs[name].draw(TransformPen(pen, (scale, 0, 0, -scale, x, baseline)))
        x += (hmtx[name][0] + tracking) * scale
    return pen.getCommands(), x - x0 - tracking * scale


def lockup(font, dark):
    cap = font['OS/2'].sCapHeight
    scale = 205 / cap                       # cap height = 40% of the tile
    baseline = TILE / 2 + cap * scale / 2   # caps centred on the tile
    gap, space, tracking = 120, 56, -14
    x = TILE + gap
    d1, w1 = text_path(font, 'CrossPoint', x, baseline, scale, tracking)
    x += w1 + space
    d2, w2 = text_path(font, 'Reader', x, baseline, scale, tracking)
    width = x + w2
    body = (GRADIENT + tile()
            + f'<path d="{d1}" fill="{PAPER if dark else INK}"/>'
            + f'<path d="{d2}" fill="{GREEN_LIGHT if dark else GREEN}"/>')
    return svg(width, TILE, body)


def mark(color):
    # Tight to the mark's bounds; pages are knocked out so any background shows through.
    x0, y0, x1, y1 = 98, 59, 414, 451
    body = f'<path transform="translate({-x0} {-y0})" fill-rule="evenodd" fill="{color}" d="{OUTER_D}{HOLES_D}"/>'
    return svg(x1 - x0, y1 - y0, body)


def main():
    os.makedirs(OUT, exist_ok=True)
    font = load_lora()
    files = {
        'crosspoint-icon': (svg(TILE, TILE, GRADIENT + tile()), 1024),
        'crosspoint-mark-black': (mark('#000'), 1024),
        'crosspoint-mark-white': (mark('#fff'), 1024),
        'crosspoint-logo-light': (lockup(font, dark=False), 2400),
        'crosspoint-logo-dark': (lockup(font, dark=True), 2400),
    }
    for name, (content, px) in files.items():
        p = os.path.join(OUT, name)
        with open(p + '.svg', 'w') as fh:
            fh.write(content)
        # Longest side = px
        subprocess.run(['rsvg-convert', '-a', '-w' if name.startswith('crosspoint-logo') else '-h',
                        str(px), p + '.svg', '-o', p + '.png'], check=True)
        print('wrote', p + '.{svg,png}')


if __name__ == '__main__':
    main()
