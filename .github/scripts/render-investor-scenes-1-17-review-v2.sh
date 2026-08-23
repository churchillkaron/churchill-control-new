#!/usr/bin/env bash
set -euo pipefail
SRC=.github/scripts/render-investor-scenes-1-17-review.sh
TMP=/tmp/render-investor-scenes-1-17-review-v2.sh
python3 - <<'PY'
from pathlib import Path
src=Path('.github/scripts/render-investor-scenes-1-17-review.sh').read_text()
needle="render_overlay(){\n local scene=$1 src=$2 out=$3 dur=$4 start=$5 ss=${6:-0}\n ffmpeg"
replacement="render_overlay(){\n local scene=$1 src=$2 out=$3 dur=$4 start=$5 ss=${6:-0}\n local fadeout\n fadeout=$(python3 -c \"print(max(0.0,float('$dur')-0.42))\")\n ffmpeg"
if needle not in src:
    raise SystemExit('RENDER_OVERLAY_FUNCTION_NOT_FOUND')
src=src.replace(needle,replacement,1)
bad="fade=t=out:st='max(0,$dur-.42)':d=.42:alpha=1"
good="fade=t=out:st=$fadeout:d=.42:alpha=1"
if bad not in src:
    raise SystemExit('INVALID_FADE_EXPRESSION_NOT_FOUND')
src=src.replace(bad,good,1)
Path('/tmp/render-investor-scenes-1-17-review-v2.sh').write_text(src)
PY
bash -n "$TMP"
bash "$TMP"
