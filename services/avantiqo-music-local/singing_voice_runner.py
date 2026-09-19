import argparse
import hashlib
import json
import os
import subprocess
import tempfile
import time
import urllib.request
from pathlib import Path

CONTRACT = "AVANTIQO_MUSIC_SINGING_VOICE_ENGINE_V1"
CAPABILITY = "ai.audio.singing-voice-convert"
FOUNDATION_MODEL = "Plachta/Seed-VC"
MODEL_LICENSE = "GPL-3.0"
QUALITY_PROFILE = "SEED_VC_V1_SVC_44K_FT_EMA_V2_ZERO_SHOT_RESEARCH_V1"
CHECKPOINT_SHA256 = "42aef93ffe65857c840d270252fa040f7ba04514945ec460f3ac1ac2a96de684"
SEED_ROOT = Path(os.environ.get("AVANTIQO_SEED_VC_ROOT", r"C:\Avantiqo\seed-vc"))
CHECKPOINT = Path(os.environ.get("AVANTIQO_SEED_VC_SVC_CHECKPOINT", str(SEED_ROOT / "checkpoints" / "DiT_seed_v2_uvit_whisper_base_f0_44k_bigvgan_pruned_ft_ema_v2.pth")))
CONFIG = Path(os.environ.get("AVANTIQO_SEED_VC_SVC_CONFIG", str(SEED_ROOT / "configs" / "presets" / "config_dit_mel_seed_uvit_whisper_base_f0_44k.yml")))
MAX_SOURCE_BYTES = 600 * 1024 * 1024
MAX_REFERENCE_BYTES = 20 * 1024 * 1024


def text(value):
    return str(value or "").strip()

def sha256_file(path: Path):
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()



def obj(value):
    return value if isinstance(value, dict) else {}


def download(url: str, target: Path, max_bytes: int):
    if not url.lower().startswith("https://"):
        raise RuntimeError("AVANTIQO_SINGING_VOICE_SOURCE_HTTPS_REQUIRED")
    request = urllib.request.Request(url, headers={"User-Agent": "Avantiqo-SingingVoice/1"})
    with urllib.request.urlopen(request, timeout=180) as response, target.open("wb") as handle:
        total = 0
        while True:
            chunk = response.read(1024 * 1024)
            if not chunk:
                break
            total += len(chunk)
            if total > max_bytes:
                raise RuntimeError("AVANTIQO_SINGING_VOICE_SOURCE_TOO_LARGE")
            handle.write(chunk)
    if target.stat().st_size <= 44:
        raise RuntimeError("AVANTIQO_SINGING_VOICE_SOURCE_INVALID")


def upload(url: str, path: Path, content_type="audio/wav"):
    data = path.read_bytes()
    request = urllib.request.Request(url, data=data, method="PUT", headers={"Content-Type": content_type})
    with urllib.request.urlopen(request, timeout=300) as response:
        if response.status < 200 or response.status >= 300:
            raise RuntimeError(f"AVANTIQO_SINGING_VOICE_UPLOAD_FAILED:{response.status}")


def duration_seconds(path: Path):
    result = subprocess.run([
        "ffprobe", "-v", "error", "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1", str(path),
    ], capture_output=True, text=True, timeout=30, check=False)
    try:
        value = float(result.stdout.strip())
    except Exception:
        value = 0.0
    if value <= 0:
        raise RuntimeError(f"AVANTIQO_SINGING_VOICE_DURATION_REQUIRED:{path.name}")
    return value


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    args = parser.parse_args()
    payload = json.loads(Path(args.input).read_text(encoding="utf-8"))
    if text(payload.get("contract")) != CONTRACT:
        raise RuntimeError("AVANTIQO_SINGING_VOICE_CONTRACT_INVALID")
    if text(payload.get("capability")) != CAPABILITY:
        raise RuntimeError("AVANTIQO_SINGING_VOICE_CAPABILITY_INVALID")
    reference = obj(payload.get("voice_reference"))
    consent = obj(reference.get("consent"))
    if text(reference.get("contract")) != "AVANTIQO_VOICE_REFERENCE_V1":
        raise RuntimeError("AVANTIQO_SINGING_VOICE_LIBRARY_REFERENCE_REQUIRED")
    if consent.get("confirmed") is not True or text(consent.get("use_scope")).upper() != "SINGING":
        raise RuntimeError("AVANTIQO_SINGING_VOICE_CONSENT_SCOPE_REQUIRED")
    if not text(reference.get("profile_id")):
        raise RuntimeError("AVANTIQO_SINGING_VOICE_PROFILE_REQUIRED")
    reference_url = text(reference.get("execution_url"))
    if not reference_url:
        raise RuntimeError("AVANTIQO_SINGING_VOICE_REFERENCE_EXECUTION_URL_REQUIRED")
    if text(reference.get("audio_base64")):
        raise RuntimeError("AVANTIQO_SINGING_VOICE_RAW_REFERENCE_FORBIDDEN")
    if not CHECKPOINT.is_file() or not CONFIG.is_file() or not (SEED_ROOT / "inference.py").is_file():
        raise RuntimeError("AVANTIQO_SINGING_VOICE_RUNTIME_FILES_REQUIRED")
    checkpoint_hash = sha256_file(CHECKPOINT)
    if checkpoint_hash.lower() != CHECKPOINT_SHA256:
        raise RuntimeError(f"AVANTIQO_SINGING_VOICE_CHECKPOINT_HASH_MISMATCH:{checkpoint_hash}")
    source_url = text(payload.get("source_audio"))
    uploads = obj(payload.get("output_uploads"))
    audio_upload = obj(uploads.get("converted_vocal_wav"))
    report_upload = obj(uploads.get("conversion_report_json"))
    if not source_url or not text(audio_upload.get("signed_url")) or not text(report_upload.get("signed_url")):
        raise RuntimeError("AVANTIQO_SINGING_VOICE_OUTPUT_UPLOADS_REQUIRED")

    started = time.perf_counter()
    with tempfile.TemporaryDirectory(prefix="avantiqo-singing-voice-") as tmp:
        root = Path(tmp)
        source = root / "source-vocal.wav"
        target = root / "authorized-reference.wav"
        output_dir = root / "output"
        output_dir.mkdir(parents=True, exist_ok=True)
        download(source_url, source, MAX_SOURCE_BYTES)
        download(reference_url, target, MAX_REFERENCE_BYTES)
        source_duration = duration_seconds(source)
        reference_duration = duration_seconds(target)
        if reference_duration < 1.0 or reference_duration > 30.5:
            raise RuntimeError("AVANTIQO_SINGING_VOICE_REFERENCE_DURATION_OUTSIDE_MODEL_RANGE")

        command = [
            os.environ.get("PYTHON", "python"), str(SEED_ROOT / "inference.py"),
            "--source", str(source), "--target", str(target), "--output", str(output_dir),
            "--diffusion-steps", "30", "--length-adjust", "1.0", "--inference-cfg-rate", "0.7",
            "--f0-condition", "True", "--auto-f0-adjust", "False", "--semi-tone-shift", "0",
            "--checkpoint", str(CHECKPOINT), "--config", str(CONFIG), "--fp16", "True",
        ]
        completed = subprocess.run(command, capture_output=True, text=True, timeout=3600, check=False, cwd=str(SEED_ROOT))
        if completed.returncode != 0:
            raise RuntimeError(f"AVANTIQO_SINGING_VOICE_INFERENCE_FAILED:{completed.stderr[-1600:]}")
        outputs = [p for p in output_dir.rglob("*.wav") if p.is_file() and p.stat().st_size > 44]
        if len(outputs) != 1:
            raise RuntimeError(f"AVANTIQO_SINGING_VOICE_OUTPUT_AMBIGUOUS:{len(outputs)}")
        converted = outputs[0]
        output_duration = duration_seconds(converted)
        duration_drift_ms = abs(output_duration - source_duration) * 1000.0
        report = {
            "contract": "AVANTIQO_MUSIC_SINGING_VOICE_REPORT_V1",
            "capability": CAPABILITY,
            "foundation_model": FOUNDATION_MODEL,
            "quality_profile": QUALITY_PROFILE,
            "model_license": MODEL_LICENSE,
        "checkpoint_sha256": CHECKPOINT_SHA256,
            "checkpoint_sha256": CHECKPOINT_SHA256,
            "gpl_compliance_review_required": True,
            "voice_profile_id": reference.get("profile_id"),
            "consent_basis": consent.get("basis"),
            "consent_evidence_id": consent.get("evidence_id"),
            "consent_use_scope": "SINGING",
            "source_duration_seconds": round(source_duration, 6),
            "reference_duration_seconds": round(reference_duration, 6),
            "output_duration_seconds": round(output_duration, 6),
            "duration_drift_ms": round(duration_drift_ms, 3),
            "f0_condition": True,
            "auto_f0_adjust": False,
            "semi_tone_shift": 0,
            "preserve_guide_pitch_intent": True,
            "preserve_guide_timing_intent": True,
            "identity_fidelity_review_required": True,
            "pronunciation_review_required": True,
            "artifact_review_required": True,
            "production_certified": False,
            "production_routing_allowed": False,
            "reference_audio_persisted_by_worker": False,
        }
        report_path = root / "conversion-report.json"
        report_path.write_text(json.dumps(report, indent=2), encoding="utf-8")
        upload(audio_upload["signed_url"], converted)
        upload(report_upload["signed_url"], report_path, "application/json")

    print(json.dumps({
        "success": True,
        "contract": CONTRACT,
        "capability": CAPABILITY,
        "foundation_model": FOUNDATION_MODEL,
        "quality_profile": QUALITY_PROFILE,
        "model_license": MODEL_LICENSE,
            "checkpoint_sha256": CHECKPOINT_SHA256,
        "gpl_compliance_review_required": True,
        "voice_profile_id": reference.get("profile_id"),
        "duration_drift_ms": round(duration_drift_ms, 3),
        "storage_references": {
            "converted_vocal_wav": audio_upload.get("storage_reference"),
            "conversion_report_json": report_upload.get("storage_reference"),
        },
        "elapsed_ms": int((time.perf_counter() - started) * 1000),
        "research_candidate": True,
        "human_identity_review_required": True,
        "production_certified": False,
        "production_routing_allowed": False,
        "supplier_cost_thb": 0,
        "reference_audio_persisted_by_worker": False,
        "raw_reasoning_persisted": False,
    }, separators=(",", ":")))


if __name__ == "__main__":
    main()
