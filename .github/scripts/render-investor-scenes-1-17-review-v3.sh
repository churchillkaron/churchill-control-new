#!/usr/bin/env bash
set -euo pipefail
SRC=.github/scripts/render-investor-scenes-1-17-review.sh
TMP=/tmp/render-investor-scenes-1-17-review-v3.sh
python3 - <<'PY'
from pathlib import Path
src=Path('.github/scripts/render-investor-scenes-1-17-review.sh').read_text()
src=src.replace(
"from PIL import Image, ImageDraw, ImageFont, ImageFilter",
"from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageOps",
1)
old='''def extract(name):
    im=Image.open(root/f'{name}.png').convert('RGBA'); px=im.load()
    for y in range(im.height):
        for x in range(im.width):
            r,g,b,a=px[x,y]; lum=.2126*r+.7152*g+.0722*b
            alpha=max(0,min(210,int((lum-18)*2.9)))
            if lum<34: alpha=0
            px[x,y]=(r,g,b,alpha)
    im=im.filter(ImageFilter.GaussianBlur(radius=.18)); im.save(out/f'{name}-transparent.png'); return im
'''
new='''def extract(name):
    im=Image.open(root/f'{name}.png').convert('RGBA')
    gray=ImageOps.grayscale(im.convert('RGB'))
    alpha=gray.point(lambda lum: 0 if lum < 34 else max(0,min(210,int((lum-18)*2.9))))
    im.putalpha(alpha)
    im=im.filter(ImageFilter.GaussianBlur(radius=.18))
    im.save(out/f'{name}-transparent.png')
    return im
'''
if old not in src:
    raise SystemExit('SLOW_EXTRACT_BLOCK_NOT_FOUND')
src=src.replace(old,new,1)
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
Path('/tmp/render-investor-scenes-1-17-review-v3.sh').write_text(src)
PY
bash -n "$TMP"
bash "$TMP"
