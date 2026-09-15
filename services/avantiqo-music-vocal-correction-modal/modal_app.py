from __future__ import annotations

import os
from typing import Any

import modal

APP_NAME = "avantiqo-music-vocal-correction-owned"
ENGINE_CONTRACT = "AVANTIQO_MUSIC_VOCAL_CORRECTION_ENGINE_V2"
QUALITY_PROFILE = "TORCHCREPE_SIGNALSMITH_VOCAL_CORRECTION_V2"
WORKER_IMAGE = "ghcr.io/churchillkaron/avantiqo-music-vocal-correction-worker@sha256:30dd44c131b3b2d77127989fd6535be3fd09e2514d90d091c2ac75feb1df2744"

app = modal.App(APP_NAME)


def _private_registry_secret() -> modal.Secret | None:
    if not modal.is_local():
        return None
    username = str(os.environ.get("AVANTIQO_MODAL_REGISTRY_USERNAME") or "").strip()
    password = str(os.environ.get("AVANTIQO_MODAL_REGISTRY_PASSWORD") or "").strip()
    if not username or not password:
        raise RuntimeError("AVANTIQO_MUSIC_VOCAL_CORRECTION_MODAL_PRIVATE_REGISTRY_CREDENTIALS_REQUIRED")
    return modal.Secret.from_dict({"REGISTRY_USERNAME": username, "REGISTRY_PASSWORD": password})


image = modal.Image.from_registry(WORKER_IMAGE, secret=_private_registry_secret(), add_python=None).entrypoint([])


def _text(value: Any) -> str:
    return str(value or "").strip()


def _object(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


@app.function(image=image, gpu="A10G", timeout=20 * 60, min_containers=0, max_containers=1, scaledown_window=5)
def correct(data: dict[str, Any]) -> dict[str, Any]:
    import handler_v2 as engine

    if _text(data.get("capability")) != "ai.audio.vocal-correct":
        raise ValueError("AVANTIQO_MUSIC_VOCAL_CORRECTION_CAPABILITY_INVALID")
    roles = _object(data.get("source_asset_roles"))
    assets = data.get("source_assets") if isinstance(data.get("source_assets"), list) else []
    source_url = _text(roles.get("source_audio")) or (_text(assets[0]) if assets else "")
    uploads = _object(data.get("output_uploads"))
    spec = _object(data.get("structured_specification"))
    params = _object(spec.get("provider_parameters"))
    if not source_url:
        raise ValueError("AVANTIQO_MUSIC_VOCAL_CORRECTION_SOURCE_AUDIO_REQUIRED")
    if set(uploads.keys()) != {"corrected_vocal_wav", "correction_report_json"}:
        raise ValueError("AVANTIQO_MUSIC_VOCAL_CORRECTION_OUTPUT_UPLOAD_SET_INVALID")

    payload = {
        "contract": ENGINE_CONTRACT,
        "capability": "ai.audio.vocal-correct",
        "model": "torchcrepe-full",
        "quality_profile": QUALITY_PROFILE,
        "source_audio": source_url,
        "rights_attestation": params.get("rights_attestation"),
        "output_uploads": uploads,
        "correction": params.get("correction"),
    }
    result = engine._handler({"input": payload})
    if not isinstance(result, dict):
        raise RuntimeError("AVANTIQO_MUSIC_VOCAL_CORRECTION_OUTPUT_OBJECT_REQUIRED")
    corrected_ref = _text(result.get("corrected_vocal_wav"))
    report_ref = _text(result.get("correction_report_json"))
    return {
        "success": True,
        "status": "completed",
        **result,
        "corrected_vocal": {"storage_reference": corrected_ref},
        "correction_report": {"storage_reference": report_ref},
        "infrastructure_provider": "MODAL_DIRECT_A10G_ASYNC_V1",
        "raw_reasoning_persisted": False,
    }
