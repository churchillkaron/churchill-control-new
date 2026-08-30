#!/usr/bin/env python3
import json
import os
import time
from pathlib import Path

import cv2
import numpy as np
import torch

from flashdreams.infra.config import derive_config
from flashvsr.config import build_flashvsr_v1_1

CONTRACT = "AVANTIQO_VIDEO_FLASHDREAMS_FLASHVSR_GPU_MASTER_V1"
COMPUTE_BOUNDARY = "AVANTIQO_STUDIO_FIRST_COMPUTE_BOUNDARY_V1"
FLASHDREAMS_COMMIT = "289da6f1d232de5abaa30d686c977b9c0040fe76"
MODEL_NAME = "JunhaoZhuang/FlashVSR-v1.1"
MODEL_REVISION = "a258bf2d58ac5a7d7193fb6ce4326aaff98ea6cb"
SPARSE_RATIO = 1.5
CHUNK_SIZE = 8
SCALE = 2

WEIGHTS_ROOT = Path(os.environ.get("AVANTIQO_FLASHVSR_WEIGHTS_ROOT", "/runpod-volume/flashvsr/FlashVSR-v1.1"))
PROMPT_PATH = Path(os.environ.get("AVANTIQO_FLASHVSR_PROMPT_PATH", "/opt/avantiqo-flashvsr/posi_prompt.pth"))


def required(name):
    value = str(os.environ.get(name, "")).strip()
    if not value:
        raise RuntimeError(f"{name}_REQUIRED")
    return value


def load_job():
    job = json.loads(required("AVANTIQO_VIDEO_FLASHVSR_JOB_JSON"))
    if job.get("contract") != CONTRACT:
        raise RuntimeError("AVANTIQO_VIDEO_FLASHDREAMS_JOB_CONTRACT_INVALID")
    return job


def write_receipt(path, receipt, *, status, success=False, **extra):
    receipt.update(extra)
    receipt["status"] = status
    receipt["success"] = bool(success)
    receipt["updated_at_unix"] = round(time.time(), 3)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(receipt, separators=(",", ":")), encoding="utf-8")


def mastering_surface(job):
    width = int(job["width"])
    height = int(job["height"])
    if width <= 0 or height <= 0 or width % 128 or height % 128:
        raise RuntimeError("AVANTIQO_VIDEO_FLASHDREAMS_TARGET_DIMENSIONS_INVALID")
    if width % SCALE or height % SCALE:
        raise RuntimeError("AVANTIQO_VIDEO_FLASHDREAMS_TARGET_SCALE_INVALID")
    return width, height, width // SCALE, height // SCALE


def require_assets():
    paths = {
        "dit": WEIGHTS_ROOT / "diffusion_pytorch_model_streaming_dmd.safetensors",
        "encoder": WEIGHTS_ROOT / "LQ_proj_in.ckpt",
        "decoder": WEIGHTS_ROOT / "TCDecoder.ckpt",
        "prompt": PROMPT_PATH,
    }
    missing = [str(path) for path in paths.values() if not path.is_file() or path.stat().st_size <= 0]
    if missing:
        raise RuntimeError("AVANTIQO_VIDEO_FLASHDREAMS_REQUIRED_ASSET_MISSING")
    return paths


def build_pipeline(work_width, work_height, paths):
    base = build_flashvsr_v1_1(
        input_H=work_height,
        input_W=work_width,
        scale=SCALE,
        sparse_ratio=SPARSE_RATIO,
        kv_ratio=3,
        local_range=11,
        compile_network=True,
        use_cuda_graph=True,
        color_corrector_implementation="cuda",
        enable_sync_and_profile=False,
        dtype=torch.bfloat16,
        seed=0,
        name="avantiqo-flashvsr-v1.1-sparse-1.5",
        attention_mode="sparse",
    )
    configured = derive_config(
        base,
        prompt_path=str(paths["prompt"]),
        encoder={"projector_checkpoint_path": str(paths["encoder"])},
        decoder={"tcdecoder_checkpoint_path": str(paths["decoder"])},
        diffusion_model={
            "transformer": {"checkpoint_path": str(paths["dit"])},
        },
    )
    pipeline = configured.setup().to("cuda")
    return pipeline


def cover_resize_rgb(frame_bgr, target_width, target_height):
    source_height, source_width = frame_bgr.shape[:2]
    if source_width <= 0 or source_height <= 0:
        raise RuntimeError("AVANTIQO_VIDEO_FLASHDREAMS_SOURCE_DIMENSIONS_INVALID")
    factor = max(target_width / source_width, target_height / source_height)
    scaled_width = max(target_width, int(np.ceil((source_width * factor) / 2.0) * 2))
    scaled_height = max(target_height, int(np.ceil((source_height * factor) / 2.0) * 2))
    if scaled_width != source_width or scaled_height != source_height:
        interpolation = cv2.INTER_AREA if factor < 1.0 else cv2.INTER_CUBIC
        frame_bgr = cv2.resize(frame_bgr, (scaled_width, scaled_height), interpolation=interpolation)
    left = max(0, (scaled_width - target_width) // 2)
    top = max(0, (scaled_height - target_height) // 2)
    frame_bgr = frame_bgr[top:top + target_height, left:left + target_width]
    if frame_bgr.shape[1] != target_width or frame_bgr.shape[0] != target_height:
        raise RuntimeError("AVANTIQO_VIDEO_FLASHDREAMS_DECODE_CROP_INVALID")
    return cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)


def tensor_from_frames(frames):
    stacked = np.stack(frames, axis=0)
    tensor = torch.from_numpy(stacked).permute(3, 0, 1, 2).unsqueeze(0)
    return tensor.to(device="cuda", dtype=torch.bfloat16).div_(127.5).sub_(1.0)


def write_output_chunk(handle, output, visible_frames, expected_width, expected_height):
    if output.ndim != 5 or output.shape[0] != 1 or output.shape[1] != 3:
        raise RuntimeError("AVANTIQO_VIDEO_FLASHDREAMS_OUTPUT_SHAPE_INVALID")
    if int(output.shape[3]) != expected_height or int(output.shape[4]) != expected_width:
        raise RuntimeError(
            f"AVANTIQO_VIDEO_FLASHDREAMS_OUTPUT_DIMENSIONS_INVALID:{int(output.shape[4])}x{int(output.shape[3])}"
        )
    frames = output[0, :, :visible_frames].permute(1, 2, 3, 0)
    frames = ((frames.float() + 1.0) * 127.5).clamp(0, 255).to(torch.uint8).cpu().numpy()
    handle.write(frames.tobytes(order="C"))
    return int(frames.shape[0]), int(frames.nbytes)


def main():
    job = load_job()
    started = time.time()
    input_path = Path(job["input_path"])
    output_path = Path(job["output_path"])
    receipt_path = Path(job["receipt_path"])
    source_frames_expected = int(job["source_frame_count"])
    if source_frames_expected <= 0:
        raise RuntimeError("AVANTIQO_VIDEO_FLASHDREAMS_SOURCE_FRAME_COUNT_INVALID")
    if not input_path.is_file() or input_path.stat().st_size <= 0:
        raise RuntimeError("AVANTIQO_VIDEO_FLASHDREAMS_INPUT_MP4_REQUIRED")

    target_width, target_height, work_width, work_height = mastering_surface(job)
    receipt = {
        "success": False,
        "contract": CONTRACT,
        "compute_boundary_contract": COMPUTE_BOUNDARY,
        "flashdreams_commit": FLASHDREAMS_COMMIT,
        "model": MODEL_NAME,
        "model_revision": MODEL_REVISION,
        "sparse_ratio": SPARSE_RATIO,
        "chunk_size": CHUNK_SIZE,
        "scale": SCALE,
        "compile_network": True,
        "cuda_graph": True,
        "input_format": "video/mp4",
        "worker_input_decode": True,
        "video_encoded_on_paid_worker": False,
        "final_artifact_persisted_on_paid_worker": False,
        "ffmpeg_used_on_paid_worker": False,
        "fal_contacted": False,
        "paid_worker_intermediate_egress_only": True,
        "target_width": target_width,
        "target_height": target_height,
        "working_width": work_width,
        "working_height": work_height,
        "source_frame_count": source_frames_expected,
    }

    cap = None
    try:
        write_receipt(receipt_path, receipt, status="VALIDATING_ASSETS")
        assets = require_assets()
        write_receipt(receipt_path, receipt, status="INITIALIZING_PIPELINE")
        pipeline_started = time.time()
        pipeline = build_pipeline(work_width, work_height, assets)
        cache = pipeline.initialize_cache()
        receipt["pipeline_setup_seconds"] = round(time.time() - pipeline_started, 3)
        receipt["gpu_name"] = torch.cuda.get_device_name(0)
        write_receipt(receipt_path, receipt, status="DECODING_AND_INFERENCE")

        cap = cv2.VideoCapture(str(input_path))
        if not cap.isOpened():
            raise RuntimeError("AVANTIQO_VIDEO_FLASHDREAMS_INPUT_MP4_OPEN_FAILED")
        source_width = int(round(cap.get(cv2.CAP_PROP_FRAME_WIDTH)))
        source_height = int(round(cap.get(cv2.CAP_PROP_FRAME_HEIGHT)))
        receipt["input_width"] = source_width
        receipt["input_height"] = source_height

        output_path.parent.mkdir(parents=True, exist_ok=True)
        frames_read = 0
        frames_written = 0
        output_bytes = 0
        chunk_index = 0
        pending = []
        first_chunk = True
        inference_started = time.time()

        with open(output_path, "wb", buffering=8 * 1024 * 1024) as handle:
            while frames_read < source_frames_expected:
                ok, frame = cap.read()
                if not ok:
                    break
                pending.append(cover_resize_rgb(frame, work_width, work_height))
                frames_read += 1
                required_count = 5 if first_chunk else CHUNK_SIZE
                if len(pending) < required_count:
                    continue

                visible = required_count
                clip = tensor_from_frames(pending[:required_count])
                output = pipeline.generate(chunk_index, cache, clip)
                pipeline.finalize(chunk_index, cache)
                written, byte_count = write_output_chunk(handle, output, visible, target_width, target_height)
                frames_written += written
                output_bytes += byte_count
                pending = pending[required_count:]
                first_chunk = False
                chunk_index += 1
                write_receipt(
                    receipt_path,
                    receipt,
                    status="DECODING_AND_INFERENCE",
                    chunks_completed=chunk_index,
                    frames_read=frames_read,
                    frames_written=frames_written,
                    inference_elapsed_seconds=round(time.time() - inference_started, 3),
                )

            if frames_read != source_frames_expected:
                raise RuntimeError(
                    f"AVANTIQO_VIDEO_FLASHDREAMS_DECODE_FRAME_COUNT_INVALID:{frames_read}:{source_frames_expected}"
                )

            if pending:
                required_count = 5 if first_chunk else CHUNK_SIZE
                visible = len(pending)
                while len(pending) < required_count:
                    pending.append(pending[-1].copy())
                clip = tensor_from_frames(pending)
                output = pipeline.generate(chunk_index, cache, clip)
                pipeline.finalize(chunk_index, cache)
                written, byte_count = write_output_chunk(handle, output, visible, target_width, target_height)
                frames_written += written
                output_bytes += byte_count
                chunk_index += 1

        if frames_written != source_frames_expected:
            raise RuntimeError(
                f"AVANTIQO_VIDEO_FLASHDREAMS_OUTPUT_FRAME_COUNT_INVALID:{frames_written}:{source_frames_expected}"
            )
        if not output_path.is_file() or output_path.stat().st_size != output_bytes or output_bytes <= 0:
            raise RuntimeError("AVANTIQO_VIDEO_FLASHDREAMS_OUTPUT_BYTES_INVALID")

        write_receipt(
            receipt_path,
            receipt,
            status="completed",
            success=True,
            chunks_completed=chunk_index,
            frames_read=frames_read,
            output_frame_count=frames_written,
            output_width=target_width,
            output_height=target_height,
            output_bytes=output_bytes,
            inference_elapsed_seconds=round(time.time() - inference_started, 3),
            elapsed_seconds=round(time.time() - started, 3),
        )
        print("AVANTIQO_VIDEO_FLASHDREAMS_FLASHVSR_RECEIPT_WRITTEN=true", flush=True)
    except Exception as exc:
        write_receipt(
            receipt_path,
            receipt,
            status="failed",
            error_code=str(exc).split(":", 1)[0][:180],
            elapsed_seconds=round(time.time() - started, 3),
        )
        print("AVANTIQO_VIDEO_FLASHDREAMS_FLASHVSR_RECEIPT_WRITTEN=true", flush=True)
        raise
    finally:
        if cap is not None:
            cap.release()
        torch.cuda.empty_cache()


if __name__ == "__main__":
    main()
