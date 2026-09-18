import argparse
import json
import os
import subprocess
import tempfile
import time
import urllib.request
from pathlib import Path

CONTRACT = "AVANTIQO_MUSIC_VOCAL_ROLE_SEPARATOR_ENGINE_V1"
CAPABILITY = "ai.audio.vocal-role-separate"
STAGE1_MODEL = "htdemucs_ft"
STAGE2_MODEL = "UVR_MDXNET_KARA_2.onnx"
QUALITY_PROFILE = "DEMUCS_HTDEMUCS_FT_PLUS_UVR_KARA2_VOCAL_ROLE_RESEARCH_V1"
MODEL_DIR = Path(os.environ.get("AVANTIQO_AUDIO_SEPARATOR_MODEL_DIR", r"C:\Avantiqo\audio-separator-models"))
MAX_SOURCE_BYTES = 600 * 1024 * 1024


def text(value):
    return str(value or "").strip()


def obj(value):
    return value if isinstance(value, dict) else {}


def download(url: str, target: Path):
    if not url.lower().startswith("https://"):
        raise RuntimeError("AVANTIQO_VOCAL_ROLE_SOURCE_HTTPS_REQUIRED")
    request = urllib.request.Request(url, headers={"User-Agent": "Avantiqo-VocalRole/1"})
    with urllib.request.urlopen(request, timeout=180) as response, target.open("wb") as handle:
        total = 0
        while True:
            chunk = response.read(1024 * 1024)
            if not chunk:
                break
            total += len(chunk)
            if total > MAX_SOURCE_BYTES:
                raise RuntimeError("AVANTIQO_VOCAL_ROLE_SOURCE_TOO_LARGE")
            handle.write(chunk)
    if target.stat().st_size <= 44:
        raise RuntimeError("AVANTIQO_VOCAL_ROLE_SOURCE_INVALID")


def upload(url: str, path: Path, content_type="audio/wav"):
    data = path.read_bytes()
    request = urllib.request.Request(url, data=data, method="PUT", headers={"Content-Type": content_type})
    with urllib.request.urlopen(request, timeout=300) as response:
        if response.status < 200 or response.status >= 300:
            raise RuntimeError(f"AVANTIQO_VOCAL_ROLE_UPLOAD_FAILED:{response.status}")


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
        raise RuntimeError(f"AVANTIQO_VOCAL_ROLE_DURATION_REQUIRED:{path.name}")
    return value


def exact_role_outputs(paths):
    vocals = [Path(p) for p in paths if "(Vocals)" in Path(p).name or "_Vocals" in Path(p).stem]
    instrumental = [Path(p) for p in paths if "(Instrumental)" in Path(p).name or "_Instrumental" in Path(p).stem]
    if len(vocals) != 1 or len(instrumental) != 1:
        raise RuntimeError(f"AVANTIQO_VOCAL_ROLE_KARA_OUTPUT_AMBIGUOUS:vocals={len(vocals)}:instrumental={len(instrumental)}")
    return vocals[0], instrumental[0]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    args = parser.parse_args()
    payload = json.loads(Path(args.input).read_text(encoding="utf-8"))
    if text(payload.get("contract")) != CONTRACT:
        raise RuntimeError("AVANTIQO_VOCAL_ROLE_CONTRACT_INVALID")
    if text(payload.get("capability")) != CAPABILITY:
        raise RuntimeError("AVANTIQO_VOCAL_ROLE_CAPABILITY_INVALID")
    rights = obj(payload.get("rights_attestation"))
    if rights.get("confirmed") is not True:
        raise RuntimeError("AVANTIQO_VOCAL_ROLE_SOURCE_RIGHTS_REQUIRED")
    source_url = text(payload.get("source_audio"))
    uploads = obj(payload.get("output_uploads"))
    required_uploads = {name: obj(uploads.get(name)) for name in ("lead_vocal", "supporting_vocals", "instrumental", "role_report_json")}
    if not source_url or any(not text(v.get("signed_url")) or not text(v.get("storage_reference")) for v in required_uploads.values()):
        raise RuntimeError("AVANTIQO_VOCAL_ROLE_OUTPUT_UPLOADS_REQUIRED")

    started = time.perf_counter()
    with tempfile.TemporaryDirectory(prefix="avantiqo-vocal-role-") as tmp:
        root = Path(tmp)
        source = root / "source.wav"
        download(source_url, source)
        source_duration = duration_seconds(source)

        demucs_out = root / "demucs"
        demucs = subprocess.run([
            os.environ.get("PYTHON", "python"), "-m", "demucs.separate", "-n", STAGE1_MODEL,
            "--two-stems", "vocals", "-o", str(demucs_out), str(source),
        ], capture_output=True, text=True, timeout=1800, check=False)
        if demucs.returncode != 0:
            raise RuntimeError(f"AVANTIQO_VOCAL_ROLE_DEMUCS_FAILED:{demucs.stderr[-1200:]}")
        stem_dir = demucs_out / STAGE1_MODEL / source.stem
        all_vocals = stem_dir / "vocals.wav"
        instrumental = stem_dir / "no_vocals.wav"
        if not all_vocals.exists() or not instrumental.exists():
            raise RuntimeError("AVANTIQO_VOCAL_ROLE_STAGE1_OUTPUTS_REQUIRED")

        from audio_separator import Separator
        kara_out = root / "kara2"
        kara_out.mkdir(parents=True, exist_ok=True)
        separator = Separator(
            str(all_vocals),
            model_name=STAGE2_MODEL,
            model_file_dir=str(MODEL_DIR),
            output_dir=str(kara_out),
            use_cuda=True,
            output_format="WAV",
            normalization_enabled=False,
        )
        separated = separator.separate()
        lead_vocal, supporting_vocals = exact_role_outputs(separated)
        if not lead_vocal.exists() or not supporting_vocals.exists():
            raise RuntimeError("AVANTIQO_VOCAL_ROLE_STAGE2_OUTPUTS_REQUIRED")

        output_durations = {name: duration_seconds(path) for name, path in {
            "lead_vocal": lead_vocal,
            "supporting_vocals": supporting_vocals,
            "instrumental": instrumental,
        }.items()}
        max_drift_ms = max(abs(value - source_duration) * 1000.0 for value in output_durations.values())
        report = {
            "contract": "AVANTIQO_MUSIC_VOCAL_ROLE_SEPARATOR_REPORT_V1",
            "capability": CAPABILITY,
            "stage1": {"model": STAGE1_MODEL, "purpose": "FULL_MIX_TO_ALL_VOCALS_AND_INSTRUMENTAL"},
            "stage2": {"model": STAGE2_MODEL, "input": "ALL_VOCALS_ONLY", "vocals_output_role": "LEAD", "instrumental_output_role": "SUPPORTING_VOCALS"},
            "source_duration_seconds": round(source_duration, 6),
            "output_duration_seconds": {k: round(v, 6) for k, v in output_durations.items()},
            "maximum_duration_drift_ms": round(max_drift_ms, 3),
            "timing_preservation_review_required": True,
            "role_leakage_measurement_required": True,
            "human_listening_review_required": True,
            "model_license_verified": False,
            "production_certified": False,
            "production_routing_allowed": False,
            "ordinary_four_stem_substitution_forbidden": True,
        }
        report_path = root / "role-report.json"
        report_path.write_text(json.dumps(report, indent=2), encoding="utf-8")

        upload(required_uploads["lead_vocal"]["signed_url"], lead_vocal)
        upload(required_uploads["supporting_vocals"]["signed_url"], supporting_vocals)
        upload(required_uploads["instrumental"]["signed_url"], instrumental)
        upload(required_uploads["role_report_json"]["signed_url"], report_path, "application/json")

    print(json.dumps({
        "success": True,
        "contract": CONTRACT,
        "capability": CAPABILITY,
        "quality_profile": QUALITY_PROFILE,
        "stage1_model": STAGE1_MODEL,
        "stage2_model": STAGE2_MODEL,
        "source_duration_seconds": round(source_duration, 6),
        "maximum_duration_drift_ms": round(max_drift_ms, 3),
        "storage_references": {k: v["storage_reference"] for k, v in required_uploads.items()},
        "elapsed_ms": int((time.perf_counter() - started) * 1000),
        "research_candidate": True,
        "model_license_verified": False,
        "human_listening_review_required": True,
        "production_certified": False,
        "production_routing_allowed": False,
        "supplier_cost_thb": 0,
        "raw_reasoning_persisted": False,
    }, separators=(",", ":")))


if __name__ == "__main__":
    main()
