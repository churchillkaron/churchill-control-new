import argparse
import json
import os
import sys
from pathlib import Path

ENGINE_CONTRACT = "AVANTIQO_MUSIC_VOCAL_CORRECTION_ENGINE_V2"
CAPABILITY = "ai.audio.vocal-correct"
MODEL = "torchcrepe-full"
QUALITY_PROFILE = "TORCHCREPE_SIGNALSMITH_VOCAL_CORRECTION_V2"
ENGINE_ROOT = Path(os.environ.get("AVANTIQO_VOCAL_CORRECTION_ENGINE_ROOT", r"C:\Avantiqo\music-gpu\vocal-correction-engine"))


def text(value):
    return str(value or "").strip()


def obj(value):
    return value if isinstance(value, dict) else {}


def load_engine():
    required = ["handler.py", "handler_v2.py", "key_parser.py", "timing.py"]
    missing = [name for name in required if not (ENGINE_ROOT / name).is_file()]
    if missing:
        raise RuntimeError(f"AVANTIQO_LOCAL_VOCAL_CORRECTION_ENGINE_FILES_REQUIRED:{','.join(missing)}")
    root = str(ENGINE_ROOT)
    if root not in sys.path:
        sys.path.insert(0, root)
    import handler_v2  # noqa: PLC0415
    return handler_v2


def unwrap_payload(data):
    if text(data.get("contract")) != ENGINE_CONTRACT:
        raise RuntimeError("AVANTIQO_LOCAL_VOCAL_CORRECTION_CONTRACT_INVALID")
    if text(data.get("capability")) != CAPABILITY:
        raise RuntimeError("AVANTIQO_LOCAL_VOCAL_CORRECTION_CAPABILITY_INVALID")
    if text(data.get("model")) != MODEL:
        raise RuntimeError("AVANTIQO_LOCAL_VOCAL_CORRECTION_MODEL_INVALID")
    if text(data.get("quality_profile")) != QUALITY_PROFILE:
        raise RuntimeError("AVANTIQO_LOCAL_VOCAL_CORRECTION_QUALITY_PROFILE_INVALID")
    roles = obj(data.get("source_asset_roles"))
    assets = data.get("source_assets") if isinstance(data.get("source_assets"), list) else []
    source_url = text(roles.get("source_audio")) or (text(assets[0]) if assets else "")
    uploads = obj(data.get("output_uploads"))
    spec = obj(data.get("structured_specification"))
    params = obj(spec.get("provider_parameters"))
    if not source_url:
        raise RuntimeError("AVANTIQO_LOCAL_VOCAL_CORRECTION_SOURCE_AUDIO_REQUIRED")
    if set(uploads.keys()) != {"corrected_vocal_wav", "correction_report_json"}:
        raise RuntimeError("AVANTIQO_LOCAL_VOCAL_CORRECTION_OUTPUT_UPLOAD_SET_INVALID")
    rights = obj(params.get("rights_attestation"))
    if rights.get("confirmed") is not True:
        raise RuntimeError("AVANTIQO_LOCAL_VOCAL_CORRECTION_RIGHTS_REQUIRED")
    return {
        "contract": ENGINE_CONTRACT,
        "capability": CAPABILITY,
        "model": MODEL,
        "quality_profile": QUALITY_PROFILE,
        "source_audio": source_url,
        "rights_attestation": rights,
        "output_uploads": uploads,
        "correction": params.get("correction"),
        "source_window": params.get("source_window"),
        "approved_tuning_plan": params.get("approved_tuning_plan"),
        "approved_timing_plan": params.get("approved_timing_plan"),
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    args = parser.parse_args()
    envelope = json.loads(Path(args.input).read_text(encoding="utf-8"))
    engine = load_engine()
    payload = unwrap_payload(envelope)
    result = engine._handler({"input": payload})
    if not isinstance(result, dict) or result.get("success") is not True:
        raise RuntimeError("AVANTIQO_LOCAL_VOCAL_CORRECTION_RESULT_INVALID")
    if text(result.get("contract")) != ENGINE_CONTRACT or text(result.get("quality_profile")) != QUALITY_PROFILE:
        raise RuntimeError("AVANTIQO_LOCAL_VOCAL_CORRECTION_RESULT_CONTRACT_INVALID")
    result["infrastructure_provider"] = "AVANTIQO_LOCAL_NODE_V1"
    result["raw_reasoning_persisted"] = False
    result["external_provider_spend_thb"] = 0
    result["production_certified"] = False
    print(json.dumps(result, separators=(",", ":")))


if __name__ == "__main__":
    main()
