#!/usr/bin/env python3
"""Capture real firmware screens on an isolated SD card and prepare website assets."""
import argparse
import hashlib
import html
import json
import os
from pathlib import Path
import re
import shutil
import struct
import subprocess
import tempfile
import time
from urllib.parse import urlsplit

from PIL import Image, ImageChops, ImageFilter, ImageOps

ROOT = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent
CACHE = ROOT / '.screenshots'


def digest(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def read_recipe(path):
    recipe = json.loads(path.read_text())
    for key in ('booksDirectory', 'fontsDirectory'):
        if key in recipe and (not isinstance(recipe[key], str) or not recipe[key].strip()):
            raise ValueError(f'{key} must be a nonempty folder path')
    names = set()
    for book in recipe['books']:
        if Path(book).name != book or not book.lower().endswith('.epub'):
            raise ValueError(f'Book must be an EPUB filename: {book}')
    for scene in recipe['scenes']:
        name = scene['name']
        if not re.fullmatch(r'[a-z0-9]+(?:-[a-z0-9]+)*', name) or name in names:
            raise ValueError(f'Invalid or duplicate scene name: {name}')
        names.add(name)
        if scene.get('book') and scene['book'] not in recipe['books']:
            raise ValueError(f'{name}: book must appear in books')
        if not isinstance(scene['at'], int) or not 1000 <= scene['at'] <= 180000:
            raise ValueError(f'{name}: capture time must be 1000–180000 ms')
        if 'position' in scene:
            if not scene.get('book') or len(scene['position']) != 2 or any(
                    not isinstance(n, int) or not 0 <= n < 65535 for n in scene['position']):
                raise ValueError(f'{name}: position needs a book and [spine, page] indexes')
        servers = scene.get('opdsServers', [])
        if not isinstance(servers, list) or len(servers) > 8:
            raise ValueError(f'{name}: opdsServers must be a list of at most 8 servers')
        for server in servers:
            if not isinstance(server, dict) or set(server) != {'name', 'url'}:
                raise ValueError(f'{name}: each OPDS server needs only name and url')
            if not isinstance(server['name'], str) or not server['name'].strip() or not isinstance(server['url'], str):
                raise ValueError(f'{name}: OPDS name and URL must be nonempty strings')
            url = urlsplit(server['url'])
            if url.scheme not in {'http', 'https'} or not url.hostname or url.username or url.password:
                raise ValueError(f'{name}: OPDS URL must be HTTP(S) without credentials')
        previous = -1
        for at, action in scene.get('inputs', []):
            if not isinstance(at, int) or not previous < at < scene['at']:
                raise ValueError(f'{name}: inputs must be ordered before capture')
            if not re.fullmatch(r'(BACK|ENTER|LEFT|RIGHT|UP|DOWN|HOME|POWER)(:\d{1,4})?', action):
                raise ValueError(f'{name}: unsupported button {action}')
            previous = at
        if len(scene.get('size', [480, 800])) != 2 or any(
                not isinstance(n, int) or not 100 <= n <= 2000 for n in scene.get('size', [480, 800])):
            raise ValueError(f'{name}: invalid native screen size')
    if not names:
        raise ValueError('Recipe needs at least one scene')
    return recipe


def polish(source, size, paper='#f4f1e9', ink='#242820'):
    with Image.open(source) as image:
        gray = image.convert('L')
    if gray.width * size[1] != gray.height * size[0]:
        raise ValueError(f'{source}: unexpected capture aspect ratio {gray.size}; expected {size}')
    if gray.width < size[0]:
        raise ValueError(f'{source}: capture smaller than native panel')
    # Normalize Retina captures before filtering so exports match across hosts.
    gray = gray.resize(size, Image.Resampling.BOX)
    if gray.getextrema()[1] - gray.getextrema()[0] < 20:
        raise ValueError(f'{source}: blank/low-contrast screenshot')
    # Collapse regular 2x2 dither in flat-tone areas, keeping text/line edges sharp.
    tones = gray.resize((size[0] // 2, size[1] // 2), Image.Resampling.BOX)
    spread = ImageChops.subtract(tones.filter(ImageFilter.MaxFilter(3)),
                                tones.filter(ImageFilter.MinFilter(3)))
    flat = spread.point(lambda value: 255 if value < 32 else 0)
    midtone = tones.point(lambda value: 255 if 24 < value < 232 else 0)
    mask = ImageChops.multiply(flat, midtone).resize(size, Image.Resampling.BILINEAR)
    gray = Image.composite(gray.filter(ImageFilter.GaussianBlur(0.85)), gray, mask)
    # shortcut: a mild reconstruction filter cannot recover lost 1-bit detail;
    # use higher-resolution firmware rendering if typography needs finer detail.
    gray = gray.filter(ImageFilter.GaussianBlur(0.3))
    gray = gray.resize((size[0] * 3, size[1] * 3), Image.Resampling.LANCZOS)
    return ImageOps.colorize(gray, black=ink, white=paper)


def capture(binary, books, recipe, output, fonts=None):
    output.mkdir(parents=True, exist_ok=False)
    raw = output / 'raw'
    raw.mkdir()
    sources = [books / name for name in recipe['books']]
    for source in sources:
        if not source.is_file():
            raise FileNotFoundError(f'Book not found: {source}')
    if fonts is not None and not fonts.is_dir():
        raise FileNotFoundError(f'Font folder not found: {fonts}')
    font_files = [] if fonts is None else [p for p in sorted(fonts.rglob('*'))
        if p.is_file() and p.suffix.lower() in {'.ttf', '.otf', '.ttc', '.cpfont'}]
    report = {'binarySha256': digest(binary), 'recipe': recipe,
              'books': {p.name: digest(p) for p in sources}, 'scenes': []}
    if fonts is not None:
        report['fonts'] = {p.relative_to(fonts).as_posix(): digest(p) for p in font_files}
    for scene in recipe['scenes']:
        name = scene['name']
        print(f'Capturing {name}…', flush=True)
        with tempfile.TemporaryDirectory(prefix='crosspoint-shot-') as temporary:
            work = Path(temporary)
            sd = work / 'sd'
            (sd / 'books').mkdir(parents=True)
            (sd / '.crosspoint').mkdir()
            for font in font_files:
                destination = sd / 'fonts' / font.relative_to(fonts)
                destination.parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(font, destination)
            for source in sources:
                shutil.copyfile(source, sd / 'books' / source.name)
            settings = {'language': 'EN', 'textAntiAliasing': 1, **recipe.get('settings', {}),
                        **scene.get('settings', {})}
            (sd / '.crosspoint/settings.json').write_text(json.dumps(settings))
            (sd / '.crosspoint/opds.json').write_text(json.dumps({'servers': scene.get('opdsServers', [])}))
            state = {'showBootScreen': False, 'lastSleepFromReader': bool(scene.get('book')),
                     'openEpubPath': f"/books/{scene['book']}" if scene.get('book') else ''}
            (sd / '.crosspoint/state.json').write_text(json.dumps(state))
            inputs = [f'{at}:{action}' for at, action in scene.get('inputs', [])]
            inputs.append(f"{scene['at'] + 700}:QUIT")
            # Do not inherit other simulator overrides or wake schedules.
            env = {k: v for k, v in os.environ.items() if not k.startswith('CROSSPOINT_SIM_')}
            env.update(CROSSPOINT_SIM_SD=str(sd), CROSSPOINT_SIM_INPUT_SCRIPT=';'.join(inputs),
                       CROSSPOINT_SIM_SCREENSHOTS=f"{scene['at']}:{raw / (name + '.bmp')}")
            if 'position' in scene:
                warm_env = {**env, 'CROSSPOINT_SIM_INPUT_SCRIPT': '9000:QUIT',
                            'CROSSPOINT_SIM_SCREENSHOTS': ''}
                with (raw / f'{name}-prepare.log').open('w') as log:
                    subprocess.run([str(binary)], cwd=work, env=warm_env, stdout=log,
                                   stderr=subprocess.STDOUT, check=True, timeout=40)
                caches = list((sd / '.crosspoint').glob('epub_*/book.bin'))
                if len(caches) != 1:
                    raise ValueError(f'{name}: expected exactly one indexed book, got {len(caches)}')
                # The pinned firmware accepts the legacy 4-byte spine/page record.
                (caches[0].parent / 'progress.bin').write_bytes(struct.pack('<HH', *scene['position']))
                (sd / '.crosspoint/state.json').write_text(json.dumps(state))
            with (raw / f'{name}.log').open('w') as log:
                subprocess.run([str(binary)], cwd=work, env=env, stdout=log, stderr=subprocess.STDOUT,
                               check=True, timeout=scene['at'] / 1000 + 30)
        image = polish(raw / f'{name}.bmp', tuple(scene.get('size', [480, 800])),
                       **recipe.get('palette', {}))
        image.save(output / f'{name}.png', optimize=True)
        image.save(output / f'{name}.webp', quality=92, method=6)
        report['scenes'].append({'name': name, 'width': image.width, 'height': image.height,
                                 'sha256': digest(output / f'{name}.png'),
                                 'webpSha256': digest(output / f'{name}.webp')})
    (output / 'manifest.json').write_text(json.dumps(report, indent=2) + '\n')
    cards = ''.join(f'<figure><a href="{s["name"]}.png"><img src="{s["name"]}.webp" alt="{s["name"]}"></a>'
                    f'<figcaption>{html.escape(s["name"])} · <a href="raw/{s["name"]}.bmp">Raw</a></figcaption></figure>' for s in recipe['scenes'])
    (output / 'index.html').write_text('<!doctype html><html lang="en"><meta charset="utf-8">'
        '<meta name="viewport" content="width=device-width,initial-scale=1"><title>Screenshot review</title>'
        '<style>body{margin:40px;background:#f4f1e9;color:#242820;font:16px system-ui}'
        'main{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:32px}'
        'figure{margin:0}img{width:100%;height:auto;border-radius:8px}figcaption{padding:12px 0}</style>'
        '<h1>CrossPoint screenshot review</h1><p>Click a screen for the full-resolution PNG.</p><main>' + cards + '</main>')
    print(f'Review: {output / "index.html"}', flush=True)


def publish(output):
    report = json.loads((output / 'manifest.json').read_text())
    # Validate the complete batch before replacing any website assets.
    for scene in report['scenes']:
        if not re.fullmatch(r'[a-z0-9]+(?:-[a-z0-9]+)*', scene['name']):
            raise ValueError('Invalid published filename')
        if digest(output / f"{scene['name']}.png") != scene['sha256']:
            raise ValueError('PNG changed since capture; run the pipeline again')
        if digest(output / f"{scene['name']}.webp") != scene['webpSha256']:
            raise ValueError('WebP changed since capture; run the pipeline again')
    target = ROOT / 'public/screenshots'
    target.mkdir(exist_ok=True)
    for scene in report['scenes']:
        for extension in ('png', 'webp'):
            filename = f"{scene['name']}.{extension}"
            shutil.copyfile(output / filename, target / filename)
    print(f'Published {len(report["scenes"])} screens to {target}')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--binary', type=Path, default=CACHE / 'firmware/.pio/build/simulator_x4_pro/program')
    parser.add_argument('--books', type=Path, help='Override booksDirectory from the configuration')
    parser.add_argument('--config', '--recipe', dest='config', type=Path, default=HERE / 'settings.json',
                        help='Configuration file (default: scripts/screenshots/settings.json)')
    parser.add_argument('--scene', action='append', help='Capture only this scene (repeatable)')
    parser.add_argument('--publish', type=Path, metavar='REVIEWED_RUN', help='Publish an existing reviewed batch')
    args = parser.parse_args()
    if args.publish:
        publish(args.publish.resolve())
        return
    config = args.config.expanduser().resolve()
    recipe = read_recipe(config)
    if args.scene:
        unknown = set(args.scene) - {s['name'] for s in recipe['scenes']}
        if unknown:
            parser.error(f'Unknown scenes: {sorted(unknown)}')
        recipe['scenes'] = [s for s in recipe['scenes'] if s['name'] in args.scene]
    binary = args.binary.resolve()
    if not binary.is_file():
        parser.error('Simulator missing; run npm run screenshots:setup or pass --binary')
    output = CACHE / 'runs' / time.strftime('%Y%m%d-%H%M%S')
    books = (args.books or Path(recipe.get('booksDirectory', '/Users/jmitch/Books/Common Stacks'))).expanduser()
    if not books.is_absolute() and args.books is None:
        books = config.parent / books
    fonts = None
    if 'fontsDirectory' in recipe:
        fonts = Path(recipe['fontsDirectory']).expanduser()
        if not fonts.is_absolute():
            fonts = config.parent / fonts
        fonts = fonts.resolve()
    capture(binary, books.resolve(), recipe, output, fonts=fonts)


if __name__ == '__main__':
    main()
