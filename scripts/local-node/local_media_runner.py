from __future__ import annotations
import argparse, json, math, subprocess, tempfile
from pathlib import Path
from typing import Any
import requests

CONTRACT="AVANTIQO_LOCAL_MEDIA_FFMPEG_V1"

def text(v: Any)->str: return str(v or "").strip()
def num(v: Any, d=None):
    try:
        x=float(v); return x if math.isfinite(x) else d
    except (TypeError,ValueError): return d

def run(args:list[str], code:str)->str:
    p=subprocess.run(args,stdout=subprocess.PIPE,stderr=subprocess.PIPE,check=False,text=True)
    if p.returncode!=0: raise RuntimeError(f"{code}:{p.stderr[-3000:]}")
    return p.stdout

def download(url:str,path:Path):
    if not url.startswith(("https://","http://")): raise ValueError("LOCAL_MEDIA_SOURCE_URL_INVALID")
    with requests.get(url,stream=True,timeout=300) as r:
        r.raise_for_status()
        with path.open("wb") as f:
            for chunk in r.iter_content(1024*1024):
                if chunk: f.write(chunk)

def upload(url:str,path:Path,content_type="video/mp4"):
    if not url.startswith(("https://","http://")): raise ValueError("LOCAL_MEDIA_UPLOAD_URL_INVALID")
    with path.open("rb") as f:
        r=requests.put(url,data=f,headers={"Content-Type":content_type},timeout=300)
    r.raise_for_status()

def probe(path:Path)->dict[str,Any]:
    raw=run(["ffprobe","-v","error","-show_entries","format=duration:stream=index,codec_type,codec_name,width,height,avg_frame_rate,r_frame_rate,sample_rate,channels","-of","json",str(path)],"LOCAL_MEDIA_PROBE_FAILED")
    data=json.loads(raw or "{}")
    streams=data.get("streams") if isinstance(data.get("streams"),list) else []
    video=next((x for x in streams if x.get("codec_type")=="video"),None)
    audio=next((x for x in streams if x.get("codec_type")=="audio"),None)
    if not video: raise RuntimeError("LOCAL_MEDIA_VIDEO_STREAM_REQUIRED")
    return {"width":int(video.get("width") or 0),"height":int(video.get("height") or 0),"duration_seconds":num((data.get("format") or {}).get("duration"),0),"video_codec":text(video.get("codec_name")) or None,"has_audio":bool(audio),"audio_codec":text((audio or {}).get("codec_name")) or None}

def master(source:Path,target:Path,opts:dict[str,Any])->dict[str,Any]:
    p=probe(source); res=text(opts.get("target_resolution") or "4k").lower(); long=3840 if res=="4k" else 2560 if res=="2k" else 1920; short=2160 if res=="4k" else 1440 if res=="2k" else 1080
    if p["width"]==p["height"]: w=h=short
    elif p["height"]>p["width"]: w,h=short,long
    else: w,h=long,short
    vf=f"scale={w}:{h}:flags=lanczos:force_original_aspect_ratio=decrease,pad={w}:{h}:(ow-iw)/2:(oh-ih)/2:black,setsar=1"
    run(["ffmpeg","-y","-i",str(source),"-map","0:v:0","-map","0:a?","-vf",vf,"-c:v","libx264","-preset","slow","-crf","14","-pix_fmt","yuv420p","-movflags","+faststart","-c:a","aac","-b:a","320k",str(target)],"LOCAL_MEDIA_MASTER_FAILED")
    q=probe(target)
    if q["width"]!=w or q["height"]!=h: raise RuntimeError("LOCAL_MEDIA_MASTER_DIMENSIONS_INVALID")
    return {"input_probe":p,"output_probe":q,"target_resolution":res,"target_width":w,"target_height":h}

def parse_npy(buf:bytes):
    if len(buf)<12 or buf[:6]!=b"\x93NUMPY": raise ValueError("LOCAL_MEDIA_NPY_MAGIC_INVALID")
    if buf[6]!=1 or buf[7]!=0: raise ValueError("LOCAL_MEDIA_NPY_VERSION_INVALID")
    n=int.from_bytes(buf[8:10],"little"); start=10; end=start+n; header=buf[start:end].decode("latin1")
    import re
    if "'descr': '|u1'" not in header or "'fortran_order': False" not in header: raise ValueError("LOCAL_MEDIA_NPY_FORMAT_INVALID")
    m=re.search(r"'shape':\s*\(([^)]*)\)",header)
    if not m: raise ValueError("LOCAL_MEDIA_NPY_SHAPE_REQUIRED")
    vals=[int(x.strip()) for x in m.group(1).split(",") if x.strip()]
    if len(vals)!=4 or vals[3]!=3: raise ValueError("LOCAL_MEDIA_NPY_DIMENSIONS_INVALID")
    frames,h,w,c=vals
    if len(buf)-end!=frames*h*w*c: raise ValueError("LOCAL_MEDIA_NPY_BYTES_INVALID")
    return frames,h,w,c,end

def foundation(source:Path,target:Path,opts:dict[str,Any])->dict[str,Any]:
    b=source.read_bytes(); frames,h,w,c,off=parse_npy(b); fps=max(16,min(30,round(num(opts.get("fps"),24))))
    raw=target.with_suffix(".rgb"); raw.write_bytes(b[off:])
    run(["ffmpeg","-y","-f","rawvideo","-pixel_format","rgb24","-video_size",f"{w}x{h}","-framerate",str(fps),"-i",str(raw),"-frames:v",str(frames),"-c:v","libx264","-preset","slow","-crf","14","-pix_fmt","yuv420p","-movflags","+faststart",str(target)],"LOCAL_MEDIA_FOUNDATION_FAILED")
    return {"fps":fps,"frame_count":frames,"width":w,"height":h,"duration_seconds":frames/fps}


def mime_for_extension(ext:str)->str:
    return {
        "mp4":"video/mp4","webm":"video/webm","mov":"video/quicktime",
        "wav":"audio/wav","mp3":"audio/mpeg","m4a":"audio/mp4","aac":"audio/aac","flac":"audio/flac"
    }.get(text(ext).lower(),"application/octet-stream")

def derivative(source:Path,target:Path,opts:dict[str,Any])->dict[str,Any]:
    profile=opts.get("profile") if isinstance(opts.get("profile"),dict) else {}
    if profile.get("ffmpeg_args") or profile.get("ffmpegArgs") or profile.get("args"):
        raise ValueError("LOCAL_MEDIA_CUSTOM_FFMPEG_ARGS_NOT_ALLOWED")
    kind=text(profile.get("kind") or profile.get("operation")).lower()
    args=["ffmpeg","-y","-i",str(source)]
    if "audio" in kind:
        if profile.get("audio_codec"): args += ["-c:a",text(profile.get("audio_codec"))]
        if profile.get("sample_rate"): args += ["-ar",str(int(float(profile.get("sample_rate"))))]
        if profile.get("channels"): args += ["-ac",str(int(float(profile.get("channels"))))]
        if profile.get("audio_bitrate"): args += ["-b:a",text(profile.get("audio_bitrate"))]
        args += ["-vn"]
    else:
        if profile.get("video_codec"): args += ["-c:v",text(profile.get("video_codec"))]
        if profile.get("audio_codec"): args += ["-c:a",text(profile.get("audio_codec"))]
        if profile.get("video_bitrate"): args += ["-b:v",text(profile.get("video_bitrate"))]
        if profile.get("audio_bitrate"): args += ["-b:a",text(profile.get("audio_bitrate"))]
        if profile.get("frame_rate"): args += ["-r",str(float(profile.get("frame_rate")))]
        if profile.get("scale"): args += ["-vf",f"scale={text(profile.get('scale'))}"]
        if profile.get("pixel_format"): args += ["-pix_fmt",text(profile.get("pixel_format"))]
        if profile.get("movable_metadata") is False: args += ["-map_metadata","-1"]
    args += [str(target)]
    run(args,"LOCAL_MEDIA_DERIVATIVE_FAILED")
    return {"file_size_bytes":target.stat().st_size,"derivative_kind":kind or None}

def main():
    ap=argparse.ArgumentParser(); ap.add_argument("--input",required=True); a=ap.parse_args(); data=json.loads(Path(a.input).read_text(encoding="utf-8")); op=text(data.get("operation")); source_url=text(data.get("source_url")); upl=data.get("output_upload") or {}; opts=data.get("options") if isinstance(data.get("options"),dict) else {}
    with tempfile.TemporaryDirectory(prefix="avantiqo-media-") as d:
        root=Path(d); src=root/("source.npy" if op=="raw_frames_to_mp4" else "source.bin")
        output_ext=text(opts.get("output_extension") or "mp4").lower().lstrip(".")
        out=root/f"output.{output_ext}"; download(source_url,src)
        if op=="video_master": details=master(src,out,opts)
        elif op=="raw_frames_to_mp4": details=foundation(src,out,opts)
        elif op=="media_derivative": details=derivative(src,out,opts)
        else: raise ValueError(f"LOCAL_MEDIA_OPERATION_UNSUPPORTED:{op}")
        upload(text(upl.get("signed_url")),out,mime_for_extension(output_ext))
        result={"success":True,"status":"completed","contract":CONTRACT,"operation":op,"storage_reference":text(upl.get("storage_reference")),"runtime_model":"ffmpeg-9.0.1","infrastructure_provider":"AVANTIQO_LOCAL_NODE_V1","raw_reasoning_persisted":False,**details}
        print(json.dumps(result,separators=(",",":")))
if __name__=="__main__": main()
