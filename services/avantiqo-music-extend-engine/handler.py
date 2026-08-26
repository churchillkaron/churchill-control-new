import ipaddress
import os
import subprocess
import time
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

import requests
import runpod
import torch
from acestep.handler import AceStepHandler
from acestep.inference import GenerationConfig, GenerationParams, generate_music

ENGINE_CONTRACT = "AVANTIQO_MUSIC_EXTEND_ENGINE_V1"
CERTIFICATION_JOB_CONTRACT = "AVANTIQO_MUSIC_EXTEND_CERTIFICATION_JOB_V1"
SAFE_LEASE_CONTRACT = "AVANTIQO_RUNPOD_SAFE_LEASE_V2"
SAFE_LEASE_LANE = "music-extend"
PRODUCT_MODEL = "avantiqo-music-extend-v1"
QUALITY_PROFILE = "ACE_STEP_1_5_BASE_COMPLETE_V1"
FOUNDATION_MODEL = os.getenv("AVANTIQO_MUSIC_EXTEND_FOUNDATION_MODEL", "ACE-Step/Ace-Step1.5").strip()
MODEL_FAMILY = os.getenv("AVANTIQO_MUSIC_EXTEND_MODEL_FAMILY", "ACE_STEP_1_5").strip().upper()
MODEL_VARIANT = os.getenv("AVANTIQO_MUSIC_EXTEND_MODEL_VARIANT", "acestep-v15-base").strip()
PROJECT_ROOT = Path(os.getenv("ACESTEP_PROJECT_ROOT", "/opt/ace-step")).resolve()
CHECKPOINT_DIR = Path(
    os.getenv("ACESTEP_CHECKPOINTS_DIR", str(PROJECT_ROOT / "checkpoints"))
).resolve()
OUTPUT_DIR = Path(os.getenv("AVANTIQO_MUSIC_EXTEND_OUTPUT_DIR", "/tmp/avantiqo-music-extend"))
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
DEVICE = os.getenv("AVANTIQO_MUSIC_EXTEND_DEVICE", "cuda").strip()
MODEL_SOURCE = os.getenv("AVANTIQO_MUSIC_EXTEND_MODEL_SOURCE", "huggingface").strip().lower()
MAX_DURATION_SECONDS = max(10, min(600, int(os.getenv("AVANTIQO_MUSIC_EXTEND_MAX_DURATION_SECONDS", "600"))))
MAX_SOURCE_BYTES = max(1_000_000, int(os.getenv("AVANTIQO_MUSIC_EXTEND_MAX_SOURCE_BYTES", "629145600")))
PRODUCTION_CERTIFIED = os.getenv("AVANTIQO_MUSIC_EXTEND_PRODUCTION_CERTIFIED", "false").strip().lower() in {
    "1",
    "true",
    "yes",
    "on",
}
INIT_LLM = os.getenv("ACESTEP_INIT_LLM", "false").strip().lower() in {
    "1",
    "true",
    "yes",
    "on",
}
SUPPORTED_TRACK_CLASSES = frozenset(
    {
        "woodwinds",
        "brass",
        "fx",
        "synth",
        "strings",
        "percussion",
        "keyboard",
        "guitar",
        "bass",
        "drums",
        "backing_vocals",
        "vocals",
    }
)
DEFAULT_TRACK_CLASSES = ("drums", "bass", "guitar", "keyboard")
_DIT_HANDLER: AceStepHandler | None = None


def _text(value: Any) -> str:
    return str(value or "").strip()


def _object(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _list(value: Any) -> list[Any]:
    return value if isinstance(value, list) else []


def _number(value: Any, default: float | None = None) -> float | None:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return default
    return number if number == number and abs(number) != float("inf") else default


def _integer(value: Any, default: int | None = None) -> int | None:
    number = _number(value, None)
    return int(number) if number is not None else default


def _boolean(value: Any, default: bool = False) -> bool:
    if isinstance(value, bool):
        return value
    candidate = _text(value).lower()
    if not candidate:
        return default
    return candidate in {"1", "true", "yes", "on"}


def _validate_model_contract() -> None:
    if FOUNDATION_MODEL != "ACE-Step/Ace-Step1.5":
        raise RuntimeError("AVANTIQO_MUSIC_EXTEND_FOUNDATION_MODEL_INVALID")
    if MODEL_FAMILY != "ACE_STEP_1_5":
        raise RuntimeError("AVANTIQO_MUSIC_EXTEND_MODEL_FAMILY_INVALID")
    if MODEL_VARIANT != "acestep-v15-base":
        raise RuntimeError("AVANTIQO_MUSIC_EXTEND_BASE_MODEL_REQUIRED")
    if MODEL_SOURCE not in {"huggingface", "modelscope"}:
        raise RuntimeError("AVANTIQO_MUSIC_EXTEND_MODEL_SOURCE_INVALID")
    if INIT_LLM:
        raise RuntimeError("AVANTIQO_MUSIC_EXTEND_LM_FORBIDDEN_FOR_PINNED_DIRECT_CONDITIONING")


def _certification_access(data: dict[str, Any]) -> dict[str, Any]:
    if PRODUCTION_CERTIFIED:
        return {
            "candidate": False,
            "production_certified": True,
            "human_review_required": False,
            "activation_allowed": True,
            "contract": None,
        }

    context = _object(data.get("certification"))
    checks = {
        "contract": _text(context.get("contract")) == CERTIFICATION_JOB_CONTRACT,
        "scope": _text(context.get("scope")) == "music-extend-only",
        "capability": _text(context.get("capability")) == "ai.audio.extend",
        "task_type": _text(context.get("task_type")) == "complete",
        "candidate": context.get("candidate") is True,
        "provider_spend_approved": context.get("provider_spend_approved") is True,
        "source_rights_confirmed": context.get("source_rights_confirmed") is True,
        "safe_lease_contract": _text(context.get("safe_lease_contract")) == SAFE_LEASE_CONTRACT,
        "safe_lease_lane": _text(context.get("safe_lease_lane")) == SAFE_LEASE_LANE,
        "max_provider_jobs": _integer(context.get("max_provider_jobs"), 0) == 1,
        "benchmark_runs": _integer(context.get("benchmark_runs"), 0) == 1,
        "human_review_required": context.get("human_review_required") is True,
        "automatic_human_review_approved": context.get("automatic_human_review_approved") is False,
        "production_activation_allowed": context.get("production_activation_allowed") is False,
        "pricing_activation_allowed": context.get("pricing_activation_allowed") is False,
        "provider_selection_change_allowed": context.get("provider_selection_change_allowed") is False,
    }
    failures = [name for name, passed in checks.items() if not passed]
    if failures:
        raise ValueError(
            f"AVANTIQO_MUSIC_EXTEND_CERTIFICATION_CONTEXT_INVALID:{','.join(failures)}"
        )
    return {
        "candidate": True,
        "production_certified": False,
        "human_review_required": True,
        "activation_allowed": False,
        "contract": CERTIFICATION_JOB_CONTRACT,
        "safe_lease_contract": SAFE_LEASE_CONTRACT,
        "safe_lease_lane": SAFE_LEASE_LANE,
        "max_provider_jobs": 1,
    }


def _public_https_url(value: Any, *, upload: bool = False, creative_source: bool = False) -> str:
    source = _text(value)
    parsed = urlparse(source)
    if parsed.scheme != "https" or not parsed.hostname:
        raise ValueError("AVANTIQO_MUSIC_EXTEND_HTTPS_URL_REQUIRED")
    host = parsed.hostname.lower()
    if host in {"localhost", "localhost.localdomain"} or host.endswith(".local"):
        raise ValueError("AVANTIQO_MUSIC_EXTEND_PRIVATE_URL_FORBIDDEN")
    try:
        literal = ipaddress.ip_address(host)
        if literal.is_private or literal.is_loopback or literal.is_link_local:
            raise ValueError("AVANTIQO_MUSIC_EXTEND_PRIVATE_URL_FORBIDDEN")
    except ValueError as exc:
        if str(exc) == "AVANTIQO_MUSIC_EXTEND_PRIVATE_URL_FORBIDDEN":
            raise
    if (upload or creative_source) and not (
        host.endswith(".supabase.co") or host.endswith(".storage.supabase.co")
    ):
        suffix = "SOURCE" if creative_source else "UPLOAD"
        raise ValueError(f"AVANTIQO_MUSIC_EXTEND_{suffix}_HOST_FORBIDDEN")
    return source


def _candidate_objects(spec: dict[str, Any]) -> list[dict[str, Any]]:
    values = [
        spec,
        _object(spec.get("music")),
        _object(spec.get("music_spec")),
        _object(spec.get("music_specification")),
        _object(spec.get("creative_direction")),
        _object(spec.get("generation")),
        _object(spec.get("requirements")),
        _object(spec.get("output_spec")),
        _object(spec.get("provider_parameters")),
    ]
    return [value for value in values if value]


def _first_text(objects: list[dict[str, Any]], keys: tuple[str, ...]) -> str:
    for obj in objects:
        for key in keys:
            candidate = _text(obj.get(key))
            if candidate:
                return candidate
    return ""


def _first_value(objects: list[dict[str, Any]], keys: tuple[str, ...]) -> Any:
    for obj in objects:
        for key in keys:
            if key in obj and obj.get(key) is not None:
                return obj.get(key)
    return None


def _normalize_track_classes(objects: list[dict[str, Any]]) -> list[str]:
    raw = _first_value(objects, ("complete_track_classes", "track_classes", "tracks", "instruments_to_add"))
    supplied: list[str]
    if isinstance(raw, str):
        supplied = [item.strip().lower() for item in raw.split(",") if item.strip()]
    elif isinstance(raw, list):
        supplied = [_text(item).lower() for item in raw if _text(item)]
    else:
        instrumentation = _first_text(objects, ("instrumentation", "instruments"))
        lowered = instrumentation.lower()
        supplied = [track for track in SUPPORTED_TRACK_CLASSES if track in lowered]
    if not supplied:
        supplied = list(DEFAULT_TRACK_CLASSES)
    unknown = sorted({item for item in supplied if item not in SUPPORTED_TRACK_CLASSES})
    if unknown:
        raise ValueError(f"AVANTIQO_MUSIC_EXTEND_TRACK_CLASS_INVALID:{','.join(unknown)}")
    unique: list[str] = []
    for item in supplied:
        if item not in unique:
            unique.append(item)
    return unique[:8]


def _caption(objects: list[dict[str, Any]]) -> str:
    direct = _first_text(objects, ("caption", "description", "music_direction", "creative_direction"))
    if direct:
        return " ".join(direct.split())[:512]
    parts = [
        _first_text(objects, ("style", "genre")),
        _first_text(objects, ("mood",)),
        _first_text(objects, ("energy",)),
        _first_text(objects, ("instrumentation", "instruments")),
    ]
    caption = ", ".join(part for part in parts if part)
    if not caption:
        raise ValueError("AVANTIQO_MUSIC_EXTEND_STRUCTURED_DIRECTION_REQUIRED")
    return " ".join(caption.split())[:512]


def _validated_input(job: dict[str, Any]) -> dict[str, Any]:
    data = _object(job.get("input"))
    if _text(data.get("contract")) != ENGINE_CONTRACT:
        raise ValueError("AVANTIQO_MUSIC_EXTEND_ENGINE_CONTRACT_INVALID")
    if _text(data.get("capability")) != "ai.audio.extend":
        raise ValueError("AVANTIQO_MUSIC_EXTEND_CAPABILITY_INVALID")
    certification = _certification_access(data)
    rights = _object(data.get("rights_attestation"))
    if rights.get("confirmed") is not True:
        raise ValueError("AVANTIQO_MUSIC_EXTEND_SOURCE_RIGHTS_CONFIRMATION_REQUIRED")
    storage = _object(data.get("storage_upload"))
    signed_url = _public_https_url(storage.get("signed_url"), upload=True)
    storage_reference = _text(storage.get("storage_reference"))
    if not storage_reference.startswith("storage://creative-assets/"):
        raise ValueError("AVANTIQO_MUSIC_EXTEND_STORAGE_REFERENCE_INVALID")
    source_url = _public_https_url(data.get("source_audio_url"), creative_source=True)
    spec = _object(data.get("structured_specification"))
    objects = _candidate_objects(spec)
    track_classes = _normalize_track_classes(objects)
    caption = _caption(objects)
    inference_steps = _integer(_first_value(objects, ("inference_steps", "steps")), 60) or 60
    inference_steps = max(32, min(100, inference_steps))
    guidance_scale = _number(_first_value(objects, ("guidance_scale", "cfg_scale")), 7.0) or 7.0
    guidance_scale = max(1.0, min(15.0, guidance_scale))
    seed = _integer(_first_value(objects, ("seed", "generation_seed")), None)
    if seed is not None and not 0 <= seed <= 4294967295:
        raise ValueError("AVANTIQO_MUSIC_EXTEND_SEED_INVALID")
    requested_duration = _number(
        _first_value(objects, ("duration_seconds", "duration", "target_duration_seconds")),
        None,
    )
    if requested_duration is not None and not 10 <= requested_duration <= MAX_DURATION_SECONDS:
        raise ValueError("AVANTIQO_MUSIC_EXTEND_DURATION_INVALID")
    return {
        **data,
        "certification_access": certification,
        "source_audio_url": source_url,
        "storage_upload": {
            **storage,
            "signed_url": signed_url,
            "storage_reference": storage_reference,
        },
        "request": {
            "caption": caption,
            "track_classes": track_classes,
            "inference_steps": inference_steps,
            "guidance_scale": guidance_scale,
            "seed": seed,
            "requested_duration": requested_duration,
        },
    }


def _download_source_audio(data: dict[str, Any], job_output_dir: Path) -> Path:
    source_url = data["source_audio_url"]
    parsed = urlparse(source_url)
    suffix = Path(parsed.path).suffix.lower()
    if suffix not in {".wav", ".mp3", ".m4a", ".aac", ".flac", ".ogg", ".opus"}:
        suffix = ".audio"
    target = (job_output_dir / f"source{suffix}").resolve()
    target.relative_to(job_output_dir.resolve())
    response = requests.get(source_url, stream=True, timeout=300, allow_redirects=False)
    if not response.ok:
        detail = response.text[:500].replace("\n", " ")
        raise RuntimeError(f"AVANTIQO_MUSIC_EXTEND_SOURCE_DOWNLOAD_FAILED:{response.status_code}:{detail}")
    content_length = _integer(response.headers.get("content-length"), None)
    if content_length is not None and content_length > MAX_SOURCE_BYTES:
        raise RuntimeError("AVANTIQO_MUSIC_EXTEND_SOURCE_TOO_LARGE")
    total = 0
    with target.open("wb") as handle:
        for chunk in response.iter_content(chunk_size=1024 * 1024):
            if not chunk:
                continue
            total += len(chunk)
            if total > MAX_SOURCE_BYTES:
                raise RuntimeError("AVANTIQO_MUSIC_EXTEND_SOURCE_TOO_LARGE")
            handle.write(chunk)
    if total <= 44:
        raise RuntimeError("AVANTIQO_MUSIC_EXTEND_SOURCE_INVALID")
    return target


def _audio_duration_seconds(path: Path) -> float:
    result = subprocess.run(
        [
            "ffprobe",
            "-v",
            "error",
            "-show_entries",
            "format=duration",
            "-of",
            "default=noprint_wrappers=1:nokey=1",
            str(path),
        ],
        capture_output=True,
        text=True,
        timeout=30,
        check=False,
    )
    duration = _number(result.stdout.strip(), None) if result.returncode == 0 else None
    if duration is None or duration <= 0:
        raise RuntimeError("AVANTIQO_MUSIC_EXTEND_SOURCE_DURATION_UNAVAILABLE")
    if duration > MAX_DURATION_SECONDS:
        raise RuntimeError("AVANTIQO_MUSIC_EXTEND_SOURCE_DURATION_TOO_LONG")
    return max(10.0, duration)


def _dit_handler() -> AceStepHandler:
    global _DIT_HANDLER
    if _DIT_HANDLER is not None:
        return _DIT_HANDLER
    _validate_model_contract()
    handler = AceStepHandler()
    status, success = handler.initialize_service(
        project_root=str(PROJECT_ROOT),
        config_path=MODEL_VARIANT,
        device=DEVICE,
        use_flash_attention=False,
        compile_model=False,
        offload_to_cpu=False,
        offload_dit_to_cpu=False,
        quantization=None,
        prefer_source=MODEL_SOURCE,
        use_mlx_dit=False,
    )
    if not success:
        detail = _text(status).replace("\n", " ")[:1000]
        raise RuntimeError(f"AVANTIQO_MUSIC_EXTEND_MODEL_INITIALIZATION_FAILED:{detail}")
    _DIT_HANDLER = handler
    return handler


def _upload(path: Path, storage: dict[str, Any]) -> None:
    with path.open("rb") as handle:
        response = requests.put(
            storage["signed_url"],
            data=handle,
            headers={"content-type": "audio/wav", "x-upsert": "false"},
            timeout=300,
        )
    if not response.ok:
        detail = response.text[:500].replace("\n", " ")
        raise RuntimeError(f"AVANTIQO_MUSIC_EXTEND_STORAGE_UPLOAD_FAILED:{response.status_code}:{detail}")


def _cleanup_job_dir(job_output_dir: Path) -> None:
    try:
        for candidate in job_output_dir.iterdir():
            if candidate.is_file():
                candidate.unlink(missing_ok=True)
        job_output_dir.rmdir()
    except OSError:
        pass


def handler(job: dict[str, Any]) -> dict[str, Any]:
    data = _validated_input(job)
    request = data["request"]
    started = time.perf_counter()
    runpod.serverless.progress_update(job, "loading Avantiqo Music Extend base model")
    dit_handler = _dit_handler()

    job_id = _text(job.get("id")) or str(int(time.time() * 1000))
    job_output_dir = OUTPUT_DIR / job_id
    job_output_dir.mkdir(parents=True, exist_ok=True)
    try:
        runpod.serverless.progress_update(job, "preparing private source audio")
        source_path = _download_source_audio(data, job_output_dir)
        source_duration = _audio_duration_seconds(source_path)
        duration = request["requested_duration"] or source_duration
        duration = max(10.0, min(float(MAX_DURATION_SECONDS), float(duration)))
        instruction = "Complete the input track with " + " | ".join(
            item.upper() for item in request["track_classes"]
        ) + ":"

        params = GenerationParams(
            task_type="complete",
            instruction=instruction,
            src_audio=str(source_path),
            caption=request["caption"],
            lyrics="[Instrumental]",
            instrumental=True,
            vocal_language="unknown",
            duration=duration,
            inference_steps=request["inference_steps"],
            seed=request["seed"] if request["seed"] is not None else -1,
            guidance_scale=request["guidance_scale"],
            shift=1.0,
            thinking=False,
            use_cot_metas=False,
            use_cot_caption=False,
            use_cot_lyrics=False,
            use_cot_language=False,
            use_constrained_decoding=False,
            enable_normalization=True,
            normalization_db=-1.0,
        )
        config = GenerationConfig(
            batch_size=1,
            allow_lm_batch=False,
            use_random_seed=request["seed"] is None,
            seeds=[request["seed"]] if request["seed"] is not None else None,
            constrained_decoding_debug=False,
            audio_format="wav",
        )

        runpod.serverless.progress_update(job, "completing partial music arrangement")
        result = generate_music(
            dit_handler,
            None,
            params,
            config,
            save_dir=str(job_output_dir),
        )
        if not result.success or not result.audios:
            detail = _text(result.error or result.status_message).replace("\n", " ")[:1000]
            raise RuntimeError(f"AVANTIQO_MUSIC_EXTEND_GENERATION_FAILED:{detail}")

        audio_info = _object(result.audios[0])
        path = Path(_text(audio_info.get("path"))).resolve()
        try:
            path.relative_to(job_output_dir.resolve())
        except ValueError as exc:
            raise RuntimeError("AVANTIQO_MUSIC_EXTEND_OUTPUT_PATH_INVALID") from exc
        if not path.is_file() or path.stat().st_size <= 44:
            raise RuntimeError("AVANTIQO_MUSIC_EXTEND_OUTPUT_INVALID")

        sample_rate = _integer(audio_info.get("sample_rate"), getattr(dit_handler, "sample_rate", 48000)) or 48000
        output_duration = _audio_duration_seconds(path)
        audio_params = _object(audio_info.get("params"))
        resolved_seed = request["seed"] if request["seed"] is not None else _integer(audio_params.get("seed"), None)

        runpod.serverless.progress_update(job, "storing private Avantiqo Music asset")
        _upload(path, data["storage_upload"])
        certification = _object(data.get("certification_access"))
        return {
            "status": "completed",
            "provider": "avantiqo-music-extend",
            "model": PRODUCT_MODEL,
            "model_family": MODEL_FAMILY,
            "model_variant": MODEL_VARIANT,
            "foundation_model": FOUNDATION_MODEL,
            "quality_profile": QUALITY_PROFILE,
            "engine_contract": ENGINE_CONTRACT,
            "capability": "ai.audio.extend",
            "task_type": "complete",
            "storage_reference": data["storage_upload"]["storage_reference"],
            "source_audio_used": True,
            "source_duration_seconds": round(source_duration, 3),
            "duration_seconds": round(output_duration, 3),
            "sample_rate": sample_rate,
            "seed": resolved_seed,
            "size_bytes": path.stat().st_size,
            "generation_seconds": round(time.perf_counter() - started, 3),
            "complete_track_classes": request["track_classes"],
            "arrangement_completion": True,
            "temporal_extension_proven": False,
            "ace_step_lm_used": False,
            "certification_candidate": certification.get("candidate") is True,
            "production_certified": certification.get("production_certified") is True,
            "certification_contract": certification.get("contract"),
            "human_review_required": certification.get("human_review_required") is True,
            "activation_allowed": certification.get("activation_allowed") is True,
            "raw_reasoning_persisted": False,
            "generation_input_persisted": False,
        }
    finally:
        _cleanup_job_dir(job_output_dir)


@runpod.serverless.register_fitness_check
def check_worker():
    _validate_model_contract()
    if not torch.cuda.is_available():
        raise RuntimeError("AVANTIQO_MUSIC_EXTEND_CUDA_REQUIRED")


if __name__ == "__main__":
    runpod.serverless.start({"handler": handler})
