#!/bin/sh
# Regenerate public/og.png from og.html (1200x630 social card).
set -e
cd "$(dirname "$0")"
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --headless --disable-gpu --hide-scrollbars \
  --window-size=1200,630 --force-device-scale-factor=2 \
  --virtual-time-budget=8000 \
  --screenshot=og-2x.png "file://$PWD/og.html"
sips -z 630 1200 og-2x.png --out ../../public/og.png >/dev/null
rm -f og-2x.png
echo "wrote public/og.png"
