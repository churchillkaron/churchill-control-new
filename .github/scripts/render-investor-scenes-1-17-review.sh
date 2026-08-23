#!/usr/bin/env bash
set -euo pipefail

A=/tmp/avq-review/assets
F=/tmp/avq-review/fragments
O=review-scenes
BRIDGE="https://vfsjqabpkcbiuerhzugk.supabase.co/functions/v1/avantiqo-investor-review-render"
mkdir -p "$A" "$F" "$O"

python3 - <<'PY' > /tmp/avq-review-sign-request.json
import json
org='33336a72-acb5-474e-856b-8be0269360e2'
project='37ca49f2-210d-4665-af6b-6b5fa834f750'
paths=[
 f'{org}/avantiqo-investor-film-20260822/google-veo-opening-v1/avantiqo-synthetic-intelligence-plus-logo-both-original-fx-v4.mp4',
 f'{org}/avantiqo-investor-film-20260820/founder-v7/founder-opening-origin-synced-approved-v7.mp4',
 f'{org}/unassigned/e1b2c387-2dda-4192-bb7a-3cea339e2293-gemini-32vbfjlubvh7.mp4',
 f'{org}/unassigned/701a4abb-3ed8-4460-99ef-d388d1ce1ffa-gemini-8yvpgxklek51.mp4',
 f'{org}/unassigned/cbba2295-76c6-43ea-acf5-1511017cc63b-gemini-v24pbxy5sy1t.mp4',
 f'{org}/{project}/scene-previews-20260822/scene-06-fragmentation-review-v9.mp4',
 f'{org}/unassigned/61b4afe1-93ae-4e1e-a92f-60dff5d629be-avantiqo-investor-manager-ee25292e-4fd3-4249-81cb-3ab526fd2048.mp4',
 f'{org}/avantiqo-investor-film-20260820/founder-v7/founder-opening-obvious-synced-approved-v7.mp4',
 f'{org}/avantiqo-investor-film-20260820/founder-v7/founder-opening-built-synced-approved-v7.mp4',
 f'{org}/unassigned/a360b2ec-ba79-4213-8732-1f3bd5b9785c-avantiqo-investor-manager-013346ff-b7a0-415d-b09d-1dba40b4be0b.mp4',
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
  --data-binary @/tmp/avq-review-sign-request.json \
  "$BRIDGE" > /tmp/avq-review-assets.json

python3 - <<'PY'
import json, pathlib, urllib.request
payload=json.loads(pathlib.Path('/tmp/avq-review-assets.json').read_text())
assert payload.get('success') is True, payload
names={
'avantiqo-synthetic-intelligence-plus-logo-both-original-fx-v4.mp4':'opening.mp4',
'founder-opening-origin-synced-approved-v7.mp4':'founder-origin.mp4',
'e1b2c387-2dda-4192-bb7a-3cea339e2293-gemini-32vbfjlubvh7.mp4':'restaurant-a.mp4',
'701a4abb-3ed8-4460-99ef-d388d1ce1ffa-gemini-8yvpgxklek51.mp4':'finance-world.mp4',
'cbba2295-76c6-43ea-acf5-1511017cc63b-gemini-v24pbxy5sy1t.mp4':'operations-world.mp4',
'scene-06-fragmentation-review-v9.mp4':'scene06-source.mp4',
'61b4afe1-93ae-4e1e-a92f-60dff5d629be-avantiqo-investor-manager-ee25292e-4fd3-4249-81cb-3ab526fd2048.mp4':'manager.mp4',
'founder-opening-obvious-synced-approved-v7.mp4':'founder-obvious.mp4',
'founder-opening-built-synced-approved-v7.mp4':'founder-built.mp4',
'a360b2ec-ba79-4213-8732-1f3bd5b9785c-avantiqo-investor-manager-013346ff-b7a0-415d-b09d-1dba40b4be0b.mp4':'manager-16.mp4',
'avantiqo-investor-narration-cedar-v5-founder-locked-229.5s.mp3':'voice.mp3',
'avantiqo-investor-score-v1-approved.mp3':'score.mp3',
'organization_intelligence.png':'organization.png',
'customer_communications.png':'customer.png',
'operations_command_center.png':'operations.png',
'finance.png':'finance.png',
'supply_chain.png':'supply.png',
'employee_directory.png':'employee.png'}
out=pathlib.Path('/tmp/avq-review/assets')
for storage_path,url in payload['assets'].items():
    filename=names[pathlib.PurePosixPath(storage_path).name]
    target=out/filename
    urllib.request.urlretrieve(url,target)
    assert target.stat().st_size>0,target
    print('downloaded',filename,target.stat().st_size)
PY

python3 - <<'PY'
from PIL import Image, ImageDraw, ImageFont, ImageFilter
from pathlib import Path
root=Path('/tmp/avq-review/assets'); out=Path('/tmp/avq-review/fragments')
W,H=1920,1080
font='/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'; bold='/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'

def extract(name):
    im=Image.open(root/f'{name}.png').convert('RGBA'); px=im.load()
    for y in range(im.height):
        for x in range(im.width):
            r,g,b,a=px[x,y]; lum=.2126*r+.7152*g+.0722*b
            alpha=max(0,min(210,int((lum-18)*2.9)))
            if lum<34: alpha=0
            px[x,y]=(r,g,b,alpha)
    im=im.filter(ImageFilter.GaussianBlur(radius=.18)); im.save(out/f'{name}-transparent.png'); return im
assets={n:extract(n) for n in ['organization','customer','operations','finance','supply','employee']}

def fitted(im,w,h,opacity=1.0,angle=0):
    copy=im.copy(); copy.thumbnail((w,h),Image.Resampling.LANCZOS)
    if opacity<1:
        copy.putalpha(copy.getchannel('A').point(lambda p:int(p*opacity)))
    if angle: copy=copy.rotate(angle,Image.Resampling.BICUBIC,expand=True)
    return copy

def make(scene,layers,headline,subtitle=''):
    canvas=Image.new('RGBA',(W,H),(0,0,0,0)); draw=ImageDraw.Draw(canvas,'RGBA')
    draw.ellipse((1070,145,1840,915),outline=(214,166,106,40),width=2)
    draw.ellipse((1180,255,1730,805),outline=(255,255,255,24),width=1)
    draw.line((1030,540,1800,540),fill=(214,166,106,55),width=1)
    positions=[(1030,170,690,330,-2),(1210,430,610,300,1),(945,650,670,300,-1),(1420,160,420,240,2),(1450,670,390,230,-2)]
    for i,name in enumerate(layers):
        x,y,w,h,ang=positions[i]; frag=fitted(assets[name],w,h,.92 if i==0 else .68,ang); canvas.alpha_composite(frag,(x,y))
    draw.text((1120,930),headline,font=ImageFont.truetype(bold,28),fill=(241,238,230,210))
    if subtitle: draw.text((1120,970),subtitle,font=ImageFont.truetype(font,18),fill=(235,231,220,160))
    canvas.save(out/f'scene-{scene:02d}-overlay.png')
make(9,['organization','customer','operations','finance'],'THE BUSINESS UNDERSTANDS ITSELF','Customers - Operations - Finance - Shared context')
make(11,['organization'],'ONE SHARED OPERATING CONTEXT','Avantiqo Intelligence at the center')
make(12,['finance','operations','customer','organization'],'FINANCE - OPERATIONS - CUSTOMERS - INTELLIGENCE','Information, decisions and execution connected')
make(13,['organization','finance','customer','operations'],'INFORMATION > DECISION > EXECUTION','One governed operating flow')
make(14,['organization','employee','customer','supply'],'THE ORGANIZATION IS THE CONTEXT','People - Entities - Permissions - Customers - Suppliers - History')
make(15,['organization','operations','finance','supply','customer'],'ONE SHARED SYSTEM','Separate workspaces, one operating context')
make(16,['organization'],'SOFTWARE CAN ACT WITH CONTEXT','Intelligence moves from answer to execution')
make(17,['customer'],'EVERY INTERACTION > ONE BUSINESS CONTEXT','WhatsApp - LINE - Messenger - Facebook - Instagram - Reviews - Email - Web')
PY

render_voice(){
 local src=$1 out=$2 dur=$3 start=$4 ss=${5:-0}
 ffmpeg -y -stream_loop -1 -ss "$ss" -i "$src" -i "$A/voice.mp3" -i "$A/score.mp3" -t "$dur" \
  -filter_complex "[0:v]scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,fps=24,eq=contrast=1.03:saturation=.92[v];[1:a]atrim=start=$start:duration=$dur,asetpts=PTS-STARTPTS,volume=1.03[voice];[2:a]atrim=start=$start:duration=$dur,asetpts=PTS-STARTPTS,volume=.10[score];[voice][score]amix=inputs=2:duration=first:normalize=0,alimiter=limit=.95[a]" \
  -map '[v]' -map '[a]' -c:v libx264 -preset fast -crf 17 -pix_fmt yuv420p -r 24 -c:a aac -b:a 256k -movflags +faststart "$out" >/dev/null 2>&1
}
render_overlay(){
 local scene=$1 src=$2 out=$3 dur=$4 start=$5 ss=${6:-0}
 ffmpeg -y -stream_loop -1 -ss "$ss" -i "$src" -loop 1 -framerate 24 -i "$F/scene-${scene}-overlay.png" -i "$A/voice.mp3" -i "$A/score.mp3" -t "$dur" \
  -filter_complex "[0:v]scale=1970:1108:force_original_aspect_ratio=increase,crop=1920:1080:x='(iw-ow)/2+3*sin(t*.18)':y='(ih-oh)/2+2*sin(t*.14)',fps=24,eq=contrast=1.04:brightness=-.018:saturation=.84[bg];[1:v]format=rgba,fade=t=in:st=.28:d=.55:alpha=1,fade=t=out:st='max(0,$dur-.42)':d=.42:alpha=1[fg];[bg][fg]overlay=0:0:shortest=1[v];[2:a]atrim=start=$start:duration=$dur,asetpts=PTS-STARTPTS,volume=1.03[voice];[3:a]atrim=start=$start:duration=$dur,asetpts=PTS-STARTPTS,volume=.10[score];[voice][score]amix=inputs=2:duration=first:normalize=0,alimiter=limit=.95[a]" \
  -map '[v]' -map '[a]' -c:v libx264 -preset fast -crf 17 -pix_fmt yuv420p -r 24 -c:a aac -b:a 256k -movflags +faststart "$out" >/dev/null 2>&1
}

ffmpeg -y -i "$A/opening.mp4" -t 15.35 -vf "scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,fps=24" -c:v libx264 -preset fast -crf 17 -c:a aac -b:a 256k -movflags +faststart "$O/scene-01.mp4" >/dev/null 2>&1
render_voice "$A/founder-origin.mp4" "$O/scene-02.mp4" 5.063 0 0
render_voice "$A/restaurant-a.mp4" "$O/scene-03.mp4" 6.328 5.063 0
render_voice "$A/finance-world.mp4" "$O/scene-04.mp4" 2.953 11.391 0
render_voice "$A/operations-world.mp4" "$O/scene-05.mp4" 1.266 14.344 0
ffmpeg -y -i "$A/scene06-source.mp4" -t 7.6 -c:v libx264 -preset fast -crf 17 -c:a aac -b:a 256k -movflags +faststart "$O/scene-06.mp4" >/dev/null 2>&1
render_voice "$A/manager.mp4" "$O/scene-07.mp4" 8.4375 19.8285 1.0
render_voice "$A/founder-obvious.mp4" "$O/scene-08.mp4" 2.109 28.266 0
render_overlay 09 "$A/manager.mp4" "$O/scene-09.mp4" 7.172 30.375 2.4
render_voice "$A/founder-built.mp4" "$O/scene-10.mp4" 2.531 37.547 0
render_overlay 11 "$A/manager.mp4" "$O/scene-11.mp4" 7.594 40.078 2.4
render_overlay 12 "$A/manager.mp4" "$O/scene-12.mp4" 7.172 47.672 2.4
render_overlay 13 "$A/manager.mp4" "$O/scene-13.mp4" 7.172 54.844 2.4
render_overlay 14 "$A/manager.mp4" "$O/scene-14.mp4" 5.484 62.016 2.4
render_overlay 15 "$A/manager.mp4" "$O/scene-15.mp4" 5.484 67.5 2.4
render_overlay 16 "$A/manager-16.mp4" "$O/scene-16.mp4" 2.954 72.984 0
render_overlay 17 "$A/manager.mp4" "$O/scene-17.mp4" 5.625 75.938 2.4

for f in "$O"/*.mp4; do ffprobe -v error -show_entries format=filename,duration,size -of csv=p=0 "$f"; done | tee "$O/ffprobe.txt"
: > "$O/links.jsonl"
for n in $(seq -w 1 17); do
 file="$O/scene-${n}.mp4"
 output="33336a72-acb5-474e-856b-8be0269360e2/37ca49f2-210d-4665-af6b-6b5fa834f750/scene-previews-20260823/review-scenes-1-17/scene-${n}.mp4"
 curl -fsSL -X POST -H "Authorization: Bearer ${OIDC_TOKEN}" -H "Content-Type: video/mp4" -H "X-Output-Path: ${output}" --data-binary @"$file" "$BRIDGE" | tee -a "$O/links.jsonl"
 echo >> "$O/links.jsonl"
done
