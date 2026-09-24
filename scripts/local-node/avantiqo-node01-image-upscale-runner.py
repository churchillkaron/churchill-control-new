from __future__ import annotations
import argparse, json, os, tempfile, time
from pathlib import Path
import requests, torch
from PIL import Image
from transformers import pipeline

MODELS = {
    2: "caidas/swin2SR-classical-sr-x2-64",
    4: "caidas/swin2SR-realworld-sr-x4-64-bsrgan-psnr",
}
MAX_SOURCE_PIXELS = 4_194_304
MAX_OUTPUT_PIXELS = 33_554_432
os.environ.setdefault("HF_HOME", r"C:\Avantiqo\hf-cache")
os.environ.setdefault("PYTORCH_CUDA_ALLOC_CONF", "expandable_segments:True")

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
    scale=int(data.get("scale") or 4)
    if scale not in MODELS: raise ValueError("AVANTIQO_LOCAL_IMAGE_UPSCALE_SCALE_UNSUPPORTED")
    model=MODELS[scale]
    if not torch.cuda.is_available(): raise RuntimeError("AVANTIQO_LOCAL_IMAGE_UPSCALE_CUDA_REQUIRED")
    with tempfile.TemporaryDirectory(prefix="avantiqo-image-upscale-") as d:
        root=Path(d); src=root/"source"; out=root/"upscaled.png"; download(source_url, src)
        source=Image.open(src).convert("RGB"); sw,sh=source.size; source_pixels=sw*sh
        if source_pixels > MAX_SOURCE_PIXELS: raise ValueError(f"AVANTIQO_IMAGE_UPSCALE_SOURCE_TOO_LARGE:{sw}x{sh}")
        if source_pixels * (scale * scale) > MAX_OUTPUT_PIXELS: raise ValueError("AVANTIQO_IMAGE_UPSCALE_OUTPUT_PIXEL_BUDGET_EXCEEDED")
        torch.cuda.empty_cache()
        started=time.perf_counter(); upscaler=pipeline("image-to-image", model=model, device=0, torch_dtype=torch.float16); load_seconds=time.perf_counter()-started
        tile_size = max(64, min(256, int(os.getenv("AVANTIQO_IMAGE_UPSCALE_TILE_SIZE", "192"))))
        overlap = max(8, min(64, int(os.getenv("AVANTIQO_IMAGE_UPSCALE_TILE_OVERLAP", "32"))))
        torch.cuda.reset_peak_memory_stats(); started=time.perf_counter(); tile_count=0
        used_full_frame=False
        try:
            # For normal Studio stills (including 1152x648 -> 2304x1296), run the SR model
            # on the complete image. This preserves global context and avoids visible tile seams.
            if source_pixels <= 1_048_576:
                result=upscaler(source)
                if isinstance(result, dict): result=result.get("image") or result.get("images") or result.get("output")
                if isinstance(result, list): result=result[0] if result else None
                if not isinstance(result, Image.Image): raise RuntimeError("AVANTIQO_IMAGE_UPSCALE_OUTPUT_INVALID")
                image=result.convert("RGB")
                expected=(sw*scale,sh*scale)
                if image.size != expected: image=image.resize(expected, Image.Resampling.LANCZOS)
                tile_count=1
                used_full_frame=True
            else:
                raise RuntimeError("AVANTIQO_IMAGE_UPSCALE_FULL_FRAME_SKIPPED")
        except RuntimeError as exc:
            if used_full_frame:
                raise
            # Fallback for larger sources: overlap tiles and alpha-feather them together.
            import numpy as np
            acc=np.zeros((sh*scale, sw*scale, 3), dtype=np.float32)
            weight=np.zeros((sh*scale, sw*scale, 1), dtype=np.float32)
            step=max(32, tile_size-overlap)
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
                    arr=np.asarray(result, dtype=np.float32)
                    hh,ww=arr.shape[:2]
                    yy=np.ones(hh, dtype=np.float32); xx=np.ones(ww, dtype=np.float32)
                    feather=min(overlap*scale//2, hh//2, ww//2)
                    if feather>0:
                        ramp=np.linspace(0.0,1.0,feather,endpoint=False,dtype=np.float32)
                        if top>0: yy[:feather]=ramp
                        if bottom<sh: yy[-feather:]=ramp[::-1]
                        if left>0: xx[:feather]=ramp
                        if right<sw: xx[-feather:]=ramp[::-1]
                    mask=(yy[:,None]*xx[None,:])[:,:,None]
                    y0=top*scale; x0=left*scale; y1=y0+hh; x1=x0+ww
                    acc[y0:y1,x0:x1]+=arr*mask
                    weight[y0:y1,x0:x1]+=mask
                    tile_count += 1
                    del result, tile, arr, mask
                    torch.cuda.empty_cache()
            image=Image.fromarray(np.clip(acc/np.maximum(weight,1e-6),0,255).astype(np.uint8),"RGB")
        inference_seconds=time.perf_counter()-started
        w,h=image.size; output_pixels=w*h
        if w < sw*2 or h < sh*2: raise RuntimeError("AVANTIQO_IMAGE_UPSCALE_FACTOR_INVALID")
        if output_pixels > MAX_OUTPUT_PIXELS: raise RuntimeError("AVANTIQO_IMAGE_UPSCALE_OUTPUT_TOO_LARGE")
        image.save(out, format="PNG"); upload(text(storage.get("signed_url")), out)
        print(json.dumps({"status":"completed","provider":"avantiqo-image","model":"avantiqo-image-v1","capability":"ai.image.upscale","foundation_model":model,"runtime_model":model,"storage_reference":text(storage.get("storage_reference")),"source_width":sw,"source_height":sh,"width":w,"height":h,"scale_x":round(w/sw,4),"scale_y":round(h/sh,4),"size_bytes":out.stat().st_size,"super_resolution":True,"resource_budget_contract":"AVANTIQO_IMAGE_UPSCALE_RESOURCE_BUDGET_V1","source_pixels":source_pixels,"output_pixels":output_pixels,"max_source_pixels":MAX_SOURCE_PIXELS,"max_output_pixels":MAX_OUTPUT_PIXELS,"execution_resource":"LOCAL_GPU","infrastructure_provider":"AVANTIQO_LOCAL_NODE_V1","model_load_seconds":round(load_seconds,3),"inference_seconds":round(inference_seconds,3),"gpu_peak_allocated_bytes":int(torch.cuda.max_memory_allocated()),"tile_size":tile_size,"tile_overlap":overlap,"tile_count":tile_count,"full_frame_inference":used_full_frame,"tiled_inference":not used_full_frame,"raw_reasoning_persisted":False}, separators=(",",":")))
if __name__ == "__main__": main()
