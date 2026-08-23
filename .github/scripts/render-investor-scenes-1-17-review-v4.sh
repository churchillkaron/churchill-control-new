#!/usr/bin/env bash
set -euo pipefail
SRC=.github/scripts/render-investor-scenes-1-17-review.sh
TMP=/tmp/render-investor-scenes-1-17-review-v4.sh
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

render_start=src.index('ffmpeg -y -i "$A/opening.mp4"')
upload_loop=src.index('for n in $(seq -w 1 17); do', render_start)
render_block=src[render_start:upload_loop]

def line_after(block, needle, addition):
    if needle not in block:
        raise SystemExit('RENDER_LINE_NOT_FOUND:'+needle[:40])
    return block.replace(needle, needle+'\n'+addition, 1)

upload_fn='''upload_scene(){
 local n=$1 file=$2
 local output="33336a72-acb5-474e-856b-8be0269360e2/37ca49f2-210d-4665-af6b-6b5fa834f750/scene-previews-20260823/review-scenes-1-17/scene-${n}.mp4"
 curl -fsSL -X POST -H "Authorization: Bearer ${OIDC_TOKEN}" -H "Content-Type: video/mp4" -H "X-Output-Path: ${output}" --data-binary @"$file" "$BRIDGE" | tee -a "$O/links.jsonl"
 echo "uploaded scene ${n}"
}
: > "$O/links.jsonl"

'''

lines=[
('ffmpeg -y -i "$A/opening.mp4" -t 15.35 -vf "scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,fps=24" -c:v libx264 -preset fast -crf 17 -c:a aac -b:a 256k -movflags +faststart "$O/scene-01.mp4" >/dev/null 2>&1','upload_scene 01 "$O/scene-01.mp4"'),
('render_voice "$A/founder-origin.mp4" "$O/scene-02.mp4" 5.063 0 0','upload_scene 02 "$O/scene-02.mp4"'),
('render_voice "$A/restaurant-a.mp4" "$O/scene-03.mp4" 6.328 5.063 0','upload_scene 03 "$O/scene-03.mp4"'),
('render_voice "$A/finance-world.mp4" "$O/scene-04.mp4" 2.953 11.391 0','upload_scene 04 "$O/scene-04.mp4"'),
('render_voice "$A/operations-world.mp4" "$O/scene-05.mp4" 1.266 14.344 0','upload_scene 05 "$O/scene-05.mp4"'),
('ffmpeg -y -i "$A/scene06-source.mp4" -t 7.6 -c:v libx264 -preset fast -crf 17 -c:a aac -b:a 256k -movflags +faststart "$O/scene-06.mp4" >/dev/null 2>&1','upload_scene 06 "$O/scene-06.mp4"'),
('render_voice "$A/manager.mp4" "$O/scene-07.mp4" 8.4375 19.8285 1.0','upload_scene 07 "$O/scene-07.mp4"'),
('render_voice "$A/founder-obvious.mp4" "$O/scene-08.mp4" 2.109 28.266 0','upload_scene 08 "$O/scene-08.mp4"'),
('render_overlay 09 "$A/manager.mp4" "$O/scene-09.mp4" 7.172 30.375 2.4','upload_scene 09 "$O/scene-09.mp4"'),
('render_voice "$A/founder-built.mp4" "$O/scene-10.mp4" 2.531 37.547 0','upload_scene 10 "$O/scene-10.mp4"'),
('render_overlay 11 "$A/manager.mp4" "$O/scene-11.mp4" 7.594 40.078 2.4','upload_scene 11 "$O/scene-11.mp4"'),
('render_overlay 12 "$A/manager.mp4" "$O/scene-12.mp4" 7.172 47.672 2.4','upload_scene 12 "$O/scene-12.mp4"'),
('render_overlay 13 "$A/manager.mp4" "$O/scene-13.mp4" 7.172 54.844 2.4','upload_scene 13 "$O/scene-13.mp4"'),
('render_overlay 14 "$A/manager.mp4" "$O/scene-14.mp4" 5.484 62.016 2.4','upload_scene 14 "$O/scene-14.mp4"'),
('render_overlay 15 "$A/manager.mp4" "$O/scene-15.mp4" 5.484 67.5 2.4','upload_scene 15 "$O/scene-15.mp4"'),
('render_overlay 16 "$A/manager-16.mp4" "$O/scene-16.mp4" 2.954 72.984 0','upload_scene 16 "$O/scene-16.mp4"'),
('render_overlay 17 "$A/manager.mp4" "$O/scene-17.mp4" 5.625 75.938 2.4','upload_scene 17 "$O/scene-17.mp4"'),
]
for needle_line, addition in lines:
    render_block=line_after(render_block, needle_line, addition)

probe_start=render_block.find('for f in "$O"/*.mp4; do')
if probe_start < 0:
    raise SystemExit('FFPROBE_BLOCK_NOT_FOUND')
render_block=render_block[:probe_start] + '''for f in "$O"/*.mp4; do ffprobe -v error -show_entries format=filename,duration,size -of csv=p=0 "$f"; done | tee "$O/ffprobe.txt"\n'''

src=src[:render_start] + upload_fn + render_block + 'echo REVIEW_SCENES_1_17_COMPLETE\n'
Path('/tmp/render-investor-scenes-1-17-review-v4.sh').write_text(src)
PY
bash -n "$TMP"
bash "$TMP"
