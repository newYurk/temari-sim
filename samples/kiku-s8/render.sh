#!/bin/bash
# Рендер SVG -> PNG через Chrome headless. Размер окна берётся из атрибутов width/height SVG.
cd "$(dirname "$0")/diagrams"
for f in *.svg; do
  w=$(grep -o 'width="[0-9]*"' "$f" | head -1 | tr -dc 0-9); h=$(grep -o 'height="[0-9]*"' "$f" | head -1 | tr -dc 0-9)
  google-chrome --headless=new --disable-gpu --no-sandbox --hide-scrollbars --force-device-scale-factor=1 \
    --window-size=${w},${h} --screenshot="$PWD/${f%.svg}.png" "file://$PWD/$f" >/dev/null 2>&1
  echo "${f%.svg}.png"
done
