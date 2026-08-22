import ipaddress
import os
import time
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

import requests
import runpod
import torch
from diffusers import AudioLDM2Pipeline
from scipy.io import wavfile

ENGINE_CONTRACT = "AVANTIQO_AUDIO_ENGINE_V1"
PRODUCT_MODEL = "avantiqo-audio-v1"
OUTPUT_DIR = Path(os.getenv("AVANTIQO_AUDIO_OUTPUT_DIR", "/tmp/avantiqo-audio"))
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
DEVICE = os.getenv("AVANTIQO_AUDIO_DEVICE", "cuda")
DTYPE = torch.bfloat16 if os.getenv("AVANTIQO_AUDIO_DTYPE", "bfloat16").lower() == "bfloat16" else torch.float16
FOUNDATION_MODEL = os.getenv("AVANTIQO_AUDIO_FOUNDATION_MODEL", "").strip()
SAMPLE_RATE = int(os.getenv("AVANTIQO_AUDIO_SAMPLE_RATE", "16000"))
_PIPELINE: Any | None = None
CERTIFIED_CAPABILITIES = {
    "ai.audio.generate",
    "ai.music.generate",
    "ai.sfx.generate",
}


def _text(value: Any) -> str:
    return str(value or "").strip()


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


def _pipeline():
    global _PIPELINE
    if _PIPELINE is not None:
        return _PIPELINE
    if not FOUNDATION_MODEL:
        raise RuntimeError("AVANTIQO_AUDIO_FOUNDATION_MODEL_REQUIRED")
    pipe = AudioLDM2Pipeline.from_pretrained(
        FOUNDATION_MODEL,
        torch_dtype=DTYPE,
    )
    pipe.to(DEVICE)
    if hasattr(pipe, "enable_attention_slicing"):
        pipe.enable_attention_slicing()
    _PIPELINE = pipe
    return pipe


def _duration_seconds(spec: dict[str, Any]) -> float:
    output = spec.get("output_spec") or {}
    params = spec.get("provider_parameters") or {}
    value = output.get("duration_seconds") or params.get("duration_seconds") or 12
    number = float(value)
    return max(1.0, min(60.0, number))


def _validated_input(job: dict[str, Any]) -> dict[str, Any]:
    data = job.get("input") or {}
    if data.get("contract") != ENGINE_CONTRACT:
        raise ValueError("AVANTIQO_AUDIO_ENGINE_CONTRACT_INVALID")
    capability = _text(data.get("capability"))
    if capability not in CERTIFIED_CAPABILITIES:
        raise ValueError("AVANTIQO_AUDIO_CAPABILITY_NOT_CERTIFIED")
    instruction = _text(data.get("instruction"))
    if not instruction:
        raise ValueError("AVANTIQO_AUDIO_INSTRUCTION_REQUIRED")
    if len(instruction) > 12000:
        raise ValueError("AVANTIQO_AUDIO_INSTRUCTION_TOO_LONG")
    storage = data.get("storage_upload") or {}
    signed_url = _public_https_url(storage.get("signed_url"), upload=True)
    storage_reference = _text(storage.get("storage_reference"))
    if not storage_reference.startswith("storage://creative-assets/"):
        raise ValueError("AVANTIQO_AUDIO_STORAGE_REFERENCE_INVALID")
    data["storage_upload"] = {
        **storage,
        "signed_url": signed_url,
        "storage_reference": storage_reference,
    }
    return data


def _upload(path: Path, storage: dict[str, Any]) -> None:
    with path.open("rb") as handle:
        response = requests.put(
            storage["signed_url"],
            data=handle,
            headers={"content-type": "audio/wav", "x-upsert": "false"},
            timeout=180,
        )
    if not response.ok:
        detail = response.text[:500].replace("\n", " ")
        raise RuntimeError(f"AVANTIQO_AUDIO_STORAGE_UPLOAD_FAILED:{response.status_code}:{detail}")


def _pcm(audio):
    tensor = torch.as_tensor(audio).detach().float().cpu()
    tensor = torch.clamp(tensor, -1.0, 1.0)
    return (tensor.numpy() * 32767.0).astype("int16")


def handler(job: dict[str, Any]) -> dict[str, Any]:
    data = _validated_input(job)
    started = time.perf_counter()
    runpod.serverless.progress_update(job, "loading Avantiqo Audio")
    pipe = _pipeline()
    spec = data.get("structured_specification") or {}
    params = spec.get("provider_parameters") or {}
    duration = _duration_seconds(spec)
    seed = int(params.get("seed") if params.get("seed") is not None else int.from_bytes(os.urandom(4), "big"))
    if seed < 0 or seed > 4294967295:
        raise ValueError("AVANTIQO_AUDIO_SEED_INVALID")
    generator = torch.Generator(device=DEVICE).manual_seed(seed)

    runpod.serverless.progress_update(job, "generating audio")
    result = pipe(
        prompt=data["instruction"],
        audio_length_in_s=duration,
        num_inference_steps=int(params.get("inference_steps") or os.getenv("AVANTIQO_AUDIO_INFERENCE_STEPS", "100")),
        guidance_scale=float(params.get("guidance_scale") or os.getenv("AVANTIQO_AUDIO_GUIDANCE_SCALE", "3.5")),
        generator=generator,
    )
    audio = result.audios[0]
    job_id = _text(job.get("id")) or str(int(time.time() * 1000))
    path = OUTPUT_DIR / f"{job_id}.wav"
    wavfile.write(path, SAMPLE_RATE, _pcm(audio))
    runpod.serverless.progress_update(job, "storing private Avantiqo asset")
    _upload(path, data["storage_upload"])
    size_bytes = path.stat().st_size
    path.unlink(missing_ok=True)

    return {
        "status": "completed",
        "provider": "avantiqo-audio",
        "model": PRODUCT_MODEL,
        "engine_contract": ENGINE_CONTRACT,
        "capability": data["capability"],
        "storage_reference": data["storage_upload"]["storage_reference"],
        "foundation_model": FOUNDATION_MODEL,
        "duration_seconds": duration,
        "sample_rate": SAMPLE_RATE,
        "seed": seed,
        "size_bytes": size_bytes,
        "generation_seconds": round(time.perf_counter() - started, 3),
        "raw_reasoning_persisted": False,
    }


@runpod.serverless.register_fitness_check
def check_worker():
    if not FOUNDATION_MODEL:
        raise RuntimeError("AVANTIQO_AUDIO_FOUNDATION_MODEL_REQUIRED")
    if not torch.cuda.is_available():
        raise RuntimeError("AVANTIQO_AUDIO_CUDA_REQUIRED")


if __name__ == "__main__":
    runpod.serverless.start({"handler": handler})
