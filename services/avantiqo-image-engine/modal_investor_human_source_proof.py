"""Generate exactly one owned photoreal human source candidate for investor film.

The output is always approval-pending and never authorizes animation. It exists
only to create a fresh Avantiqo-owned identity source that can be visually
inspected before same-character keyframes are produced.
"""
from __future__ import annotations

import hashlib
import json
import uuid
from pathlib import Path

import modal

from modal_app import (
    INVESTOR_KEYFRAME_CONTRACT,
    app,
    generate_investor_keyframe,
    model_volume,
    seed_cache,
)

CONTRACT = "AVANTIQO_INVESTOR_HUMAN_SOURCE_PROOF_V1"
SOURCE_REPOSITORY = "churchillkaron/churchill-control-new"
WIDTH = 1920
HEIGHT = 1088

INSTRUCTION = (
    "A candid live-action photograph of one experienced Southeast Asian hospitality owner-manager in their early forties "
    "inside a real premium tropical hotel restaurant before evening service. The person is quietly checking the room, not posing, "
    "with both natural hands clearly visible at waist height and relaxed fingers. Medium three-quarter framing so face, shoulders, torso, "
    "both forearms and both hands are visible. Real human facial asymmetry, pores, fine skin texture, slight under-eye detail, individual "
    "hair strands, natural teeth and eyes, realistic knuckles, fingernails and finger proportions. Practical dark work jacket over a simple "
    "open-collar shirt, believable fabric folds and ordinary professional grooming. Warm practical interior lights mixed with soft tropical "
    "window light, real polished wood, stone and glass, subtle background staff preparing tables out of focus. Documentary hospitality "
    "photography captured on a professional cinema camera, restrained contrast, realistic lens falloff, natural color science. No glamour "
    "retouching, no beauty-ad pose, no influencer pose, no impossible bokeh, no duplicated people, no computer, phone, tablet, screen, "
    "dashboard, signage, text, logo, hologram, futuristic design, CGI or illustration. It must plausibly be mistaken for a frame from a "
    "high-budget live-action documentary commercial shot in a real operating hospitality business."
)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


@app.local_entrypoint()
def main(output: str, seed: int = 26090611) -> None:
    destination = Path(output).expanduser().resolve()
    destination.parent.mkdir(parents=True, exist_ok=True)
    run_id = uuid.uuid4().hex[:16]
    remote = f"investor-human-source-proof/{run_id}/source.png"
    try:
        seed_cache.remote()
        result = generate_investor_keyframe.remote(
            remote,
            INSTRUCTION,
            WIDTH,
            HEIGHT,
            int(seed),
        )
        if not isinstance(result, dict) or result.get("success") is not True:
            raise RuntimeError(f"{CONTRACT}_GENERATION_FAILED")
        if result.get("contract") != INVESTOR_KEYFRAME_CONTRACT:
            raise RuntimeError(f"{CONTRACT}_GENERATION_CONTRACT_INVALID")
        if result.get("external_provider_contacted") is not False:
            raise RuntimeError(f"{CONTRACT}_EXTERNAL_PROVIDER_FORBIDDEN")
        with destination.open("wb") as handle:
            for chunk in model_volume.read_file(remote):
                handle.write(chunk)
        if not destination.is_file() or destination.stat().st_size < 250_000:
            raise RuntimeError(f"{CONTRACT}_OUTPUT_INVALID")
        digest = sha256(destination)
        report = {
            "success": True,
            "contract": CONTRACT,
            "source_repository": SOURCE_REPOSITORY,
            "generation": result,
            "output": str(destination),
            "sha256": digest,
            "character_id": f"investor-human-source-{digest[:16]}",
            "approval_id": None,
            "approval_status": "PENDING",
            "animation_authorized": False,
            "human_visual_review_required": True,
            "external_provider_contacted": False,
        }
        destination.with_suffix(".json").write_text(
            json.dumps(report, indent=2) + "\n",
            encoding="utf-8",
        )
        print(f"{CONTRACT}=PASS_APPROVAL_PENDING", flush=True)
        print(f"SOURCE_SHA256={digest}", flush=True)
    finally:
        try:
            model_volume.remove_file(remote)
        except Exception:
            pass
