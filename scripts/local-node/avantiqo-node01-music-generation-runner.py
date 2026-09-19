import argparse
import json
import os
import tempfile
import time
import urllib.request
from pathlib import Path

os.environ.setdefault("HF_HOME", r"C:\Avantiqo\hf-cache")

from acestep.handler import AceStepHandler
from acestep.inference import GenerationConfig, GenerationParams, generate_music

ROOT = Path(r"C:\Avantiqo\ace-step-1.5-local")
CONTRACT = "AVANTIQO_MUSIC_LOCAL_CPU_GENERATION_V1"
ENGINE_CONTRACT = "AVANTIQO_AUDIO_ENGINE_V1"
QUALITY_PROFILE = "ACE_STEP_1_5_CPU_FLOAT32_LOCAL_V1"


def obj(value):
    return value if isinstance(value, dict) else {}


def num(value, fallback):
    try:
        return float(value)
    except (TypeError, ValueError):
        return fallback


def integer(value, fallback):
    try:
        return int(value)
    except (TypeError, ValueError):
        return fallback


def put_file(url, path, content_type="audio/wav"):
    data = Path(path).read_bytes()
    req = urllib.request.Request(url, data=data, method="PUT", headers={"Content-Type": content_type})
    with urllib.request.urlopen(req, timeout=180) as response:
        if response.status < 200 or response.status >= 300:
            raise RuntimeError(f"AVANTIQO_LOCAL_MUSIC_UPLOAD_FAILED:{response.status}")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    args = parser.parse_args()
    payload = json.loads(Path(args.input).read_text(encoding="utf-8"))
    generation = obj(payload.get("generation"))
    params = obj(payload.get("provider_parameters"))
    uploads = obj(payload.get("output_uploads"))
    target = obj(uploads.get("audio_wav"))
    upload_url = str(target.get("signed_url") or "").strip()
    storage_reference = str(target.get("storage_reference") or "").strip()
    if not upload_url or not storage_reference:
        raise RuntimeError("AVANTIQO_LOCAL_MUSIC_OUTPUT_UPLOAD_REQUIRED")

    duration = max(10.0, min(300.0, num(generation.get("duration_seconds"), 30.0)))
    seed = max(0, min(4294967295, integer(params.get("seed"), int(time.time()) & 0xFFFFFFFF)))
    inference_steps = max(1, min(20, integer(params.get("inference_steps"), 8)))
    shift = max(1.0, min(5.0, num(params.get("shift"), 3.0)))
    instrumental = generation.get("instrumental") is not False
    lyrics = "" if instrumental else str(generation.get("lyrics") or "")
    caption = str(generation.get("caption") or generation.get("style") or "Original music")
    vocal_language = str(generation.get("vocal_language") or "en")
    bpm = max(30, min(300, integer(generation.get("bpm"), 96)))
    keyscale = str(generation.get("keyscale") or "")
    timesignature = str(generation.get("timesignature") or "4")

    started = time.perf_counter()
    handler = AceStepHandler()
    status, ok = handler.initialize_service(
        project_root=str(ROOT), config_path="acestep-v15-turbo", device="cpu",
        use_flash_attention=False, compile_model=False, offload_to_cpu=False,
        offload_dit_to_cpu=False, quantization=None, prefer_source="huggingface", use_mlx_dit=False,
    )
    if not ok:
        raise RuntimeError(f"AVANTIQO_LOCAL_MUSIC_INIT_FAILED:{status}")
    handler._vram_preflight_check = lambda actual_batch_size, audio_duration, guidance_scale: None

    generation_params = GenerationParams(
        task_type="text2music", src_audio=None, caption=caption, lyrics=lyrics,
        instrumental=instrumental, vocal_language=vocal_language, bpm=bpm,
        keyscale=keyscale, timesignature=timesignature, duration=duration,
        inference_steps=inference_steps, seed=seed, guidance_scale=1.0, shift=shift,
        repainting_start=0.0, repainting_end=-1.0, audio_cover_strength=0.6,
        thinking=False, use_cot_metas=False, use_cot_caption=False,
        use_cot_lyrics=False, use_cot_language=False, use_constrained_decoding=False,
        enable_normalization=True, normalization_db=-1.0,
    )
    config = GenerationConfig(
        batch_size=1, allow_lm_batch=False, use_random_seed=False, seeds=[seed],
        constrained_decoding_debug=False, audio_format="wav",
    )
    with tempfile.TemporaryDirectory(prefix="avantiqo-music-") as out_dir:
        result = generate_music(handler, None, generation_params, config, save_dir=out_dir)
        if not result.success or not result.audios:
            raise RuntimeError(f"AVANTIQO_LOCAL_MUSIC_GENERATION_FAILED:{result.error or result.status_message}")
        path = Path(str(result.audios[0].get("path") or ""))
        if not path.exists() or path.stat().st_size <= 0:
            raise RuntimeError("AVANTIQO_LOCAL_MUSIC_OUTPUT_REQUIRED")
        put_file(upload_url, path)

    elapsed_ms = int((time.perf_counter() - started) * 1000)
    print(json.dumps({
        "success": True,
        "status": "completed",
        "contract": CONTRACT,
        "engine_contract": ENGINE_CONTRACT,
        "quality_profile": QUALITY_PROFILE,
        "model": "ACE-Step/Ace-Step1.5",
        "runtime_variant": "acestep-v15-turbo",
        "execution_resource": "LOCAL_CPU_FLOAT32",
        "infrastructure_provider": "AVANTIQO_LOCAL_NODE_V1",
        "storage_reference": storage_reference,
        "audio": {"storage_reference": storage_reference},
        "seed": seed,
        "duration_seconds": duration,
        "inference_steps": inference_steps,
        "elapsed_ms": elapsed_ms,
        "supplier_cost_thb": 0,
        "raw_reasoning_persisted": False,
    }, separators=(",", ":")))


if __name__ == "__main__":
    main()
