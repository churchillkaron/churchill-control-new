#!/usr/bin/env bash
set -euo pipefail
SRC=.github/scripts/render-investor-scenes-1-17-review-v4.sh
TMP=/tmp/render-investor-scenes-1-17-review-v5.sh
python3 - <<'PY'
from pathlib import Path
import re
src=Path('.github/scripts/render-investor-scenes-1-17-review-v4.sh').read_text()
needle="bad=\"fade=t=out:st='max(0,$dur-.42)':d=.42:alpha=1\"\n"
insert='''bad="fade=t=out:st='max(0,$dur-.42)':d=.42:alpha=1"\n'''
# Replace the generated render_overlay implementation after V4's standard substitutions.
marker="src=src.replace(bad,good,1)\n"
if marker not in src:
    raise SystemExit('V4_FADE_PATCH_MARKER_NOT_FOUND')
patch=r'''
pattern=r"render_overlay\(\)\{\n local scene=\$1 src=\$2 out=\$3 dur=\$4 start=\$5 ss=\$\{6:-0\}\n local fadeout\n fadeout=.*?\n\}\n"
simple='''render_overlay(){
 local scene=$1 src=$2 out=$3 dur=$4 start=$5 ss=${6:-0}
 ffmpeg -y -stream_loop -1 -ss "$ss" -i "$src" -loop 1 -framerate 24 -i "$F/scene-${scene}-overlay.png" -i "$A/voice.mp3" -i "$A/score.mp3" -t "$dur" \
  -filter_complex "[0:v]scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,fps=24,eq=contrast=1.04:brightness=-.018:saturation=.84[bg];[1:v]format=rgba[fg];[bg][fg]overlay=0:0:shortest=1[v];[2:a]atrim=start=$start:duration=$dur,asetpts=PTS-STARTPTS,volume=1.03[voice];[3:a]atrim=start=$start:duration=$dur,asetpts=PTS-STARTPTS,volume=.10[score];[voice][score]amix=inputs=2:duration=first:normalize=0,alimiter=limit=.95[a]" \
  -map '[v]' -map '[a]' -c:v libx264 -preset fast -crf 17 -pix_fmt yuv420p -r 24 -c:a aac -b:a 256k -movflags +faststart "$out" >/dev/null 2>&1
}
'''
src2,repl_count=re.subn(pattern,simple,src,flags=re.S)
if repl_count != 1:
    raise SystemExit(f'OVERLAY_FUNCTION_REPLACE_COUNT:{repl_count}')
src=src2
'''
src=src.replace(marker,marker+patch,1)
src=src.replace("TMP=/tmp/render-investor-scenes-1-17-review-v4.sh","TMP=/tmp/render-investor-scenes-1-17-review-v5.sh",1)
src=src.replace("Path('/tmp/render-investor-scenes-1-17-review-v4.sh').write_text(src)","Path('/tmp/render-investor-scenes-1-17-review-v5.sh').write_text(src)",1)
Path('/tmp/render-investor-scenes-1-17-review-v5-wrapper.sh').write_text(src)
PY
bash -n /tmp/render-investor-scenes-1-17-review-v5-wrapper.sh
bash /tmp/render-investor-scenes-1-17-review-v5-wrapper.sh
