"""Immediate source-free Wan 2.2 investor-film proof lane.

This lane reuses the already-certified Avantiqo Wan 2.2 cinema runtime but
captures its locally encoded MP4 into the owned Modal Volume instead of sending
it through the normal governed Supabase upload boundary. It exists only for
internal investor-film proof rendering and never changes production routing.
"""
from __future__ import annotations

import os
import shutil
import time
import uuid
from pathlib import Path
from typing import Any

from modal_app import app, model_volume, worker_image

CONTRACT = "AVANTIQO_INVESTOR_WAN22_PROOF_MODAL_V1"
FPS = 24


def _text(value: Any) -> str:
    return str(value or "").strip()


@app.function(
    image=worker_image,
    gpu="A100-80GB",
    volumes={"/models": model_volume},
    timeout=30 * 60,
    min_containers=0,
    max_containers=1,
    buffer_containers=0,
    scaledown_window=5,
    retries=0,
)
def generate_investor_wan_proof_master(
    output_relative: str,
    instruction: str,
    duration_seconds: int = 6,
    seed: int = 260905,
) -> dict[str, Any]:
    started = time.perf_counter()
    duration = int(duration_seconds)
    if duration <= 0 or duration > 10:
        raise ValueError(f"{CONTRACT}_DURATION_INVALID")
    if not _text(instruction):
        raise ValueError(f"{CONTRACT}_INSTRUCTION_REQUIRED")

    target = Path("/models") / output_relative.lstrip("/")
    target.parent.mkdir(parents=True, exist_ok=True)
    model_volume.reload()

    os.chdir("/app")
    import handler_v4 as video_engine

    video_engine.runpod.serverless.progress_update = lambda *_args, **_kwargs: None
    video_engine.v3.runpod.serverless.progress_update = lambda *_args, **_kwargs: None
    video_engine.v3.legacy.runpod.serverless.progress_update = lambda *_args, **_kwargs: None

    def _capture(path: Path, _storage_upload: dict[str, Any]) -> None:
        source = Path(path)
        if not source.is_file() or source.stat().st_size <= 100_000:
            raise RuntimeError(f"{CONTRACT}_LOCAL_OUTPUT_INVALID")
        shutil.copyfile(source, target)

    video_engine.legacy._upload_video = _capture
    video_engine.v3.legacy._upload_video = _capture

    data = {
        "contract": "AVANTIQO_SYNTHETIC_VIDEO_ENGINE_V1",
        "capability": "ai.video.generate",
        "instruction": instruction,
        "negative_instruction": (
            "text, typography, captions, numbers, logos, watermarks, browser, dashboard, UI, hologram, "
            "neon network, science fiction, plastic skin, extra fingers, malformed hands, duplicated people, "
            "identity drift, morphing, temporal flicker, frame collapse, stock footage, generic corporate smiles"
        ),
        "duration_seconds": duration,
        "fps": FPS,
        "aspect_ratio": "16:9",
        "resolution": "720p",
        "quality_profile": "cinema",
        "seed": int(seed),
        "reference_images": [],
        "storage_upload": {
            "signed_url": "https://avantiqo-proof-placeholder.supabase.co/storage/v1/object/upload/sign/internal/proof",
            "storage_reference": f"storage://creative-assets/internal-investor-proof/{uuid.uuid4().hex}.mp4",
        },
    }

    result = video_engine.handler({
        "id": f"investor-proof-{uuid.uuid4().hex}",
        "input": data,
    })
    if not isinstance(result, dict) or result.get("status") != "completed":
        raise RuntimeError(f"{CONTRACT}_GENERATION_FAILED:{result}")
    if not target.is_file() or target.stat().st_size <= 100_000:
        raise RuntimeError(f"{CONTRACT}_CAPTURE_MISSING")
    model_volume.commit()
    elapsed = round(time.perf_counter() - started, 3)
    return {
        **result,
        "success": True,
        "contract": CONTRACT,
        "output_relative": output_relative,
        "output_size_bytes": target.stat().st_size,
        "modal_function_seconds": elapsed,
        "source_visual_asset_count": 0,
        "pure_text_to_video": True,
        "newly_generated_asset": True,
        "external_provider_contacted": False,
        "external_storage_upload_performed": False,
        "production_routing_changed": False,
    }
