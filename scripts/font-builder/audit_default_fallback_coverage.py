#!/usr/bin/env python3
"""Audit bundled default fallback font coverage for interval presets."""

from __future__ import annotations

import importlib.util
import sys
import unicodedata
from pathlib import Path

from fontTools.ttLib import TTFont


SCRIPT_DIR = Path(__file__).resolve().parent
FALLBACK_DIR = SCRIPT_DIR / "default-fallback-fonts"

DEFAULT_FALLBACK_FILES = [
    "NotoSans-Regular.ttf",
    "NotoSansHebrew-Regular.ttf",
    "NotoSansArmenian-Regular.ttf",
    "NotoSansGeorgian-Regular.ttf",
    "NotoSansEthiopic-Regular.ttf",
    "NotoSansCherokee-Regular.ttf",
    "NotoSansTifinagh-Regular.ttf",
    "NotoSansCoptic-Regular.ttf",
    "NotoSansMath-Regular.ttf",
    "NotoSansSymbols-Regular.ttf",
    "NotoSansSymbols2-Regular.ttf",
    "NotoEmoji-Regular.ttf",
    "NotoSansCJKjp-Regular.otf",
    "NotoSansCJKsc-Regular.otf",
]

ALLOWED_MISSING_ASSIGNED = {
    "default": {(0x20C0, 0x20C0)},
    "cjk-jp": {(0x9FF0, 0x9FFF), (0xFA70, 0xFAFF)},
    "cjk-sc": {(0x9FF0, 0x9FFF), (0xFA70, 0xFAFF)},
    "hebrew": {(0x05EF, 0x05EF)},
    "reading": {(0x20C0, 0x20C0), (0x2E53, 0x2E5D)},
    "symbols": {(0x20C0, 0x20C0)},
}


def load_fontconvert_module():
    module_path = SCRIPT_DIR / "fontconvert_sdcard.py"
    sys.path.insert(0, str(SCRIPT_DIR))
    spec = importlib.util.spec_from_file_location("fontconvert_sdcard", module_path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Unable to import {module_path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def is_assigned(codepoint: int) -> bool:
    try:
        unicodedata.name(chr(codepoint))
        return True
    except ValueError:
        return False


def codepoints_for_ranges(ranges: list[tuple[int, int]]) -> set[int]:
    codepoints = {0xFFFD}
    for start, end in ranges:
        codepoints.update(range(start, end + 1))
    return codepoints


def is_allowed_missing(preset: str, codepoint: int) -> bool:
    for start, end in ALLOWED_MISSING_ASSIGNED.get(preset, set()):
        if start <= codepoint <= end:
            return True
    return False


def read_cmap(path: Path) -> set[int]:
    font = TTFont(path, lazy=True)
    try:
        return set((font.getBestCmap() or {}).keys())
    finally:
        font.close()


def format_codepoint(codepoint: int) -> str:
    return f"U+{codepoint:04X} {unicodedata.name(chr(codepoint), 'UNASSIGNED')}"


def main() -> int:
    fontconvert = load_fontconvert_module()
    missing_files = [name for name in DEFAULT_FALLBACK_FILES if not (FALLBACK_DIR / name).exists()]
    if missing_files:
        print("Missing default fallback font files:", file=sys.stderr)
        for name in missing_files:
            print(f"  {name}", file=sys.stderr)
        return 1

    union_cmap: set[int] = set()
    for name in DEFAULT_FALLBACK_FILES:
        union_cmap.update(read_cmap(FALLBACK_DIR / name))

    failed = False
    for preset, ranges in sorted(fontconvert.INTERVAL_PRESETS.items()):
        requested = codepoints_for_ranges(ranges)
        missing_assigned = sorted(
            codepoint for codepoint in requested
            if codepoint not in union_cmap and is_assigned(codepoint)
        )
        unexpected = [
            codepoint for codepoint in missing_assigned
            if not is_allowed_missing(preset, codepoint)
        ]
        if unexpected:
            failed = True
            sample = ", ".join(format_codepoint(codepoint) for codepoint in unexpected[:20])
            suffix = " ..." if len(unexpected) > 20 else ""
            print(f"{preset}: {len(unexpected)} unexpected assigned gap(s): {sample}{suffix}", file=sys.stderr)
        else:
            allowed_count = len(missing_assigned)
            print(f"{preset}: ok ({allowed_count} known assigned gap(s))")

    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
