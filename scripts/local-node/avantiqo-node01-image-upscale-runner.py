from __future__ import annotations
import argparse, json, os, tempfile, time
from pathlib import Path
import requests, torch
from PIL import Image
from transformers import pipeline

MODEL = "caidas/swin2SR-realworld-sr-x4-64-bsrgan-psnr"
MAX_SOURCE_PIXELS = 4_194_304
MAX_OUTPUT_PIXELS = 33_554_432
os.environ.setdefault("HF_HOME", r"C:\Avantiqo\hf-cache")

def text(v): return str(v or "").strip()

def download(url: str, target: Path):
    if not url.startswith(("http://", "https://")): raise ValueError("AVANTIQO_LOCAL_IMAGE_UPSCALE_SOURCE_URL_INVALID")
    with requests.get(url, stream=True, timeout=120) as r:
        r.raise_for_status()
        with target.open("wb") as f:
            for chunk in r.iter_content(1024 * 1024):
                if chunk: f.write(chunk)

def upload(url: str, target: Path):
    if not url.startswith(("http://", "https://")): raise ValueError("AVANTIQO_LOCAL_IMAGE_UPSCALE_UPLOAD_URL_INVALID")
    with target.open("rb") as f:
        r = requests.put(url, data=f, headers={"Content-Type": "image/png"}, timeout=180)
    r.raise_for_status()

def main():
    ap=argparse.ArgumentParser(); ap.add_argument("--input", required=True); args=ap.parse_args()
    data=json.loads(Path(args.input).read_text(encoding="utf-8")); source_url=text(data.get("source_url")); storage=data.get("storage_upload") or {}
    if not torch.cuda.is_available(): raise RuntimeError("AVANTIQO_LOCAL_IMAGE_UPSCALE_CUDA_REQUIRED")
    with tempfile.TemporaryDirectory(prefix="avantiqo-image-upscale-") as d:
        root=Path(d); src=root/"source"; out=root/"upscaled.png"; download(source_url, src)
        source=Image.open(src).convert("RGB"); sw,sh=source.size; source_pixels=sw*sh
        if source_pixels > MAX_SOURCE_PIXELS: raise ValueError(f"AVANTIQO_IMAGE_UPSCALE_SOURCE_TOO_LARGE:{sw}x{sh}")
        if source_pixels * 16 > MAX_OUTPUT_PIXELS: raise ValueError("AVANTIQO_IMAGE_UPSCALE_OUTPUT_PIXEL_BUDGET_EXCEEDED")
        started=time.perf_counter(); upscaler=pipeline("image-to-image", model=MODEL, device=0); load_seconds=time.perf_counter()-started
        tile_size = max(64, min(256, int(os.getenv("AVANTIQO_IMAGE_UPSCALE_TILE_SIZE", "192"))))
        overlap = max(8, min(32, int(os.getenv("AVANTIQO_IMAGE_UPSCALE_TILE_OVERLAP", "16"))))
        scale = 4
        canvas = Image.new("RGB", (sw * scale, sh * scale))
        torch.cuda.reset_peak_memory_stats(); started=time.perf_counter(); tile_count=0
        step = max(32, tile_size - overlap)
        for top in range(0, sh, step):
            for left in range(0, sw, step):
                right=min(sw,left+tile_size); bottom=min(sh,top+tile_size)
                tile=source.crop((left,top,right,bottom))
                result=upscaler(tile)
                if isinstance(result, dict): result=result.get("image") or result.get("images") or result.get("output")
                if isinstance(result, list): result=result[0] if result else None
                if not isinstance(result, Image.Image): raise RuntimeError("AVANTIQO_IMAGE_UPSCALE_OUTPUT_INVALID")
                result=result.convert("RGB")
                expected=(tile.width*scale,tile.height*scale)
                if result.size != expected: result=result.resize(expected, Image.Resampling.LANCZOS)
                crop_left = 0 if left == 0 else overlap//2*scale
                crop_top = 0 if top == 0 else overlap//2*scale
                crop_right = result.width if right == sw else result.width-overlap//2*scale
                crop_bottom = result.height if bottom == sh else result.height-overlap//2*scale
                piece=result.crop((crop_left,crop_top,crop_right,crop_bottom))
                dest_x=left*scale+crop_left; dest_y=top*scale+crop_top
                canvas.paste(piece,(dest_x,dest_y)); tile_count += 1
                del result, tile, piece
                torch.cuda.empty_cache()
        inference_seconds=time.perf_counter()-started
        image=canvas; w,h=image.size; output_pixels=w*h
        if w < sw*2 or h < sh*2: raise RuntimeError("AVANTIQO_IMAGE_UPSCALE_FACTOR_INVALID")
        if output_pixels > MAX_OUTPUT_PIXELS: raise RuntimeError("AVANTIQO_IMAGE_UPSCALE_OUTPUT_TOO_LARGE")
        image.save(out, format="PNG"); upload(text(storage.get("signed_url")), out)
        print(json.dumps({"status":"completed","provider":"avantiqo-image","model":"avantiqo-image-v1","capability":"ai.image.upscale","foundation_model":MODEL,"runtime_model":MODEL,"storage_reference":text(storage.get("storage_reference")),"source_width":sw,"source_height":sh,"width":w,"height":h,"scale_x":round(w/sw,4),"scale_y":round(h/sh,4),"size_bytes":out.stat().st_size,"super_resolution":True,"resource_budget_contract":"AVANTIQO_IMAGE_UPSCALE_RESOURCE_BUDGET_V1","source_pixels":source_pixels,"output_pixels":output_pixels,"max_source_pixels":MAX_SOURCE_PIXELS,"max_output_pixels":MAX_OUTPUT_PIXELS,"execution_resource":"LOCAL_GPU","infrastructure_provider":"AVANTIQO_LOCAL_NODE_V1","model_load_seconds":round(load_seconds,3),"inference_seconds":round(inference_seconds,3),"gpu_peak_allocated_bytes":int(torch.cuda.max_memory_allocated()),"tile_size":tile_size,"tile_overlap":overlap,"tile_count":tile_count,"tiled_inference":True,"raw_reasoning_persisted":False}, separators=(",",":")))
if __name__ == "__main__": main()
