#!/usr/bin/env bash
set -euo pipefail

A=/tmp/avq-review-9-17/assets
F=/tmp/avq-review-9-17/fragments
O=review-scenes
BRIDGE="https://vfsjqabpkcbiuerhzugk.supabase.co/functions/v1/avantiqo-investor-review-render"
mkdir -p "$A" "$F" "$O"

python3 - <<'PY' >/tmp/avq-review-9-17-sign.json
import json
org='33336a72-acb5-474e-856b-8be0269360e2'
paths=[
 f'{org}/unassigned/61b4afe1-93ae-4e1e-a92f-60dff5d629be-avantiqo-investor-manager-ee25292e-4fd3-4249-81cb-3ab526fd2048.mp4',
 f'{org}/unassigned/a360b2ec-ba79-4213-8732-1f3bd5b9785c-avantiqo-investor-manager-013346ff-b7a0-415d-b09d-1dba40b4be0b.mp4',
 f'{org}/avantiqo-investor-film-20260820/founder-v7/founder-opening-built-synced-approved-v7.mp4',
 f'{org}/avantiqo-investor-video-20260818/avantiqo-investor-narration-cedar-v5-founder-locked-229.5s.mp3',
 f'{org}/avantiqo-investor-film-20260820/audio/avantiqo-investor-score-v1-approved.mp3',
 f'{org}/avantiqo-investor-film-20260820/ui/organization_intelligence.png',
 f'{org}/avantiqo-investor-film-20260820/ui/customer_communications.png',
 f'{org}/avantiqo-investor-film-20260820/ui/operations_command_center.png',
 f'{org}/avantiqo-investor-film-20260820/ui/finance.png',
 f'{org}/avantiqo-investor-film-20260820/ui/supply_chain.png',
 f'{org}/avantiqo-investor-film-20260820/ui/employee_directory.png'
]
print(json.dumps({'action':'sign','paths':paths}))
PY

curl -fsSL -X POST \
  -H "Authorization: Bearer ${OIDC_TOKEN}" \
  -H "Content-Type: application/json" \
  --data-binary @/tmp/avq-review-9-17-sign.json \
  "$BRIDGE" >/tmp/avq-review-9-17-assets.json

python3 - <<'PY'
import json, pathlib, urllib.request
p=json.loads(pathlib.Path('/tmp/avq-review-9-17-assets.json').read_text())
assert p.get('success') is True, p
names={
 '61b4afe1-93ae-4e1e-a92f-60dff5d629be-avantiqo-investor-manager-ee25292e-4fd3-4249-81cb-3ab526fd2048.mp4':'manager.mp4',
 'a360b2ec-ba79-4213-8732-1f3bd5b9785c-avantiqo-investor-manager-013346ff-b7a0-415d-b09d-1dba40b4be0b.mp4':'manager16.mp4',
 'founder-opening-built-synced-approved-v7.mp4':'founder-built.mp4',
 'avantiqo-investor-narration-cedar-v5-founder-locked-229.5s.mp3':'voice.mp3',
 'avantiqo-investor-score-v1-approved.mp3':'score.mp3',
 'organization_intelligence.png':'organization.png',
 'customer_communications.png':'customer.png',
 'operations_command_center.png':'operations.png',
 'finance.png':'finance.png',
 'supply_chain.png':'supply.png',
 'employee_directory.png':'employee.png',
}
out=pathlib.Path('/tmp/avq-review-9-17/assets')
for storage_path,url in p['assets'].items():
    target=out/names[pathlib.PurePosixPath(storage_path).name]
    urllib.request.urlretrieve(url,target)
    assert target.stat().st_size > 0, target
    print('downloaded',target.name,target.stat().st_size)
PY

python3 - <<'PY'
from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageOps
from pathlib import Path
root=Path('/tmp/avq-review-9-17/assets')
out=Path('/tmp/avq-review-9-17/fragments')
W,H=1920,1080
font='/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
bold='/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'

def extract(name):
    im=Image.open(root/f'{name}.png').convert('RGBA')
    gray=ImageOps.grayscale(im.convert('RGB'))
    alpha=gray.point(lambda lum: 0 if lum < 34 else max(0,min(205,int((lum-18)*2.75))))
    im.putalpha(alpha)
    return im.filter(ImageFilter.GaussianBlur(radius=.12))

assets={n:extract(n) for n in ['organization','customer','operations','finance','supply','employee']}

def fitted(im,w,h,opacity=1.0,angle=0):
    c=im.copy(); c.thumbnail((w,h),Image.Resampling.LANCZOS)
    if opacity < 1:
        c.putalpha(c.getchannel('A').point(lambda p:int(p*opacity)))
    if angle:
        c=c.rotate(angle,Image.Resampling.BICUBIC,expand=True)
    return c

def make(scene,layers,headline,subtitle=''):
    canvas=Image.new('RGBA',(W,H),(0,0,0,0))
    d=ImageDraw.Draw(canvas,'RGBA')
    d.ellipse((1080,150,1820,910),outline=(214,166,106,34),width=2)
    d.ellipse((1190,260,1710,800),outline=(255,255,255,18),width=1)
    d.line((1040,540,1790,540),fill=(214,166,106,46),width=1)
    positions=[(1035,180,700,330,-2),(1210,435,610,300,1),(945,650,670,300,-1),(1430,175,390,230,2),(1450,675,370,220,-2)]
    for i,name in enumerate(layers):
        x,y,w,h,a=positions[i]
        frag=fitted(assets[name],w,h,.90 if i==0 else .62,a)
        canvas.alpha_composite(frag,(x,y))
    d.text((1110,925),headline,font=ImageFont.truetype(bold,27),fill=(242,239,232,205))
    if subtitle:
        d.text((1110,968),subtitle,font=ImageFont.truetype(font,18),fill=(235,231,220,148))
    canvas.save(out/f'scene-{scene:02d}.png')

make(9,['organization','customer','operations','finance'],'THE BUSINESS UNDERSTANDS ITSELF','Customers - Operations - Finance - Shared context')
make(11,['organization'],'ONE SHARED OPERATING CONTEXT','Avantiqo Intelligence at the center')
make(12,['finance','operations','customer','organization'],'FINANCE - OPERATIONS - CUSTOMERS - INTELLIGENCE','Information, decisions and execution connected')
make(13,['organization','finance','customer','operations'],'INFORMATION > DECISION > EXECUTION','One governed operating flow')
make(14,['organization','employee','customer','supply'],'THE ORGANIZATION IS THE CONTEXT','People - Entities - Permissions - Customers - Suppliers - History')
make(15,['organization','operations','finance','supply','customer'],'ONE SHARED SYSTEM','Separate workspaces, one operating context')
make(16,['organization'],'SOFTWARE CAN ACT WITH CONTEXT','Intelligence moves from answer to execution')
make(17,['customer'],'EVERY INTERACTION > ONE BUSINESS CONTEXT','WhatsApp - LINE - Messenger - Facebook - Instagram - Reviews - Email - Web')
PY

upload_scene(){
  local n=$1
  local file=$2
  local output="33336a72-acb5-474e-856b-8be0269360e2/37ca49f2-210d-4665-af6b-6b5fa834f750/scene-previews-20260823/review-scenes-1-17/scene-${n}.mp4"
  curl -fsSL -X POST \
    -H "Authorization: Bearer ${OIDC_TOKEN}" \
    -H "Content-Type: video/mp4" \
    -H "X-Output-Path: ${output}" \
    --data-binary @"$file" \
    "$BRIDGE" | tee -a "$O/links.jsonl"
  echo "uploaded scene ${n}"
}

render_voice(){
  local src=$1 out=$2 dur=$3 start=$4 ss=${5:-0}
  ffmpeg -y -stream_loop -1 -ss "$ss" -i "$src" -i "$A/voice.mp3" -i "$A/score.mp3" -t "$dur" \
    -filter_complex "[0:v]scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,fps=24,eq=contrast=1.03:saturation=.92[v];[1:a]atrim=start=$start:duration=$dur,asetpts=PTS-STARTPTS,volume=1.03[voice];[2:a]atrim=start=$start:duration=$dur,asetpts=PTS-STARTPTS,volume=.10[score];[voice][score]amix=inputs=2:duration=first:normalize=0,alimiter=limit=.95[a]" \
    -map '[v]' -map '[a]' -c:v libx264 -preset fast -crf 17 -pix_fmt yuv420p -r 24 -c:a aac -b:a 256k -movflags +faststart "$out" >/dev/null 2>&1
}

render_overlay(){
  local scene=$1 src=$2 out=$3 dur=$4 start=$5 ss=${6:-0}
  ffmpeg -y -stream_loop -1 -ss "$ss" -i "$src" -loop 1 -framerate 24 -i "$F/scene-${scene}.png" -i "$A/voice.mp3" -i "$A/score.mp3" -t "$dur" \
    -filter_complex "[0:v]scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,fps=24,eq=contrast=1.04:brightness=-.018:saturation=.84[bg];[1:v]format=rgba[fg];[bg][fg]overlay=0:0:shortest=1[v];[2:a]atrim=start=$start:duration=$dur,asetpts=PTS-STARTPTS,volume=1.03[voice];[3:a]atrim=start=$start:duration=$dur,asetpts=PTS-STARTPTS,volume=.10[score];[voice][score]amix=inputs=2:duration=first:normalize=0,alimiter=limit=.95[a]" \
    -map '[v]' -map '[a]' -c:v libx264 -preset fast -crf 17 -pix_fmt yuv420p -r 24 -c:a aac -b:a 256k -movflags +faststart "$out" >/dev/null 2>&1
}

: > "$O/links.jsonl"
render_overlay 09 "$A/manager.mp4" "$O/scene-09.mp4" 7.172 30.375 2.4
upload_scene 09 "$O/scene-09.mp4"
render_voice "$A/founder-built.mp4" "$O/scene-10.mp4" 2.531 37.547 0
upload_scene 10 "$O/scene-10.mp4"
render_overlay 11 "$A/manager.mp4" "$O/scene-11.mp4" 7.594 40.078 2.4
upload_scene 11 "$O/scene-11.mp4"
render_overlay 12 "$A/manager.mp4" "$O/scene-12.mp4" 7.172 47.672 2.4
upload_scene 12 "$O/scene-12.mp4"
render_overlay 13 "$A/manager.mp4" "$O/scene-13.mp4" 7.172 54.844 2.4
upload_scene 13 "$O/scene-13.mp4"
render_overlay 14 "$A/manager.mp4" "$O/scene-14.mp4" 5.484 62.016 2.4
upload_scene 14 "$O/scene-14.mp4"
render_overlay 15 "$A/manager.mp4" "$O/scene-15.mp4" 5.484 67.5 2.4
upload_scene 15 "$O/scene-15.mp4"
render_overlay 16 "$A/manager16.mp4" "$O/scene-16.mp4" 2.954 72.984 0
upload_scene 16 "$O/scene-16.mp4"
render_overlay 17 "$A/manager.mp4" "$O/scene-17.mp4" 5.625 75.938 2.4
upload_scene 17 "$O/scene-17.mp4"

for f in "$O"/scene-{09..17}.mp4; do
  ffprobe -v error -show_entries format=filename,duration,size -of csv=p=0 "$f"
done | tee "$O/ffprobe-09-17.txt"

echo REVIEW_SCENES_09_17_COMPLETE
