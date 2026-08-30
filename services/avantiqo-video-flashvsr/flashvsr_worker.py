#!/usr/bin/env python3
import json
import os
import time
from pathlib import Path

import cv2
import numpy as np
import torch
import torch.nn.functional as F
from einops import rearrange

from diffsynth import ModelManager, FlashVSRTinyLongPipeline
from utils.utils import Causal_LQ4x_Proj
from utils.TCDecoder import build_tcdecoder

CONTRACT = "AVANTIQO_VIDEO_FLASHVSR_GPU_MASTER_V1"
COMPUTE_BOUNDARY = "AVANTIQO_STUDIO_FIRST_COMPUTE_BOUNDARY_V1"
MODEL_NAME = "JunhaoZhuang/FlashVSR-v1.1"
MODEL_REVISION = "a258bf2d58ac5a7d7193fb6ce4326aaff98ea6cb"
WEIGHTS_ROOT = Path(os.environ.get("AVANTIQO_FLASHVSR_WEIGHTS_ROOT", "/runpod-volume/flashvsr/FlashVSR-v1.1"))


def required(name):
    value = str(os.environ.get(name, "")).strip()
    if not value:
        raise RuntimeError(f"{name}_REQUIRED")
    return value


def load_job():
    raw = required("AVANTIQO_VIDEO_FLASHVSR_JOB_JSON")
    job = json.loads(raw)
    if job.get("contract") != CONTRACT:
        raise RuntimeError("AVANTIQO_VIDEO_FLASHVSR_JOB_CONTRACT_INVALID")
    return job


def init_pipeline():
    required_files = [
        WEIGHTS_ROOT / "diffusion_pytorch_model_streaming_dmd.safetensors",
        WEIGHTS_ROOT / "LQ_proj_in.ckpt",
        WEIGHTS_ROOT / "TCDecoder.ckpt",
    ]
    missing = [str(path) for path in required_files if not path.is_file()]
    if missing:
        raise RuntimeError("AVANTIQO_VIDEO_FLASHVSR_WEIGHTS_NOT_PRELOADED")

    mm = ModelManager(torch_dtype=torch.bfloat16, device="cpu")
    mm.load_models([str(required_files[0])])
    pipe = FlashVSRTinyLongPipeline.from_model_manager(mm, device="cuda")
    pipe.denoising_model().LQ_proj_in = Causal_LQ4x_Proj(in_dim=3, out_dim=1536, layer_num=1).to("cuda", dtype=torch.bfloat16)
    pipe.denoising_model().LQ_proj_in.load_state_dict(torch.load(str(required_files[1]), map_location="cpu"), strict=True)
    pipe.denoising_model().LQ_proj_in.to("cuda")
    pipe.TCDecoder = build_tcdecoder(new_channels=[512, 256, 128, 128], new_latent_channels=16 + 768)
    pipe.TCDecoder.load_state_dict(torch.load(str(required_files[2]), map_location="cpu"), strict=False)
    pipe.to("cuda")
    pipe.enable_vram_management(num_persistent_param_in_dit=None)
    pipe.init_cross_kv()
    pipe.load_models_to_device(["dit", "vae"])
    return pipe


def read_input(job):
    input_path = Path(job["input_path"])
    target_width = int(job["width"])
    target_height = int(job["height"])
    source_frames_expected = int(job["source_frame_count"])
    padded_frames = int(job["padded_frame_count"])
    if target_width < 128 or target_height < 128 or target_width % 128 or target_height % 128:
        raise RuntimeError("AVANTIQO_VIDEO_FLASHVSR_INPUT_DIMENSIONS_INVALID")
    if padded_frames < 9 or (padded_frames - 1) % 8:
        raise RuntimeError("AVANTIQO_VIDEO_FLASHVSR_FRAME_WINDOW_INVALID")
    if not input_path.is_file() or input_path.stat().st_size <= 0:
        raise RuntimeError("AVANTIQO_VIDEO_FLASHVSR_INPUT_MP4_REQUIRED")

    cap = cv2.VideoCapture(str(input_path))
    if not cap.isOpened():
        raise RuntimeError("AVANTIQO_VIDEO_FLASHVSR_INPUT_MP4_OPEN_FAILED")
    source_width = int(round(cap.get(cv2.CAP_PROP_FRAME_WIDTH)))
    source_height = int(round(cap.get(cv2.CAP_PROP_FRAME_HEIGHT)))
    if source_width <= 0 or source_height <= 0:
        cap.release()
        raise RuntimeError("AVANTIQO_VIDEO_FLASHVSR_SOURCE_DIMENSIONS_INVALID")

    factor = max(target_width / source_width, target_height / source_height)
    scaled_width = max(target_width, int(np.ceil((source_width * factor) / 2.0) * 2))
    scaled_height = max(target_height, int(np.ceil((source_height * factor) / 2.0) * 2))
    scratch = Path(f"/tmp/avantiqo-video-flashvsr-{os.getpid()}.rgb")
    mapped = np.memmap(scratch, mode="w+", dtype=np.uint8, shape=(padded_frames, target_height, target_width, 3))
    count = 0
    try:
        while count < source_frames_expected:
            ok, frame = cap.read()
            if not ok:
                break
            frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            if scaled_width != source_width or scaled_height != source_height:
                frame = cv2.resize(frame, (scaled_width, scaled_height), interpolation=cv2.INTER_CUBIC)
            left = max(0, (scaled_width - target_width) // 2)
            top = max(0, (scaled_height - target_height) // 2)
            frame = frame[top:top + target_height, left:left + target_width]
            if frame.shape[1] != target_width or frame.shape[0] != target_height:
                raise RuntimeError("AVANTIQO_VIDEO_FLASHVSR_DECODE_CROP_INVALID")
            mapped[count] = frame
            count += 1
        if count != source_frames_expected:
            raise RuntimeError(f"AVANTIQO_VIDEO_FLASHVSR_DECODE_FRAME_COUNT_INVALID:{count}:{source_frames_expected}")
        for index in range(count, padded_frames):
            mapped[index] = mapped[count - 1]
        mapped.flush()
        tensor = torch.from_numpy(mapped).permute(3, 0, 1, 2).unsqueeze(0)
        tensor = tensor.to(dtype=torch.bfloat16, device="cpu").div_(127.5).sub_(1.0)
    finally:
        cap.release()
        del mapped
        try:
            scratch.unlink()
        except FileNotFoundError:
            pass
    return tensor, target_width, target_height, padded_frames, source_width, source_height

def mastering_surface(width, height):
    if width == height:
        return 2176, 2176
    if width > height:
        return 3968, 2176
    return 2176, 3968


def resize_for_mastering(tensor, width, height):
    target_width, target_height = mastering_surface(width, height)
    if target_width > width or target_height > height:
        raise RuntimeError(
            f"AVANTIQO_VIDEO_FLASHVSR_MASTERING_SURFACE_EXCEEDS_INPUT:{width}x{height}:{target_width}x{target_height}"
        )
    if target_width == width and target_height == height:
        return tensor, width, height
    frames = tensor.shape[2]
    spatial = tensor.squeeze(0).permute(1, 0, 2, 3).float()
    spatial = F.interpolate(
        spatial,
        size=(target_height, target_width),
        mode="bicubic",
        align_corners=False,
        antialias=True,
    )
    spatial = spatial.to(dtype=torch.bfloat16).permute(1, 0, 2, 3).unsqueeze(0)
    if spatial.shape[2] != frames:
        raise RuntimeError("AVANTIQO_VIDEO_FLASHVSR_FRAME_COUNT_CHANGED_DURING_RESIZE")
    return spatial, target_width, target_height


def write_output(video, output_path):
    if video.ndim != 4:
        raise RuntimeError(f"AVANTIQO_VIDEO_FLASHVSR_OUTPUT_RANK_INVALID:{video.ndim}")
    frames = rearrange(video, "C T H W -> T H W C")
    frames = ((frames.float() + 1.0) * 127.5).clamp(0, 255).to(torch.uint8).cpu().numpy()
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "wb", buffering=8 * 1024 * 1024) as handle:
        handle.write(frames.tobytes(order="C"))
    return int(frames.shape[0]), int(frames.shape[2]), int(frames.shape[1]), int(frames.nbytes)


def main():
    job = load_job()
    started = time.time()
    output_path = Path(job["output_path"])
    receipt_path = Path(job["receipt_path"])
    receipt_path.parent.mkdir(parents=True, exist_ok=True)
    receipt = {
        "success": False,
        "contract": CONTRACT,
        "compute_boundary_contract": COMPUTE_BOUNDARY,
        "model": MODEL_NAME,
        "model_revision": MODEL_REVISION,
        "video_encoded_on_paid_worker": False,
        "final_artifact_persisted_on_paid_worker": False,
        "ffmpeg_used_on_paid_worker": False,
        "fal_contacted": False,
        "paid_worker_intermediate_egress_only": True,
    }
    try:
        lq, width, height, frames, source_width, source_height = read_input(job)
        pipe = init_pipeline()
        torch.cuda.empty_cache()
        video = pipe(
            prompt="",
            negative_prompt="",
            cfg_scale=1.0,
            num_inference_steps=1,
            seed=int(job.get("seed", 0)),
            LQ_video=lq,
            num_frames=frames,
            height=height,
            width=width,
            is_full_block=False,
            if_buffer=True,
            topk_ratio=1.5 * 768 * 1280 / (height * width),
            kv_ratio=3.0,
            local_range=11,
            color_fix=True,
        )
        output_frames, output_width, output_height, output_bytes = write_output(video, output_path)
        receipt.update({
            "success": True,
            "status": "completed",
            "output_path": str(output_path),
            "output_frame_count": output_frames,
            "output_width": output_width,
            "output_height": output_height,
            "output_bytes": output_bytes,
            "source_frame_count": int(job["source_frame_count"]),
            "fps": float(job["fps"]),
            "input_width": source_width,
            "input_height": source_height,
            "mastering_width": width,
            "mastering_height": height,
            "worker_input_decode": True,
            "input_format": "video/mp4",
            "topk_reference_ratio": 1.5,
            "elapsed_seconds": round(time.time() - started, 3),
        })
    except Exception as exc:
        receipt.update({
            "status": "failed",
            "error_code": str(exc).split(":", 1)[0][:180],
            "elapsed_seconds": round(time.time() - started, 3),
        })
    receipt_path.write_text(json.dumps(receipt, separators=(",", ":")), encoding="utf-8")
    print("AVANTIQO_VIDEO_FLASHVSR_RECEIPT_WRITTEN=true", flush=True)
    if not receipt["success"]:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
