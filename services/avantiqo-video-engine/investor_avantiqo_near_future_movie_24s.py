"""Generate a 24-second near-future Avantiqo investor-film proof.

Direction: a real movie set 5-10 years ahead. The future is conveyed through
architecture, materials, choreography, confidence and invisible intelligence --
not holograms, dashboards or science-fiction devices.
"""
from __future__ import annotations

import json
import os
from pathlib import Path

import modal

CONTRACT = "AVANTIQO_INVESTOR_NEAR_FUTURE_MOVIE_24S_FAST_V1"
APP_NAME = "avantiqo-video-owned"
FUNCTION_NAME = "generate_investor_t2v_master"
REMOTE_ROOT = "investor-avantiqo-near-future-movie-24s"
DURATION_SECONDS = 6
EXPECTED_PIPELINE = "DISTILLED_TWO_STAGE_T2V_BF16"
EXPECTED_WIDTH = 1920
EXPECTED_HEIGHT = 1088
EXPECTED_FPS = 24

COMMON = (
    " Prestige feature-film realism set five to ten years in the future, grounded and believable rather than science fiction. "
    "Elegant near-future architecture, warm stone, brushed metal, quiet glass, refined workwear, practical lighting, natural skin texture, authentic hands, subtle eye-lines, physically correct materials, controlled camera inertia, cinematic depth and premium production design. "
    "The world feels more intelligent because work is coordinated with almost no friction. No paper, folders, clipboards, documents, phones, laptops, tablets, visible software screens, dashboards, browser windows, generated words, logos, holograms, neon, floating graphics, robots, science-fiction props, smiling stock actors or staged corporate meeting behavior. "
    "Protect a cinematic 2.39:1 extraction and keep faces, hands and architecture photoreal."
)

SHOTS = (
    {
        "id": "01-signal",
        "seed": 26090581,
        "prompt": (
            "Near-future premium hospitality receiving area moments before service. A chilled delivery crate opens on a brushed stainless bench and one critical ingredient compartment is unmistakably empty. "
            "The receiving lead notices it instantly, pauses for half a beat, then looks toward the working kitchen. No paperwork and no device is needed. "
            "One precise slow lateral camera move travels from the empty compartment to the human reaction. The problem is understood visually through space, timing and performance." + COMMON
        ),
    },
    {
        "id": "02-ripple",
        "seed": 26090582,
        "prompt": (
            "Continue inside the same near-future hospitality business. A single elegant tracking shot moves through three connected operational spaces as the consequence of the missing ingredient becomes visible in human behavior: prep briefly hesitates, service quietly changes course, and inventory staff redirect without panic. "
            "Nobody explains anything and nobody passes information by hand. The coordination feels unusually fast and intelligent, as if the business shares one nervous system. "
            "Use motivated foreground occlusion, shallow-to-deep focus transitions and precise blocking so the causal chain feels cinematic rather than procedural." + COMMON
        ),
    },
    {
        "id": "03-convergence",
        "seed": 26090583,
        "prompt": (
            "A composed operations leader walks through the same near-future business while several departments realign around the disruption without stopping work. "
            "The camera performs a restrained forward dolly with architectural parallax. In the background, kitchen, service and supply actions converge into one coordinated recovery plan through timing and eye contact rather than visible technology. "
            "The scene should feel like an expensive global feature-film commercial: calm intelligence under pressure, elegant spatial composition, one clear decision point, and the sense that the whole company is thinking together." + COMMON
        ),
    },
    {
        "id": "04-human-control",
        "seed": 26090584,
        "prompt": (
            "Prestige near-future investor-film close after the decision. The operation is back in rhythm. The responsible manager stands within the active business rather than in a meeting room, watches the recovery take hold, gives one subtle acknowledgment, and immediately returns attention to people and service. "
            "No documents, no devices and no posing. The camera makes a slow confident push-in while foreground staff pass naturally, creating depth and brief occlusion. "
            "End on human judgment, control and trust: the future feels advanced because complexity has disappeared from the workers' experience." + COMMON
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
            raise RuntimeError(f"{CONTRACT}_SHOT_EVIDENCE_INVALID:{shot_id}:{key}:{result.get(key)!r}:{value!r}")


def main() -> None:
    commit = os.environ.get("GITHUB_SHA") or "local"
    report_path = Path(os.environ.get("AVANTIQO_NEAR_FUTURE_GENERATION_REPORT") or "near-future-movie-24s-generation.json")
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
        print(f"{CONTRACT}_SHOT_PASS={shot['id']}:{result.get('modal_function_seconds')}", flush=True)

    report = {
        "success": True,
        "contract": CONTRACT,
        "source_commit": commit,
        "direction": "NEAR_FUTURE_REAL_MOVIE",
        "quality_tier": "PREVIEW_DISTILLED_1920X1088",
        "shot_count": len(completed),
        "shot_duration_seconds": DURATION_SECONDS,
        "timeline_duration_seconds": len(completed) * DURATION_SECONDS,
        "generation_parallelism_requested": 4,
        "source_visual_asset_count": 0,
        "screenshots_used": False,
        "product_ui_used": False,
        "paper_or_documents_intentionally_requested": False,
        "science_fiction_styling_requested": False,
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
