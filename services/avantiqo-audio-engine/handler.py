import ipaddress
import os
import time
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

import requests
import runpod
import torch
from acestep.handler import AceStepHandler
from acestep.inference import GenerationConfig, GenerationParams, generate_music

ENGINE_CONTRACT = "AVANTIQO_AUDIO_ENGINE_V1"
PRODUCT_MODEL = "avantiqo-music-v1"
MODEL_FAMILY = os.getenv("AVANTIQO_AUDIO_MODEL_FAMILY", "ACE_STEP_1_5").strip().upper()
FOUNDATION_MODEL = os.getenv("AVANTIQO_AUDIO_FOUNDATION_MODEL", "ACE-Step/Ace-Step1.5").strip()
MODEL_VARIANT = os.getenv("AVANTIQO_AUDIO_MODEL_VARIANT", "acestep-v15-turbo").strip()
PROJECT_ROOT = Path(os.getenv("ACESTEP_PROJECT_ROOT", "/opt/ace-step")).resolve()
OUTPUT_DIR = Path(os.getenv("AVANTIQO_AUDIO_OUTPUT_DIR", "/tmp/avantiqo-audio"))
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
DEVICE = os.getenv("AVANTIQO_AUDIO_DEVICE", "cuda").strip()
MODEL_SOURCE = os.getenv("AVANTIQO_AUDIO_MODEL_SOURCE", "huggingface").strip().lower()
MAX_DURATION_SECONDS = max(10, min(600, int(os.getenv("AVANTIQO_AUDIO_MAX_DURATION_SECONDS", "180"))))
MAX_SOURCE_BYTES = max(1_000_000, int(os.getenv("AVANTIQO_AUDIO_MAX_SOURCE_BYTES", "262144000")))
MODEL_WARM_FITNESS = os.getenv("AVANTIQO_AUDIO_FITNESS_LOAD_MODEL", "false").strip().lower() in {
    "1",
    "true",
    "yes",
    "on",
}
SUPPORTED_FOUNDATION_MODELS = {"ACE-Step/Ace-Step1.5"}
SUPPORTED_MODEL_VARIANTS = {"acestep-v15-turbo"}
IMPLEMENTED_CAPABILITIES = {
    "ai.music.generate",
    "ai.audio.remix",
    "ai.audio.edit",
}
DEFAULT_CERTIFIED_CAPABILITIES = {"ai.music.generate"}
CAPABILITY_TASK_TYPES = {
    "ai.music.generate": "text2music",
    "ai.audio.remix": "cover",
    "ai.audio.edit": "repaint",
}
_DIT_HANDLER: AceStepHandler | None = None


def _text(value: Any) -> str:
    return str(value or "").strip()


def _object(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _boolean(value: Any, default: bool = False) -> bool:
    if isinstance(value, bool):
        return value
    candidate = _text(value).lower()
    if not candidate:
        return default
    return candidate in {"1", "true", "yes", "on", "instrumental"}


def _number(value: Any, default: float | None = None) -> float | None:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return default
    return number if number == number and abs(number) != float("inf") else default


def _integer(value: Any, default: int | None = None) -> int | None:
    number = _number(value, None)
    return int(number) if number is not None else default


def _certified_capabilities() -> set[str]:
    configured = {
        item.strip()
        for item in os.getenv("AVANTIQO_AUDIO_CERTIFIED_CAPABILITIES", "").split(",")
        if item.strip()
    }
    if not configured:
        return set(DEFAULT_CERTIFIED_CAPABILITIES)
    unsupported = configured - IMPLEMENTED_CAPABILITIES
    if unsupported:
        raise RuntimeError(
            f"AVANTIQO_AUDIO_CERTIFIED_CAPABILITY_NOT_IMPLEMENTED:{','.join(sorted(unsupported))}"
        )
    if "ai.music.generate" not in configured:
        raise RuntimeError("AVANTIQO_AUDIO_MUSIC_GENERATION_CERTIFICATION_REQUIRED")
    return configured


def _public_https_url(value: Any, *, upload: bool = False, creative_source: bool = False) -> str:
    source = _text(value)
    parsed = urlparse(source)
    if parsed.scheme != "https" or not parsed.hostname:
        raise ValueError("AVANTIQO_AUDIO_HTTPS_URL_REQUIRED")
    host = parsed.hostname.lower()
    if host in {"localhost", "localhost.localdomain"} or host.endswith(".local"):
        raise ValueError("AVANTIQO_AUDIO_PRIVATE_URL_FORBIDDEN")
    try:
        literal = ipaddress.ip_address(host)
        if literal.is_private or literal.is_loopback or literal.is_link_local:
            raise ValueError("AVANTIQO_AUDIO_PRIVATE_URL_FORBIDDEN")
    except ValueError as exc:
        if str(exc) == "AVANTIQO_AUDIO_PRIVATE_URL_FORBIDDEN":
            raise
    if (upload or creative_source) and not (
        host.endswith(".supabase.co") or host.endswith(".storage.supabase.co")
    ):
        suffix = "SOURCE" if creative_source else "UPLOAD"
        raise ValueError(f"AVANTIQO_AUDIO_{suffix}_HOST_FORBIDDEN")
    return source


def _validate_model_contract() -> None:
    if MODEL_FAMILY != "ACE_STEP_1_5":
        raise RuntimeError("AVANTIQO_AUDIO_MODEL_FAMILY_NOT_SUPPORTED")
    if FOUNDATION_MODEL not in SUPPORTED_FOUNDATION_MODELS:
        raise RuntimeError("AVANTIQO_AUDIO_FOUNDATION_MODEL_NOT_CERTIFIED")
    if MODEL_VARIANT not in SUPPORTED_MODEL_VARIANTS:
        raise RuntimeError("AVANTIQO_AUDIO_MODEL_VARIANT_NOT_CERTIFIED")
    if MODEL_SOURCE not in {"huggingface", "modelscope"}:
        raise RuntimeError("AVANTIQO_AUDIO_MODEL_SOURCE_INVALID")
    _certified_capabilities()


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
        raise RuntimeError(f"AVANTIQO_AUDIO_MODEL_INITIALIZATION_FAILED:{detail}")
    _DIT_HANDLER = handler
    return handler


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


def _duration_seconds(objects: list[dict[str, Any]]) -> float:
    value = _first_value(
        objects,
        ("duration_seconds", "duration", "length_seconds", "target_duration_seconds"),
    )
    number = _number(value, 30.0) or 30.0
    return max(10.0, min(float(MAX_DURATION_SECONDS), number))


def _generation_request(data: dict[str, Any]) -> dict[str, Any]:
    spec = _object(data.get("structured_specification"))
    objects = _candidate_objects(spec)

    caption = _first_text(
        objects,
        (
            "caption",
            "description",
            "music_direction",
            "creative_direction",
            "style_description",
            "style",
            "genre",
            "mood",
        ),
    )
    if not caption:
        caption = _text(data.get("instruction"))
    caption = " ".join(caption.split())[:512]
    if not caption:
        raise ValueError("AVANTIQO_AUDIO_MUSIC_DIRECTION_REQUIRED")

    lyrics = _first_text(objects, ("lyrics", "lyric", "vocal_lyrics"))[:4096]
    explicit_instrumental = _first_value(objects, ("instrumental", "is_instrumental", "vocals_disabled"))
    instrumental = _boolean(explicit_instrumental, default=not bool(lyrics))
    if instrumental:
        lyrics = "[Instrumental]"

    bpm = _integer(_first_value(objects, ("bpm", "tempo_bpm", "tempo")), None)
    if bpm is not None and not 30 <= bpm <= 300:
        raise ValueError("AVANTIQO_AUDIO_BPM_INVALID")

    keyscale = _first_text(objects, ("keyscale", "key_scale", "musical_key", "key"))[:32]
    timesignature = _first_text(objects, ("timesignature", "time_signature", "meter"))[:8]
    if timesignature in {"2/4", "3/4", "4/4", "6/8"}:
        timesignature = timesignature.split("/", 1)[0]
    if timesignature and timesignature not in {"2", "3", "4", "6"}:
        raise ValueError("AVANTIQO_AUDIO_TIME_SIGNATURE_INVALID")

    vocal_language = _first_text(objects, ("vocal_language", "language", "lyrics_language"))
    vocal_language = vocal_language.lower()[:16] if vocal_language else "unknown"
    if instrumental:
        vocal_language = "unknown"

    seed = _integer(_first_value(objects, ("seed", "generation_seed")), None)
    if seed is not None and not 0 <= seed <= 4294967295:
        raise ValueError("AVANTIQO_AUDIO_SEED_INVALID")

    inference_steps = _integer(_first_value(objects, ("inference_steps", "steps")), 8) or 8
    inference_steps = max(1, min(20, inference_steps))
    shift = _number(_first_value(objects, ("shift",)), 3.0) or 3.0
    shift = max(1.0, min(5.0, shift))
    cover_strength = _number(
        _first_value(objects, ("audio_cover_strength", "cover_strength", "source_strength")),
        0.6,
    )
    cover_strength = max(0.0, min(1.0, cover_strength if cover_strength is not None else 0.6))
    repaint_start = _number(
        _first_value(objects, ("repainting_start", "repaint_start", "edit_start_seconds")),
        0.0,
    )
    repaint_end = _number(
        _first_value(objects, ("repainting_end", "repaint_end", "edit_end_seconds")),
        -1.0,
    )
    repaint_start = max(0.0, repaint_start if repaint_start is not None else 0.0)
    repaint_end = repaint_end if repaint_end is not None else -1.0
    if data["capability"] == "ai.audio.edit" and repaint_end >= 0 and repaint_end <= repaint_start:
        raise ValueError("AVANTIQO_AUDIO_REPAINT_RANGE_INVALID")

    return {
        "task_type": CAPABILITY_TASK_TYPES[data["capability"]],
        "caption": caption,
        "lyrics": lyrics,
        "instrumental": instrumental,
        "bpm": bpm,
        "keyscale": keyscale,
        "timesignature": timesignature,
        "vocal_language": vocal_language,
        "duration": _duration_seconds(objects),
        "seed": seed,
        "inference_steps": inference_steps,
        "shift": shift,
        "audio_cover_strength": cover_strength,
        "repainting_start": repaint_start,
        "repainting_end": repaint_end,
    }


def _validated_input(job: dict[str, Any]) -> dict[str, Any]:
    data = _object(job.get("input"))
    if data.get("contract") != ENGINE_CONTRACT:
        raise ValueError("AVANTIQO_AUDIO_ENGINE_CONTRACT_INVALID")
    capability = _text(data.get("capability"))
    if capability not in IMPLEMENTED_CAPABILITIES:
        raise ValueError("AVANTIQO_AUDIO_CAPABILITY_NOT_IMPLEMENTED")
    if capability not in _certified_capabilities():
        raise ValueError("AVANTIQO_AUDIO_CAPABILITY_NOT_CERTIFIED")
    instruction = _text(data.get("instruction"))
    if len(instruction) > 12000:
        raise ValueError("AVANTIQO_AUDIO_INSTRUCTION_TOO_LONG")
    storage = _object(data.get("storage_upload"))
    signed_url = _public_https_url(storage.get("signed_url"), upload=True)
    storage_reference = _text(storage.get("storage_reference"))
    if not storage_reference.startswith("storage://creative-assets/"):
        raise ValueError("AVANTIQO_AUDIO_STORAGE_REFERENCE_INVALID")
    return {
        **data,
        "capability": capability,
        "storage_upload": {
            **storage,
            "signed_url": signed_url,
            "storage_reference": storage_reference,
        },
    }


def _source_audio_url(data: dict[str, Any]) -> str:
    roles = _object(data.get("source_asset_roles"))
    candidate = _text(roles.get("source_audio"))
    if not candidate:
        assets = data.get("source_assets")
        if isinstance(assets, list) and assets:
            candidate = _text(assets[0])
    if not candidate:
        raise ValueError("AVANTIQO_AUDIO_SOURCE_AUDIO_REQUIRED")
    return _public_https_url(candidate, creative_source=True)


def _download_source_audio(data: dict[str, Any], job_output_dir: Path) -> Path:
    source_url = _source_audio_url(data)
    parsed = urlparse(source_url)
    suffix = Path(parsed.path).suffix.lower()
    if suffix not in {".wav", ".mp3", ".m4a", ".aac", ".flac", ".ogg", ".opus"}:
        suffix = ".audio"
    target = (job_output_dir / f"source{suffix}").resolve()
    target.relative_to(job_output_dir.resolve())

    response = requests.get(source_url, stream=True, timeout=300, allow_redirects=False)
    if not response.ok:
        detail = response.text[:500].replace("\n", " ")
        raise RuntimeError(f"AVANTIQO_AUDIO_SOURCE_DOWNLOAD_FAILED:{response.status_code}:{detail}")
    content_length = _integer(response.headers.get("content-length"), None)
    if content_length is not None and content_length > MAX_SOURCE_BYTES:
        raise RuntimeError("AVANTIQO_AUDIO_SOURCE_TOO_LARGE")

    total = 0
    with target.open("wb") as handle:
        for chunk in response.iter_content(chunk_size=1024 * 1024):
            if not chunk:
                continue
            total += len(chunk)
            if total > MAX_SOURCE_BYTES:
                raise RuntimeError("AVANTIQO_AUDIO_SOURCE_TOO_LARGE")
            handle.write(chunk)
    if total <= 44:
        raise RuntimeError("AVANTIQO_AUDIO_SOURCE_INVALID")
    return target


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
        raise RuntimeError(f"AVANTIQO_AUDIO_STORAGE_UPLOAD_FAILED:{response.status_code}:{detail}")


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
    request = _generation_request(data)
    started = time.perf_counter()

    runpod.serverless.progress_update(job, "loading Avantiqo Music")
    dit_handler = _dit_handler()

    job_id = _text(job.get("id")) or str(int(time.time() * 1000))
    job_output_dir = OUTPUT_DIR / job_id
    job_output_dir.mkdir(parents=True, exist_ok=True)
    source_path: Path | None = None

    try:
        if request["task_type"] != "text2music":
            runpod.serverless.progress_update(job, "preparing private source audio")
            source_path = _download_source_audio(data, job_output_dir)

        params = GenerationParams(
            task_type=request["task_type"],
            src_audio=str(source_path) if source_path else None,
            caption=request["caption"],
            lyrics=request["lyrics"],
            instrumental=request["instrumental"],
            vocal_language=request["vocal_language"],
            bpm=request["bpm"],
            keyscale=request["keyscale"],
            timesignature=request["timesignature"],
            duration=request["duration"],
            inference_steps=request["inference_steps"],
            seed=request["seed"] if request["seed"] is not None else -1,
            guidance_scale=1.0,
            shift=request["shift"],
            repainting_start=request["repainting_start"],
            repainting_end=request["repainting_end"],
            audio_cover_strength=request["audio_cover_strength"],
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

        progress = {
            "text2music": "generating music",
            "cover": "creating owned remix",
            "repaint": "repairing selected audio region",
        }[request["task_type"]]
        runpod.serverless.progress_update(job, progress)
        result = generate_music(
            dit_handler,
            None,
            params,
            config,
            save_dir=str(job_output_dir),
        )
        if not result.success or not result.audios:
            detail = _text(result.error or result.status_message).replace("\n", " ")[:1000]
            raise RuntimeError(f"AVANTIQO_AUDIO_GENERATION_FAILED:{detail}")

        audio_info = _object(result.audios[0])
        path = Path(_text(audio_info.get("path"))).resolve()
        try:
            path.relative_to(job_output_dir.resolve())
        except ValueError as exc:
            raise RuntimeError("AVANTIQO_AUDIO_OUTPUT_PATH_INVALID") from exc
        if not path.is_file() or path.stat().st_size <= 44:
            raise RuntimeError("AVANTIQO_AUDIO_OUTPUT_INVALID")

        sample_rate = _integer(audio_info.get("sample_rate"), getattr(dit_handler, "sample_rate", 48000)) or 48000
        tensor = audio_info.get("tensor")
        actual_duration = request["duration"]
        if tensor is not None and getattr(tensor, "shape", None) and sample_rate > 0:
            actual_duration = float(tensor.shape[-1]) / float(sample_rate)

        resolved_seed = request["seed"]
        audio_params = _object(audio_info.get("params"))
        if resolved_seed is None:
            resolved_seed = _integer(audio_params.get("seed"), None)

        runpod.serverless.progress_update(job, "storing private Avantiqo asset")
        _upload(path, data["storage_upload"])
        size_bytes = path.stat().st_size

        return {
            "status": "completed",
            "provider": "avantiqo-audio",
            "model": PRODUCT_MODEL,
            "model_family": MODEL_FAMILY,
            "model_variant": MODEL_VARIANT,
            "engine_contract": ENGINE_CONTRACT,
            "capability": data["capability"],
            "task_type": request["task_type"],
            "storage_reference": data["storage_upload"]["storage_reference"],
            "foundation_model": FOUNDATION_MODEL,
            "duration_seconds": round(actual_duration, 3),
            "sample_rate": sample_rate,
            "seed": resolved_seed,
            "size_bytes": size_bytes,
            "generation_seconds": round(time.perf_counter() - started, 3),
            "source_audio_used": source_path is not None,
            "audio_cover_strength": request["audio_cover_strength"] if request["task_type"] == "cover" else None,
            "repainting_start": request["repainting_start"] if request["task_type"] == "repaint" else None,
            "repainting_end": request["repainting_end"] if request["task_type"] == "repaint" else None,
            "ace_step_lm_used": False,
            "raw_reasoning_persisted": False,
            "generation_input_persisted": False,
        }
    finally:
        _cleanup_job_dir(job_output_dir)


@runpod.serverless.register_fitness_check
def check_worker():
    _validate_model_contract()
    if not torch.cuda.is_available():
        raise RuntimeError("AVANTIQO_AUDIO_CUDA_REQUIRED")
    if MODEL_WARM_FITNESS:
        _dit_handler()


if __name__ == "__main__":
    runpod.serverless.start({"handler": handler})
