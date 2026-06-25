#!/usr/bin/env python3
"""Export 1-bit BMP icon assets for SD themes.

By default this preserves the historical CrossPoint flow: compiled firmware icon
headers under src/components/icons are converted into SD-card BMPs.

With --from-freeink-sdk, themes can instead declare SDK/Lucide icon names in
assets.freeInkIcons. This script rasterizes those SVGs through the FreeInk SDK
icon generator path, writes BMPs into each theme's icons/ folder, and updates
assets.icons so the current firmware can load them from SD.
"""

import argparse
import importlib.util
import json
import re
import struct
import subprocess
import sys
import tempfile
from pathlib import Path


ICON_HEADERS = [
    "book.h",
    "book24.h",
    "bookmark.h",
    "cover.h",
    "file24.h",
    "folder.h",
    "folder24.h",
    "hotspot.h",
    "image24.h",
    "library.h",
    "recent.h",
    "settings2.h",
    "text24.h",
    "transfer.h",
    "wifi.h",
]

DEFAULT_ICON_SIZES = {
    "book24": 24,
    "file24": 24,
    "folder24": 24,
    "image24": 24,
    "text24": 24,
}


def parse_icon_header(path: Path):
    text = path.read_text()
    size_match = re.search(r"//\s*size:\s*(\d+)x(\d+)", text)
    if not size_match:
        raise ValueError(f"missing size comment in {path}")
    width = int(size_match.group(1))
    height = int(size_match.group(2))

    bitmap_match = re.search(r"static\s+const\s+uint8_t\s+\w+\s*\[\]\s*=\s*\{(?P<body>.*?)\};", text, re.DOTALL)
    if not bitmap_match:
        raise ValueError(f"missing bitmap data in {path}")
    bitmap_body = bitmap_match.group("body")

    values = [int(m.group(1), 16) for m in re.finditer(r"0x([0-9A-Fa-f]{2})", bitmap_body)]
    expected = ((width + 7) // 8) * height
    if len(values) != expected:
        raise ValueError(f"{path}: expected {expected} bytes, found {len(values)}")
    return width, height, bytes(values)


def get_bit(bitmap: bytes, width: int, x: int, y: int) -> int:
    stride = (width + 7) // 8
    return (bitmap[y * stride + x // 8] >> (7 - (x % 8))) & 1


def set_bit(buf: bytearray, width: int, x: int, y: int, value: int):
    stride = (width + 7) // 8
    if value:
        buf[y * stride + x // 8] |= 1 << (7 - (x % 8))


def rotate_1bit_cw(width: int, height: int, bitmap: bytes):
    rotated_width = height
    rotated_height = width
    rotated = bytearray(((rotated_width + 7) // 8) * rotated_height)
    for y in range(height):
        for x in range(width):
            set_bit(rotated, rotated_width, height - 1 - y, x, get_bit(bitmap, width, x, y))
    return rotated_width, rotated_height, bytes(rotated)


def write_1bit_bmp(path: Path, width: int, height: int, bitmap: bytes):
    src_stride = (width + 7) // 8
    dst_stride = ((width + 31) // 32) * 4
    pixel_bytes = dst_stride * height
    pixel_offset = 14 + 40 + 8
    file_size = pixel_offset + pixel_bytes

    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("wb") as out:
        # BITMAPFILEHEADER
        out.write(b"BM")
        out.write(struct.pack("<IHHI", file_size, 0, 0, pixel_offset))
        # BITMAPINFOHEADER. Negative height stores rows top-down.
        out.write(struct.pack("<IiiHHIIiiII", 40, width, -height, 1, 1, 0, pixel_bytes, 0, 0, 2, 0))
        # Palette index 0 = black, index 1 = white. Existing icon arrays use 1s
        # for white/transparent background and 0s for ink.
        out.write(bytes([0, 0, 0, 0, 255, 255, 255, 0]))
        for y in range(height):
            row = bitmap[y * src_stride : (y + 1) * src_stride]
            out.write(row)
            out.write(b"\x00" * (dst_stride - src_stride))


def load_freeink_generator(sdk_root: Path):
    generator_path = sdk_root / "libs" / "assets" / "Icons" / "tools" / "gen_icons.py"
    if not generator_path.exists():
        raise FileNotFoundError(f"FreeInk icon generator not found: {generator_path}")
    spec = importlib.util.spec_from_file_location("freeink_gen_icons", generator_path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def collect_freeink_icon_names(theme_root: Path):
    names = set()
    for theme_dir in sorted(theme_root.iterdir()):
        theme_json = theme_dir / "theme.json"
        if not theme_dir.is_dir() or not theme_json.exists():
            continue
        doc = json.loads(theme_json.read_text(encoding="utf-8"))
        freeink_icons = doc.get("assets", {}).get("freeInkIcons", {})
        if not freeink_icons:
            continue
        for lucide_name in freeink_icons.values():
            if not isinstance(lucide_name, str):
                raise ValueError(f"{theme_json}: assets.freeInkIcons values must be strings")
            names.add(lucide_name)
    return sorted(names)


def icon_size_for_key(key: str, default_size: int) -> int:
    if key.startswith("hint"):
        return 24
    return DEFAULT_ICON_SIZES.get(key, default_size)


def generate_from_headers(icon_root: Path, theme_root: Path):
    parsed = []
    for header in ICON_HEADERS:
        icon_path = icon_root / header
        width, height, data = parse_icon_header(icon_path)
        width, height, data = rotate_1bit_cw(width, height, data)
        parsed.append((icon_path.stem, width, height, data))

    for theme_dir in sorted(theme_root.iterdir()):
        if not theme_dir.is_dir() or not (theme_dir / "theme.json").exists():
            continue
        for name, width, height, data in parsed:
            write_1bit_bmp(theme_dir / "icons" / f"{name}.bmp", width, height, data)


def generate_from_freeink_sdk(theme_root: Path, sdk_root: Path, default_size: int):
    generator = load_freeink_generator(sdk_root)
    svg_dir = sdk_root / "libs" / "assets" / "Icons" / "lucide" / "icons"
    if not svg_dir.exists():
        raise FileNotFoundError(f"FreeInk Lucide SVG directory not found: {svg_dir}")

    for theme_dir in sorted(theme_root.iterdir()):
        theme_json = theme_dir / "theme.json"
        if not theme_dir.is_dir() or not theme_json.exists():
            continue

        doc = json.loads(theme_json.read_text(encoding="utf-8"))
        freeink_icons = doc.get("assets", {}).get("freeInkIcons", {})
        if not freeink_icons:
            continue

        assets = doc.setdefault("assets", {})
        icons = assets.setdefault("icons", {})
        for key, lucide_name in sorted(freeink_icons.items()):
            if not isinstance(key, str) or not isinstance(lucide_name, str):
                raise ValueError(f"{theme_json}: assets.freeInkIcons values must be strings")
            svg_path = svg_dir / f"{lucide_name}.svg"
            if not svg_path.exists():
                raise FileNotFoundError(f"{theme_json}: missing FreeInk/Lucide icon '{lucide_name}' at {svg_path}")

            size = icon_size_for_key(key, default_size)
            data, _center = generator.pack(generator.rasterize(str(svg_path), size), size)
            width, height, rotated = rotate_1bit_cw(size, size, bytes(data))
            rel_path = f"icons/{key}.bmp"
            write_1bit_bmp(theme_dir / rel_path, width, height, rotated)
            icons[key] = rel_path

        theme_json.write_text(json.dumps(doc, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def generate_firmware_registry(theme_root: Path, sdk_root: Path, sizes: str, firmware_out: Path, registry_out: Path):
    generator = load_freeink_generator(sdk_root)
    names = collect_freeink_icon_names(theme_root)
    if not names:
        raise ValueError(f"no assets.freeInkIcons entries found under {theme_root}")

    svg_dir = sdk_root / "libs" / "assets" / "Icons" / "lucide" / "icons"
    generator_path = sdk_root / "libs" / "assets" / "Icons" / "tools" / "gen_icons.py"
    firmware_out.parent.mkdir(parents=True, exist_ok=True)
    registry_out.parent.mkdir(parents=True, exist_ok=True)

    with tempfile.TemporaryDirectory() as tmp:
        manifest = Path(tmp) / "freeink-theme-icons.txt"
        manifest.write_text("\n".join(f"{name} = {name}" for name in names) + "\n", encoding="utf-8")
        subprocess.run(
            [
                sys.executable,
                str(generator_path),
                "--manifest",
                str(manifest),
                "--svgdir",
                str(svg_dir),
                "--sizes",
                sizes,
                "--out",
                str(firmware_out),
            ],
            check=True,
        )

    parsed_sizes = [int(size) for size in sizes.split(",") if size.strip()]
    entries = []
    for name in names:
        ident = generator.ident(name)
        for size in parsed_sizes:
            entries.append(f'    {{"{name}", {size}, &icon_{ident}_{size}}},')

    registry_out.write_text(
        "\n".join(
            [
                '#include "FreeInkThemeIconRegistry.h"',
                "",
                "#include <cstring>",
                "",
                '#include "freeink_theme_icons.generated.h"',
                "",
                "namespace {",
                "struct IconEntry {",
                "  const char* name;",
                "  int size;",
                "  const freeink::Icon* icon;",
                "};",
                "",
                "const IconEntry ICONS[] = {",
                *entries,
                "};",
                "}  // namespace",
                "",
                "const freeink::Icon* findFreeInkThemeIcon(const char* lucideName, int size) {",
                "  if (lucideName == nullptr || size <= 0) return nullptr;",
                "  int bestSize = 0;",
                "  const freeink::Icon* best = nullptr;",
                "  for (const auto& entry : ICONS) {",
                "    if (std::strcmp(entry.name, lucideName) != 0) continue;",
                "    if (entry.size == size) return entry.icon;",
                "    if (best == nullptr || (entry.size >= size && (bestSize < size || entry.size < bestSize)) ||",
                "        (bestSize < size && entry.size > bestSize)) {",
                "      best = entry.icon;",
                "      bestSize = entry.size;",
                "    }",
                "  }",
                "  return best;",
                "}",
                "",
            ]
        ),
        encoding="utf-8",
    )


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--icons", default="src/components/icons")
    parser.add_argument("--themes", default="public/themes")
    parser.add_argument("--from-freeink-sdk", action="store_true", help="Generate assets.icons from assets.freeInkIcons")
    parser.add_argument("--freeink-sdk", default="../freeink-sdk", help="Path to the FreeInk SDK checkout/submodule")
    parser.add_argument("--size", type=int, default=32, help="Default generated SDK icon size in pixels")
    parser.add_argument("--firmware-out", help="Generate a compiled FreeInk icon header from all assets.freeInkIcons")
    parser.add_argument("--registry-out", help="Generate a C++ lookup registry for --firmware-out")
    parser.add_argument("--firmware-sizes", default="24,32", help="Comma-separated compiled FreeInk icon sizes")
    args = parser.parse_args()

    icon_root = Path(args.icons)
    theme_root = Path(args.themes)

    if args.firmware_out or args.registry_out:
        if not args.firmware_out or not args.registry_out:
            parser.error("--firmware-out and --registry-out must be used together")
        generate_firmware_registry(theme_root, Path(args.freeink_sdk), args.firmware_sizes, Path(args.firmware_out),
                                   Path(args.registry_out))
    elif args.from_freeink_sdk:
        generate_from_freeink_sdk(theme_root, Path(args.freeink_sdk), args.size)
    else:
        generate_from_headers(icon_root, theme_root)


if __name__ == "__main__":
    main()
