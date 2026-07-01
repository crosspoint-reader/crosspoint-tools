#!/usr/bin/env python3
"""
cream_background.py
-------------------
Replaces pure white (#FFFFFF) pixels with warm cream (#F0EFEA).

Usage:
    python cream_background.py input.png
    python cream_background.py input.png -o output.png
    python cream_background.py *.png

Requirements:
    pip install Pillow numpy
"""

import argparse
import sys
from pathlib import Path

import numpy as np
from PIL import Image

CREAM_BG = (240, 239, 234)  # #F0EFEA


def beautify(input_path: str, output_path: str) -> None:
    arr = np.array(Image.open(input_path).convert("RGBA"), dtype=np.uint8)
    white = np.all(arr[:, :, :3] == 255, axis=2)
    arr[white, 0] = CREAM_BG[0]
    arr[white, 1] = CREAM_BG[1]
    arr[white, 2] = CREAM_BG[2]
    Image.fromarray(arr, "RGBA").save(output_path)
    print(f"  ✓  {input_path}  →  {output_path}")


def main() -> None:
    ap = argparse.ArgumentParser(description="Replace white background with warm cream.")
    ap.add_argument("inputs", nargs="+", help="Input PNG file(s)")
    ap.add_argument("-o", "--output", help="Output path (single-file mode only)")
    args = ap.parse_args()

    if args.output and len(args.inputs) > 1:
        ap.error("--output can only be used with a single input file.")

    for inp in args.inputs:
        p = Path(inp)
        if not p.exists():
            print(f"  [!] File not found: {inp}", file=sys.stderr)
            continue
        out = args.output or str(p.with_stem(p.stem + "_cream"))
        beautify(inp, out)


if __name__ == "__main__":
    main()
