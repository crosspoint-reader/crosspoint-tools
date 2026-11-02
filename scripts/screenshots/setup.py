#!/usr/bin/env python3
"""Build the pinned simulator in a private, disposable checkout."""
import json
from pathlib import Path
import shutil
import subprocess
import sys

from pipeline import CACHE, HERE


def run(*args, cwd=None):
    subprocess.run(args, cwd=cwd, check=True)


def main():
    pio = shutil.which('pio') or str(Path.home() / '.platformio/penv/bin/pio')
    if not Path(pio).is_file() or not shutil.which('sdl2-config'):
        raise SystemExit('Install PlatformIO and SDL2 first. See scripts/screenshots/README.md.')
    sources = json.loads((HERE / 'sources.json').read_text())
    CACHE.mkdir(exist_ok=True)
    for name, source in sources.items():
        folder = CACHE / name
        if not folder.exists():
            folder.mkdir()
            run('git', 'init', str(folder))
            run('git', 'remote', 'add', 'origin', source['url'], cwd=folder)
        current = subprocess.run(['git', 'rev-parse', 'HEAD'], cwd=folder, capture_output=True, text=True)
        if current.stdout.strip() != source['ref']:
            # Refuse to overwrite a previous build; simulator hooks patch firmware files.
            if current.returncode == 0:
                raise SystemExit(f'{folder} is at a different revision; move it aside and rerun setup.')
            run('git', '-c', 'fetch.recurseSubmodules=false', 'fetch', '--depth=1', 'origin', source['ref'], cwd=folder)
            run('git', 'checkout', '--detach', 'FETCH_HEAD', cwd=folder)
    firmware = CACHE / 'firmware'
    run('git', 'submodule', 'update', '--init', '--recursive', '--depth=1', cwd=firmware)
    host = 'macos' if sys.platform == 'darwin' else 'linux-wsl'
    config = (CACHE / 'simulator' / f'sample-platformio-{host}.ini').read_text()
    config = config.replace('simulator=https://github.com/crosspoint-reader/crosspoint-simulator',
                            'simulator=https://github.com/crosspoint-reader/crosspoint-simulator#' + sources['simulator']['ref'])
    # Match the firmware's TTF hinting so small serif strokes survive quantization.
    config = config.replace('  -DSIMULATOR\n', '  -DSIMULATOR\n  -DFREEINK_FONT_ENABLE_AUTOHINT=1\n')
    (firmware / 'platformio.local.ini').write_text(config)
    run(pio, 'run', '-d', str(firmware), '-e', 'simulator_x4_pro')
    print('Ready: npm run screenshots')


if __name__ == '__main__':
    main()
