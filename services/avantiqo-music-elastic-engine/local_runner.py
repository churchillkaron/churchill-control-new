from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

from handler import handler

ENGINE_CONTRACT = "AVANTIQO_MUSIC_ELASTIC_AUDIO_ENGINE_V1"


def _text(value: Any) -> str:
    return str(value or "").strip()


def _object(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _engine_payload(data: dict[str, Any]) -> dict[str, Any]:
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
    return {
        "contract": ENGINE_CONTRACT,
        "source_audio_url": source_url,
        "output_upload_url": _text(upload.get("signed_url")),
        "source_asset_id": _text(params.get("source_asset_id")) or None,
        "source_offset_seconds": params.get("source_offset_seconds", 0),
        "duration_seconds": params.get("duration_seconds") or data.get("duration_seconds"),
        "source_file_checksum": _text(params.get("source_file_checksum")) or None,
        "approved_warp_plan": params.get("approved_warp_plan"),
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    args = parser.parse_args()
    source = Path(args.input)
    payload = json.loads(source.read_text(encoding="utf-8"))
    result = handler({"input": _engine_payload(payload)})
    if not isinstance(result, dict):
        raise RuntimeError("AVANTIQO_MUSIC_ELASTIC_OUTPUT_OBJECT_REQUIRED")
    result = {
        "success": True,
        "status": "completed",
        **result,
        "storage_reference": _text(_object(payload.get("storage_upload")).get("storage_reference")),
        "raw_reasoning_persisted": False,
    }
    sys.stdout.write(json.dumps(result, ensure_ascii=True, separators=(",", ":")))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
