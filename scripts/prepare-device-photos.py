"""Prepare comparison photos locally with Pillow.

Usage: python scripts/prepare-device-photos.py CLOSEUPS_DIR HEADER_PHOTO
Crop coordinates refer to EXIF-oriented originals. Each closeup uses a 4:5
crop, positioned individually to keep the entire device in the frame.
"""

import sys
from pathlib import Path

from PIL import Image, ImageOps


CROPS = {
    'eego_a4_1': (0, 1280, 1884, 3635),
    'eego_a4_2': (0, 1080, 1884, 3435),
    'papermono_1': (0, 805, 1884, 3160),
    'papermono_2': (0, 865, 1884, 3220),
    'sticky_1': (350, 640, 1850, 2515),
    'sticky_2': (220, 1085, 1884, 3165),
    'x3_1': (90, 1200, 1790, 3325),
    'x3_2': (40, 1250, 1740, 3375),
    'x4_1': (90, 700, 1594, 2580),
    'x4_2': (0, 640, 1884, 2995),
    'x4c_1': (100, 785, 1884, 3015),
    'x4c_2': (0, 850, 1884, 3205),
    'x4pro_1': (0, 775, 1884, 3130),
    'x4pro_2': (0, 1070, 1884, 3425),
}


def prepare(closeups, header):
    output = Path(__file__).resolve().parents[1] / 'public' / 'device-comparison'
    output.mkdir(parents=True, exist_ok=True)
    for name, (left, top, right, bottom) in CROPS.items():
        with Image.open(closeups / f'{name}.jpg') as source:
            image = ImageOps.exif_transpose(source).convert('RGB')
            assert 0 <= left < right <= image.width
            assert 0 <= top < bottom <= image.height
            assert (right - left) * 5 == (bottom - top) * 4
            image = image.crop((left, top, right, bottom))
            image = image.resize((1000, 1250), Image.Resampling.LANCZOS)
            image.save(output / f'{name}.webp', quality=78, method=6)
    with Image.open(header) as source:
        image = ImageOps.exif_transpose(source).convert('RGB')
        image.thumbnail((1600, 1600), Image.Resampling.LANCZOS)
        image.save(output / 'hero.webp', quality=82, method=6)
    for path in sorted(output.glob('*.webp')):
        with Image.open(path) as image:
            print(f'{path.name}: {image.width}×{image.height}, {path.stat().st_size / 1024:.0f} KiB')


if __name__ == '__main__':
    prepare(Path(sys.argv[1]), Path(sys.argv[2]))
