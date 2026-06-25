#!/usr/bin/env python3
"""Generate a themes.json manifest from SD theme package folders."""

import argparse
import json
import zlib
from pathlib import Path


def safe_theme_dirs(root: Path):
    for child in sorted(root.iterdir()):
        if not child.is_dir() or child.name.startswith(".") or child.name.startswith("_"):
            continue
        theme_json = child / "theme.json"
        if theme_json.exists():
            yield child


def collect_optional_freeink_icon_fallbacks(theme_doc: dict) -> set[str]:
    paths = set()

    def collect(scope: dict):
        assets = scope.get("assets", {})
        freeink_icons = assets.get("freeInkIcons", {})
        bitmap_icons = assets.get("icons", {})
        if not isinstance(freeink_icons, dict) or not isinstance(bitmap_icons, dict):
            return
        for key in freeink_icons:
            bitmap_path = bitmap_icons.get(key)
            if isinstance(bitmap_path, str):
                paths.add(bitmap_path)

    collect(theme_doc)
    devices = theme_doc.get("devices", {})
    if isinstance(devices, dict):
        for device_doc in devices.values():
            if isinstance(device_doc, dict):
                collect(device_doc)

    return paths


def build_manifest(root: Path, base_url: str):
    themes = []
    for theme_dir in safe_theme_dirs(root):
        theme_doc = json.loads((theme_dir / "theme.json").read_text(encoding="utf-8"))
        optional_files = collect_optional_freeink_icon_fallbacks(theme_doc)
        files = []
        total = 0
        for file_path in sorted(p for p in theme_dir.rglob("*") if p.is_file()):
            rel = file_path.relative_to(theme_dir).as_posix()
            data = file_path.read_bytes()
            total += len(data)
            entry = {
                "path": rel,
                "url": f"{theme_dir.name}/{rel}",
                "size": len(data),
                "crc32": zlib.crc32(data) & 0xFFFFFFFF,
            }
            if rel in optional_files:
                entry["optional"] = True
                entry["role"] = "freeInkIconFallback"
            files.append(entry)

        themes.append(
            {
                "id": theme_doc["id"],
                "version": int(theme_doc.get("version", 1)),
                "name": theme_doc.get("name", theme_doc["id"]),
                "description": theme_doc.get("description", ""),
                "files": files,
                "totalSize": total,
            }
        )

    return {"version": 1, "baseUrl": base_url, "themes": themes}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", default="public/themes")
    parser.add_argument("--base-url", default="https://crosspointreader.com/themes")
    parser.add_argument("--output", default="public/themes/themes.json")
    args = parser.parse_args()

    manifest = build_manifest(Path(args.root), args.base_url)
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
