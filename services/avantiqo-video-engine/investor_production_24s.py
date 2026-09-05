"""Generate a 24-second Avantiqo investor-film proof on the production DFR tier.

This is intentionally a local orchestration script. It invokes the already-deployed
Avantiqo-owned Modal functions, launches four independent six-second shots before
waiting for results, and leaves final editorial mastering to the CI runner.
"""
from __future__ import annotations

import json
import os
from pathlib import Path

import modal

CONTRACT = "AVANTIQO_INVESTOR_PRODUCTION_24S_DFR_V1"
APP_NAME = "avantiqo-video-owned"
FUNCTION_NAME = "generate_investor_hq_master"
SEED_FUNCTION = "seed_investor_hq_cache"
REMOTE_ROOT = "investor-production-24s"
DURATION_SECONDS = 6
EXPECTED_PIPELINE = "LTX25_DFR_DETAIL_FIDELITY"
EXPECTED_WIDTH = 3840
EXPECTED_HEIGHT = 2176
EXPECTED_FPS = 24

SHOTS = (
    {
        "id": "01-awakening",
        "seed": 26090591,
        "prompt": (
            "World-class investor-film opening for Avantiqo. Blue-hour dawn over a sophisticated coastal Asian business district in Phuket, "
            "seen in one elegant stabilized forward aerial move. Hotels, restaurants, service vehicles, deliveries and early staff activity begin in believable coordinated timing. "
            "The intelligence is invisible and expressed only through cause and effect: lights wake in sequence, a delivery arrives exactly as doors open, people move with quiet purpose, subtle warm bronze reflections connect the physical world. "
            "Near-future enterprise realism, premium architecture, realistic atmospheric haze, physically plausible traffic and scale, deep cinematic layers, refined natural color. "
            "No text, logos, UI, holograms, glowing networks or science-fiction city. It must feel expensive, calm, credible and globally ambitious."
        ),
    },
    {
        "id": "02-human-operations",
        "seed": 26090592,
        "prompt": (
            "Inside a premium modern hospitality business in Phuket, one continuous controlled tracking shot follows a composed operations leader through real work. "
            "A guest need is noticed, a kitchen preparation is adjusted, and a fresh supplier handoff reaches the correct person with precise timing. "
            "Nobody stares at a laptop. Avantiqo is represented only by the business behaving intelligently: people have context before being asked, timing aligns, decisions become action. "
            "Natural skin and hands, authentic food and materials, glass, warm stone and brushed metal, sophisticated Asian-European design, motivated practical lighting, understated performances, premium commercial cinema. "
            "No software screens, floating graphics, generated text, logos, stock smiles or neon effects."
        ),
    },
    {
        "id": "03-one-business-reality",
        "seed": 26090593,
        "prompt": (
            "A cinematic enterprise sequence showing one business reality rather than disconnected departments. In a refined mixed-use service environment, a finance controller receives physical evidence of a completed service while a storeroom movement and customer handoff occur deeper in the same architectural space. "
            "The camera makes a slow confident lateral move that reveals money, supply, people and customer outcome as one causally connected event. "
            "Use restrained warm bronze practical reflections and depth relationships to imply shared context, never an interface. "
            "Human-scale realism, accurate hands, stable identities, believable documents without readable text, realistic materials, natural lens behavior, subtle depth of field, serious executive-film tone. "
            "No dashboards, holograms, logos, captions, sci-fi particles, fake data overlays or generic corporate stock imagery."
        ),
    },
    {
        "id": "04-forward",
        "seed": 26090594,
        "prompt": (
            "Final hero shot for an Avantiqo investor film. A confident business leader steps from a refined interior onto a high terrace overlooking a living coastal city at first sunlight while real businesses below move in synchronized, believable activity. "
            "The camera begins close and slowly arcs outward to reveal scale: hospitality, field service, logistics and commerce operating as one connected economic world. "
            "The future should feel already possible, not science fiction. Subtle bronze morning light is the only visual motif for intelligence. Leave clean elegant negative space in the final composition for Avantiqo editorial title added later by Studio. "
            "Premium global technology-launch cinema, natural face and skin, physically plausible architecture and motion, refined lensing, rich but restrained contrast, ambitious and emotionally confident. "
            "No generated lettering, UI, hologram, neon grid, orb, logo or fake dashboard."
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
        "dfr_used": True,
        "detailing_ic_lora_used": True,
        "distilled_base_transformer_used": True,
        "native_master_generated": True,
        "pixel_delivery_upscale_used": False,
        "temporal_upscalings": 0,
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
    report_path = Path(os.environ.get("AVANTIQO_24S_REPORT") or "production-24s-generation.json")
    remote_root = f"{REMOTE_ROOT}/{commit}"

    seed = modal.Function.from_name(APP_NAME, SEED_FUNCTION)
    seed_result = seed.remote()
    if not isinstance(seed_result, dict) or seed_result.get("success") is not True:
        raise RuntimeError(f"{CONTRACT}_CACHE_NOT_READY:{seed_result}")

    generator = modal.Function.from_name(APP_NAME, FUNCTION_NAME).with_options(
        max_containers=4,
        timeout=1800,
        scaledown_window=5,
    )

    pending = []
    for shot in SHOTS:
        remote_path = f"{remote_root}/{shot['id']}-3840x2176.mp4"
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
        "quality_tier": "PRODUCTION_DFR_3840X2176",
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
    report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(f"{CONTRACT}=PASS", flush=True)
    print(f"{CONTRACT}_REPORT={report_path}", flush=True)


if __name__ == "__main__":
    main()
