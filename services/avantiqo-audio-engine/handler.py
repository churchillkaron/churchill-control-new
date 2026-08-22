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
MODEL_WARM_FITNESS = os.getenv("AVANTIQO_AUDIO_FITNESS_LOAD_MODEL", "false").strip().lower() in {
    "1",
    "true",
    "yes",
    "on",
}
SUPPORTED_FOUNDATION_MODELS = {"ACE-Step/Ace-Step1.5"}
SUPPORTED_MODEL_VARIANTS = {"acestep-v15-turbo"}
CERTIFIED_CAPABILITIES = {"ai.music.generate"}
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


def _public_https_url(value: Any, *, upload: bool = False) -> str:
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
    if upload and not (host.endswith(".supabase.co") or host.endswith(".storage.supabase.co")):
        raise ValueError("AVANTIQO_AUDIO_UPLOAD_HOST_FORBIDDEN")
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


def _music_request(data: dict[str, Any]) -> dict[str, Any]:
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

    return {
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
    }


def _validated_input(job: dict[str, Any]) -> dict[str, Any]:
    data = _object(job.get("input"))
    if data.get("contract") != ENGINE_CONTRACT:
        raise ValueError("AVANTIQO_AUDIO_ENGINE_CONTRACT_INVALID")
    capability = _text(data.get("capability"))
    if capability not in CERTIFIED_CAPABILITIES:
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


def handler(job: dict[str, Any]) -> dict[str, Any]:
    data = _validated_input(job)
    request = _music_request(data)
    started = time.perf_counter()

    runpod.serverless.progress_update(job, "loading Avantiqo Music")
    dit_handler = _dit_handler()

    job_id = _text(job.get("id")) or str(int(time.time() * 1000))
    job_output_dir = OUTPUT_DIR / job_id
    job_output_dir.mkdir(parents=True, exist_ok=True)

    params = GenerationParams(
        task_type="text2music",
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

    runpod.serverless.progress_update(job, "generating music")
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

    try:
        for candidate in job_output_dir.iterdir():
            if candidate.is_file():
                candidate.unlink(missing_ok=True)
        job_output_dir.rmdir()
    except OSError:
        pass

    return {
        "status": "completed",
        "provider": "avantiqo-audio",
        "model": PRODUCT_MODEL,
        "model_family": MODEL_FAMILY,
        "model_variant": MODEL_VARIANT,
        "engine_contract": ENGINE_CONTRACT,
        "capability": data["capability"],
        "storage_reference": data["storage_upload"]["storage_reference"],
        "foundation_model": FOUNDATION_MODEL,
        "duration_seconds": round(actual_duration, 3),
        "sample_rate": sample_rate,
        "seed": resolved_seed,
        "size_bytes": size_bytes,
        "generation_seconds": round(time.perf_counter() - started, 3),
        "ace_step_lm_used": False,
        "raw_reasoning_persisted": False,
        "generation_input_persisted": False,
    }


@runpod.serverless.register_fitness_check
def check_worker():
    _validate_model_contract()
    if not torch.cuda.is_available():
        raise RuntimeError("AVANTIQO_AUDIO_CUDA_REQUIRED")
    if MODEL_WARM_FITNESS:
        _dit_handler()


if __name__ == "__main__":
    runpod.serverless.start({"handler": handler})
