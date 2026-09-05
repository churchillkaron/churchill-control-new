"""Generate the 24-second Avantiqo investor motion proof on the fast Modal LTX-2.5 lane.

This proof exists to judge directing, realism, motion and story without blocking on
production-detail 4K generation. It launches four independent six-second shots
concurrently and preserves exact provenance that the generated masters are
1920x1088 distilled LTX-2.5 outputs. 4K delivery mastering happens separately.
"""
from __future__ import annotations

import json
import os
from pathlib import Path

import modal

from investor_production_24s import SHOTS

CONTRACT = "AVANTIQO_INVESTOR_FAST_MOTION_24S_MODAL_V1"
APP_NAME = "avantiqo-video-owned"
FUNCTION_NAME = "generate_investor_t2v_master"
SEED_FUNCTION = "seed_investor_t2v_cache"
REMOTE_ROOT = "investor-fast-motion-24s"
DURATION_SECONDS = 6
EXPECTED_PIPELINE = "DISTILLED_TWO_STAGE_T2V_BF16"
EXPECTED_WIDTH = 1920
EXPECTED_HEIGHT = 1088
EXPECTED_FPS = 24


def _assert_generation(result: dict, shot_id: str) -> None:
    if not isinstance(result, dict) or result.get("success") is not True:
        raise RuntimeError(f"{CONTRACT}_SHOT_FAILED:{shot_id}:{result}")
    expected = {
        "pipeline": EXPECTED_PIPELINE,
        "width": EXPECTED_WIDTH,
        "height": EXPECTED_HEIGHT,
        "fps": EXPECTED_FPS,
        "duration_seconds_requested": DURATION_SECONDS,
        "stage_1_steps": 8,
        "stage_2_steps": 3,
        "source_visual_asset_count": 0,
        "source_image_used": False,
        "source_video_used": False,
        "screenshot_or_browser_capture_used": False,
        "pure_text_to_video": True,
        "newly_generated_asset": True,
        "external_provider_contacted": False,
        "automatic_paid_retry": False,
    }
    for key, value in expected.items():
        if result.get(key) != value:
            raise RuntimeError(
                f"{CONTRACT}_SHOT_EVIDENCE_INVALID:{shot_id}:{key}:{result.get(key)!r}:{value!r}"
            )


def main() -> None:
    commit = os.environ.get("GITHUB_SHA") or "local"
    report_path = Path(os.environ.get("AVANTIQO_FAST_24S_REPORT") or "fast-24s-generation.json")
    remote_root = f"{REMOTE_ROOT}/{commit}"

    seed = modal.Function.from_name(APP_NAME, SEED_FUNCTION)
    seed_result = seed.remote()
    if not isinstance(seed_result, dict) or seed_result.get("success") is not True:
        raise RuntimeError(f"{CONTRACT}_CACHE_NOT_READY:{seed_result}")

    generator = modal.Function.from_name(APP_NAME, FUNCTION_NAME).with_options(
        max_containers=4,
        timeout=480,
        scaledown_window=5,
    )

    pending = []
    for shot in SHOTS:
        remote_path = f"{remote_root}/{shot['id']}-1920x1088.mp4"
        call = generator.spawn(remote_path, shot["prompt"], DURATION_SECONDS, shot["seed"])
        pending.append((shot, remote_path, call))
        print(f"{CONTRACT}_STARTED={shot['id']}:{call.object_id}", flush=True)

    completed = []
    for shot, remote_path, call in pending:
        result = call.get()
        _assert_generation(result, shot["id"])
        completed.append({
            "id": shot["id"],
            "seed": shot["seed"],
            "duration_seconds": DURATION_SECONDS,
            "remote_path": remote_path,
            "prompt": shot["prompt"],
            "generation": result,
        })
        print(f"{CONTRACT}_SHOT_PASS={shot['id']}:{result.get('modal_function_seconds')}", flush=True)

    report = {
        "success": True,
        "contract": CONTRACT,
        "source_commit": commit,
        "quality_tier": "PREVIEW_DISTILLED_1920X1088",
        "modal_app": APP_NAME,
        "modal_function": FUNCTION_NAME,
        "shot_count": len(completed),
        "shot_duration_seconds": DURATION_SECONDS,
        "timeline_duration_seconds": len(completed) * DURATION_SECONDS,
        "generation_parallelism_requested": 4,
        "source_visual_assets_used": 0,
        "screenshots_used": False,
        "external_video_provider_used": False,
        "automatic_paid_retry": False,
        "shots": completed,
    }
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(f"{CONTRACT}=PASS", flush=True)
    print(f"{CONTRACT}_REPORT={report_path}", flush=True)


if __name__ == "__main__":
    main()
