#!/usr/bin/env python3
"""Build the homepage collage from all GitHub-listed repository contributors."""
import argparse
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from io import BytesIO
import json
import math
import os
from pathlib import Path
import re
import tempfile
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit
from urllib.request import Request, urlopen

from PIL import Image, ImageDraw, ImageOps

ROOT = Path(__file__).resolve().parents[2]
REPO = 'crosspoint-reader/crosspoint-reader'
SIZE = (2400, 1600)
PAPER = '#f4f1e9'


def github_page(repo, page):
    headers = {'Accept': 'application/vnd.github+json', 'User-Agent': 'CrossPoint-contributor-collage'}
    token = os.environ.get('GITHUB_TOKEN') or os.environ.get('GH_TOKEN')
    if token:
        headers['Authorization'] = f'Bearer {token}'
    request = Request(f'https://api.github.com/repos/{repo}/contributors?per_page=100&page={page}', headers=headers)
    with urlopen(request, timeout=30) as response:
        return json.load(response)


def contributors(repo):
    users = {}
    page = 1
    while True:
        batch = github_page(repo, page)
        if not isinstance(batch, list):
            raise ValueError('GitHub did not return a contributor list')
        for user in batch:
            if not all(user.get(key) for key in ('id', 'login', 'avatar_url', 'html_url')):
                raise ValueError('Contributor is missing an account or avatar; refusing an incomplete collage')
            users[user['id']] = {key: user[key] for key in ('id', 'login', 'avatar_url', 'html_url', 'type')}
        if len(batch) < 100:
            break
        page += 1
    if not users:
        raise ValueError('GitHub returned no contributors; keeping existing assets')
    return sorted(users.values(), key=lambda user: user['login'].casefold())


def avatar(user):
    url = urlsplit(user['avatar_url'])
    if url.scheme != 'https' or url.hostname != 'avatars.githubusercontent.com':
        raise ValueError(f"Unexpected avatar host for {user['login']}")
    query = dict(parse_qsl(url.query))
    query['s'] = '256'
    request = Request(urlunsplit(url._replace(query=urlencode(query))),
                      headers={'User-Agent': 'CrossPoint-contributor-collage'})
    # No GitHub API credentials are sent to the avatar CDN.
    with urlopen(request, timeout=30) as response:
        data = response.read(5 * 1024 * 1024 + 1)
    if len(data) > 5 * 1024 * 1024:
        raise ValueError(f"Avatar too large: {user['login']}")
    with Image.open(BytesIO(data)) as image:
        return ImageOps.exif_transpose(image).convert('RGBA')


def positions(count):
    if count < 1:
        raise ValueError('A collage needs at least one avatar')
    width, height = SIZE
    columns = max(1, round(math.sqrt(count * width / height)))
    rows = math.ceil(count / columns)
    gap, padding = 10, 32
    tile = min((width - 2 * padding - (columns - 1) * gap) // columns,
               (height - 2 * padding - (rows - 1) * gap) // rows)
    if tile < 1:
        raise ValueError('Too many avatars for this canvas; increase SIZE')
    top = (height - (rows * tile + (rows - 1) * gap)) // 2
    boxes = []
    for row in range(rows):
        count_in_row = min(columns, count - row * columns)
        left = (width - (count_in_row * tile + (count_in_row - 1) * gap)) // 2
        for column in range(count_in_row):
            x, y = left + column * (tile + gap), top + row * (tile + gap)
            boxes.append((x, y, x + tile, y + tile))
    return boxes


def collage(avatars):
    canvas = Image.new('RGB', SIZE, PAPER)
    boxes = positions(len(avatars))
    tile = boxes[0][2] - boxes[0][0]
    mask = Image.new('L', (tile, tile), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, tile - 1, tile - 1), radius=8, fill=255)
    for image, box in zip(avatars, boxes):
        cropped = ImageOps.fit(image, (tile, tile), method=Image.Resampling.LANCZOS)
        background = Image.new('RGBA', cropped.size, PAPER)
        background.alpha_composite(cropped)
        canvas.paste(background.convert('RGB'), box[:2], mask)
    return canvas


def generate(repo, output):
    users = contributors(repo)
    print(f'Downloading avatars for all {len(users)} GitHub-listed contributors…', flush=True)
    with ThreadPoolExecutor(max_workers=8) as pool:
        images = list(pool.map(avatar, users))
    image = collage(images)
    manifest = {
        'repository': repo,
        'source': f'https://api.github.com/repos/{repo}/contributors',
        'scope': 'All accounts returned by GitHub contributors API; anonymous commits are not included.',
        'generatedAt': datetime.now(timezone.utc).isoformat(),
        'count': len(users),
        'width': image.width,
        'height': image.height,
        'contributors': users,
    }
    output.parent.mkdir(parents=True, exist_ok=True)
    # Finish every download and both artifacts before replacing the current image.
    with tempfile.TemporaryDirectory(dir=output.parent) as temporary:
        staging = Path(temporary)
        image.save(staging / 'collage.webp', format='WEBP', quality=90, method=6)
        (staging / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
        (staging / 'collage.webp').replace(output)
        (staging / 'manifest.json').replace(output.with_suffix('.json'))
    print(f'Saved {len(users)} avatars: {output} ({output.stat().st_size // 1024} KiB)', flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--repo', default=REPO)
    parser.add_argument('--output', type=Path, default=ROOT / 'public/community/contributors.webp')
    args = parser.parse_args()
    if not re.fullmatch(r'[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+', args.repo):
        parser.error('--repo must be owner/repository')
    if args.output.suffix.lower() != '.webp':
        parser.error('--output must end in .webp')
    generate(args.repo, args.output.expanduser().resolve())


if __name__ == '__main__':
    main()
