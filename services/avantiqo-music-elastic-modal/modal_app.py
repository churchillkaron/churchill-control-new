from __future__ import annotations

import os
from typing import Any

import modal

APP_NAME = "avantiqo-music-elastic-owned"
ENGINE_CONTRACT = "AVANTIQO_MUSIC_ELASTIC_AUDIO_ENGINE_V1"
WORKER_IMAGE = "ghcr.io/churchillkaron/avantiqo-music-elastic-worker@sha256:4afbc10bcc514fb79f370d207adfdb7febb0cd1d99225f89404390e0c5b4b05c"

app = modal.App(APP_NAME)


def _private_registry_secret() -> modal.Secret | None:
    if not modal.is_local():
        return None
    username = str(os.environ.get("AVANTIQO_MODAL_REGISTRY_USERNAME") or "").strip()
    password = str(os.environ.get("AVANTIQO_MODAL_REGISTRY_PASSWORD") or "").strip()
    if not username or not password:
        raise RuntimeError("AVANTIQO_MUSIC_ELASTIC_MODAL_PRIVATE_REGISTRY_CREDENTIALS_REQUIRED")
    return modal.Secret.from_dict({"REGISTRY_USERNAME": username, "REGISTRY_PASSWORD": password})


image = modal.Image.from_registry(WORKER_IMAGE, secret=_private_registry_secret(), add_python=None).entrypoint([])


def _text(value: Any) -> str:
    return str(value or "").strip()


def _object(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


@app.function(image=image, timeout=20 * 60, min_containers=0, max_containers=1, scaledown_window=5)
def render(data: dict[str, Any]) -> dict[str, Any]:
    import handler as engine

    if _text(data.get("capability")) != "ai.audio.elastic-warp":
        raise ValueError("AVANTIQO_MUSIC_ELASTIC_CAPABILITY_INVALID")
    roles = _object(data.get("source_asset_roles"))
    assets = data.get("source_assets") if isinstance(data.get("source_assets"), list) else []
    source_url = _text(roles.get("source_audio")) or (_text(assets[0]) if assets else "")
    upload = _object(data.get("storage_upload"))
    spec = _object(data.get("structured_specification"))
    params = _object(spec.get("provider_parameters"))
    if not source_url:
        raise ValueError("AVANTIQO_MUSIC_ELASTIC_SOURCE_AUDIO_REQUIRED")
    if not _text(upload.get("signed_url")) or not _text(upload.get("storage_reference")).startswith("storage://creative-assets/"):
        raise ValueError("AVANTIQO_MUSIC_ELASTIC_STORAGE_UPLOAD_REQUIRED")

    payload = {
        "contract": ENGINE_CONTRACT,
        "source_audio_url": source_url,
        "output_upload_url": _text(upload.get("signed_url")),
        "source_asset_id": _text(params.get("source_asset_id")) or None,
        "source_offset_seconds": params.get("source_offset_seconds", 0),
        "duration_seconds": params.get("duration_seconds") or data.get("duration_seconds"),
        "source_file_checksum": _text(params.get("source_file_checksum")) or None,
        "approved_warp_plan": params.get("approved_warp_plan"),
    }
    result = engine.handler({"input": payload})
    if not isinstance(result, dict):
        raise RuntimeError("AVANTIQO_MUSIC_ELASTIC_OUTPUT_OBJECT_REQUIRED")
    return {
        "success": True,
        "status": "completed",
        **result,
        "storage_reference": _text(upload.get("storage_reference")),
        "infrastructure_provider": "MODAL_DIRECT_ASYNC_V1",
        "raw_reasoning_persisted": False,
    }
