"""Generate four fresh owned-video plates for the Avantiqo product-visual proof.

The purpose of this runner is visual-direction proof, not production DFR. It uses
Avantiqo's already-deployed distilled LTX-2.5 lane, launches four six-second
purpose-generated shots concurrently, and leaves deterministic Avantiqo product
UI, typography, effects and mastering to Studio post-production.

No screenshot, prior generated visual, source image or source video is accepted.
"""
from __future__ import annotations

import json
import os
from pathlib import Path

import modal

CONTRACT = "AVANTIQO_INVESTOR_PRODUCT_VISUAL_24S_FAST_V1"
APP_NAME = "avantiqo-video-owned"
FUNCTION_NAME = "generate_investor_t2v_master"
REMOTE_ROOT = "investor-avantiqo-product-visual-24s"
DURATION_SECONDS = 6
EXPECTED_PIPELINE = "DISTILLED_TWO_STAGE_T2V_BF16"
EXPECTED_WIDTH = 1920
EXPECTED_HEIGHT = 1088
EXPECTED_FPS = 24

SHOTS = (
    {
        "id": "01-evidence",
        "seed": 26090571,
        "prompt": (
            "Prestige global investor-film opening inside a refined high-end hospitality receiving area in Phuket before service. "
            "Begin macro on tactile delivery evidence: sealed carton edge, clean packing slip, stainless work surface, cool morning condensation. "
            "Reveal a serious receiving manager discovering that one critical expected item is physically absent from the delivery. "
            "The missing item must be visually obvious through the empty compartment and the manager's restrained reaction. "
            "No technology yet. Premium documentary-commercial realism, motivated natural practical light, authentic hands, skin, paper, cardboard and metal, controlled focus pull, quiet consequential performance. "
            "No text, logo, screen, dashboard, browser, hologram, neon, particles or generic corporate-stock aesthetic."
        ),
    },
    {
        "id": "02-consequence",
        "seed": 26090572,
        "prompt": (
            "Continue the same real operating business and the same supplier exception. One elegant lateral camera move connects the consequences physically rather than as a montage: "
            "a chef pauses at an empty prep position, a service lead adjusts a customer commitment, and an operations manager receives the same unmarked paper evidence while a storeroom worker checks the affected shelf. "
            "The causal chain must be clear without software. Human-scale premium enterprise cinema, natural skin and hands, realistic materials, quiet urgency, shallow depth only where motivated, refined warm practical light, restrained movement. "
            "No screens, phones, laptops, dashboards, text overlays, logos, holograms, neon effects, fake data or smiling stock actors."
        ),
    },
    {
        "id": "03-avantiqo",
        "seed": 26090573,
        "prompt": (
            "First product reveal in a premium executive operating environment belonging to the same hospitality business. Compose the frame specifically for a real Avantiqo screen composite in post: "
            "a composed operations leader stands on the left third beside the physical delivery evidence, while a large elegant wall-mounted flat display occupies the right half of frame, nearly front-on, with a stable rectangular screen surface and minimal perspective drift. "
            "The physical display content must remain deliberately blank warm off-white with no generated typography, no fake dashboard and no UI details; Studio will render the real Avantiqo product from scratch into that display. "
            "Camera movement is a very slow controlled micro-dolly only, so the screen remains easy to track. Premium architecture, warm stone, brushed metal, natural skin, realistic reflections and screen luminance, serious global technology-launch cinema. "
            "No black interface, no blue neon, no hologram, no generated words, no logo, no floating graphics and no science-fiction treatment."
        ),
    },
    {
        "id": "04-human-control",
        "seed": 26090574,
        "prompt": (
            "Prestige investor-film close in the same business after the decision has been made. The responsible manager steps away from a physical display and returns attention to the operation while staff move with calm clarity and the earlier delivery disruption is visibly controlled. "
            "The environment feels intelligent because people already have context and timing aligns, not because of futuristic visual effects. The manager keeps a slim unmarked evidence folder in hand and gives one deliberate acknowledgment to the team. "
            "Camera makes a restrained slow push toward the human decision maker, leaving clean negative space on the right side for editorial Avantiqo typography added later by Studio. "
            "Premium practical light, natural face and hands, warm-neutral architecture, physically plausible motion, emotionally confident but not triumphant. No screen UI, generated text, logo, hologram, neon, particles or stock-commercial smiles."
        ),
    },
)


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
    report_path = Path(
        os.environ.get("AVANTIQO_PRODUCT_VISUAL_GENERATION_REPORT")
        or "product-visual-24s-generation.json"
    )
    remote_root = f"{REMOTE_ROOT}/{commit}"

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
        print(
            f"{CONTRACT}_SHOT_PASS={shot['id']}:{result.get('modal_function_seconds')}",
            flush=True,
        )

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
        "cache_seed_called_by_runner": False,
        "source_visual_asset_count": 0,
        "existing_visual_assets_used": False,
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
