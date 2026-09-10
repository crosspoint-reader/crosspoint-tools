#!/bin/zsh
# Export each deck slide to a 1920×1080 JPG (deck/slides/slide-NN.jpg).
# Uses headless Chrome + macOS sips. Usage: ./deck/export.sh [quality 0-100]
set -e
DIR="$(cd "$(dirname "$0")" && pwd)"
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
QUALITY="${1:-92}"
SLIDES=20
OUT="$DIR/slides"
mkdir -p "$OUT"

for i in $(seq 1 $SLIDES); do
  n=$(printf "%02d" "$i")
  "$CHROME" --headless=new --disable-gpu --hide-scrollbars \
    --window-size=1920,1080 --force-device-scale-factor=2 \
    --virtual-time-budget=15000 \
    --screenshot="$OUT/slide-$n.png" \
    "file://$DIR/index.html?slide=$i" 2>/dev/null
  sips -s format jpeg -s formatOptions "$QUALITY" "$OUT/slide-$n.png" --out "$OUT/slide-$n.jpg" >/dev/null
  rm "$OUT/slide-$n.png"
  echo "slide-$n.jpg"
done
echo "Done → $OUT"
