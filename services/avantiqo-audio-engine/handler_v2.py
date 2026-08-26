import subprocess
import time
from pathlib import Path
from typing import Any

import runpod

import handler as base
from acestep.inference import GenerationConfig, GenerationParams, generate_music

TEMPORAL_EXTEND_CAPABILITY = "ai.audio.extend"
TEMPORAL_EXTEND_STRATEGY = "XL_TURBO_REPAINT_RIGHT_OUTPAINT"
DEFAULT_EXTENSION_SECONDS = 30.0
DEFAULT_CONTINUITY_OVERLAP_SECONDS = 4.0
MAX_EXTENSION_SECONDS = 120.0
MAX_CONTINUITY_OVERLAP_SECONDS = 12.0

# Extend is a certification candidate on the existing owned XL Turbo worker.
# It deliberately maps to repaint because the pinned ACE-Step implementation
# right-pads repaint/lego targets when repainting_end exceeds source duration.
# The Base `complete` task does not right-pad and therefore cannot implement
# temporal continuation.
base.IMPLEMENTED_CAPABILITIES.add(TEMPORAL_EXTEND_CAPABILITY)
base.CERTIFICATION_CANDIDATE_CAPABILITIES.add(TEMPORAL_EXTEND_CAPABILITY)
base.CAPABILITY_TASK_TYPES[TEMPORAL_EXTEND_CAPABILITY] = "repaint"


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
    duration = base._number(result.stdout.strip(), None) if result.returncode == 0 else None
    if duration is None or duration <= 0:
        raise RuntimeError("AVANTIQO_AUDIO_EXTEND_SOURCE_DURATION_UNAVAILABLE")
    return float(duration)


def _extend_controls(data: dict[str, Any]) -> dict[str, float]:
    spec = base._object(data.get("structured_specification"))
    objects = base._candidate_objects(spec)
    extension = base._number(
        base._first_value(objects, ("extension_seconds", "extend_seconds", "additional_seconds")),
        DEFAULT_EXTENSION_SECONDS,
    )
    overlap = base._number(
        base._first_value(objects, ("continuity_overlap_seconds", "overlap_seconds", "tail_overlap_seconds")),
        DEFAULT_CONTINUITY_OVERLAP_SECONDS,
    )
    extension = max(5.0, min(MAX_EXTENSION_SECONDS, extension if extension is not None else DEFAULT_EXTENSION_SECONDS))
    overlap = max(1.0, min(MAX_CONTINUITY_OVERLAP_SECONDS, overlap if overlap is not None else DEFAULT_CONTINUITY_OVERLAP_SECONDS))
    return {
        "extension_seconds": float(extension),
        "continuity_overlap_seconds": float(overlap),
    }


def _configure_temporal_extend(data: dict[str, Any], request: dict[str, Any], source_path: Path) -> dict[str, Any]:
    controls = _extend_controls(data)
    source_duration = _audio_duration_seconds(source_path)
    maximum_target = float(base.MAX_DURATION_SECONDS)
    if source_duration >= maximum_target - 1.0:
        raise ValueError(
            f"AVANTIQO_AUDIO_EXTEND_SOURCE_TOO_LONG_FOR_CURRENT_WORKER:max_target_seconds={maximum_target}"
        )

    target_duration = min(maximum_target, source_duration + controls["extension_seconds"])
    actual_extension = target_duration - source_duration
    if actual_extension < 1.0:
        raise ValueError("AVANTIQO_AUDIO_EXTEND_TARGET_DURATION_INVALID")

    overlap = min(controls["continuity_overlap_seconds"], max(1.0, source_duration))
    repaint_start = max(0.0, source_duration - overlap)
    repaint_end = target_duration

    return {
        **request,
        "task_type": "repaint",
        "duration": target_duration,
        "repainting_start": repaint_start,
        "repainting_end": repaint_end,
        "source_duration_seconds": source_duration,
        "extension_seconds_requested": controls["extension_seconds"],
        "extension_seconds_effective": actual_extension,
        "continuity_overlap_seconds": overlap,
        "target_duration_seconds": target_duration,
        "temporal_extend_strategy": TEMPORAL_EXTEND_STRATEGY,
    }


def handler(job: dict[str, Any]) -> dict[str, Any]:
    data = base._validated_input(job)
    request = base._generation_request(data)
    started = time.perf_counter()

    runpod.serverless.progress_update(job, "loading Avantiqo Music")
    dit_handler = base._dit_handler()
    lm_handler = base._llm_handler() if request["task_type"] == "text2music" else None
    use_lm = lm_handler is not None

    job_id = base._text(job.get("id")) or str(int(time.time() * 1000))
    job_output_dir = base.OUTPUT_DIR / job_id
    job_output_dir.mkdir(parents=True, exist_ok=True)
    source_path: Path | None = None

    try:
        if request["task_type"] != "text2music":
            runpod.serverless.progress_update(job, "preparing private source audio")
            source_path = base._download_source_audio(data, job_output_dir)

        if data["capability"] == TEMPORAL_EXTEND_CAPABILITY:
            if source_path is None:
                raise ValueError("AVANTIQO_AUDIO_EXTEND_SOURCE_AUDIO_REQUIRED")
            request = _configure_temporal_extend(data, request, source_path)
            runpod.serverless.progress_update(job, "outpainting continuation beyond source ending")

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
            thinking=use_lm,
            use_cot_metas=use_lm,
            use_cot_caption=use_lm,
            use_cot_lyrics=use_lm,
            use_cot_language=use_lm,
            use_constrained_decoding=use_lm,
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

        if data["capability"] != TEMPORAL_EXTEND_CAPABILITY:
            progress = {
                "text2music": "generating XL quality music",
                "cover": "creating owned remix",
                "repaint": "repairing selected audio region",
            }[request["task_type"]]
            runpod.serverless.progress_update(job, progress)

        result = generate_music(
            dit_handler,
            lm_handler,
            params,
            config,
            save_dir=str(job_output_dir),
        )
        if not result.success or not result.audios:
            detail = base._text(result.error or result.status_message).replace("\n", " ")[:1000]
            raise RuntimeError(f"AVANTIQO_AUDIO_GENERATION_FAILED:{detail}")

        audio_info = base._object(result.audios[0])
        path = Path(base._text(audio_info.get("path"))).resolve()
        try:
            path.relative_to(job_output_dir.resolve())
        except ValueError as exc:
            raise RuntimeError("AVANTIQO_AUDIO_OUTPUT_PATH_INVALID") from exc
        if not path.is_file() or path.stat().st_size <= 44:
            raise RuntimeError("AVANTIQO_AUDIO_OUTPUT_INVALID")

        sample_rate = base._integer(audio_info.get("sample_rate"), getattr(dit_handler, "sample_rate", 48000)) or 48000
        tensor = audio_info.get("tensor")
        actual_duration = request["duration"]
        if tensor is not None and getattr(tensor, "shape", None) and sample_rate > 0:
            actual_duration = float(tensor.shape[-1]) / float(sample_rate)

        resolved_seed = request["seed"]
        audio_params = base._object(audio_info.get("params"))
        if resolved_seed is None:
            resolved_seed = base._integer(audio_params.get("seed"), None)

        runpod.serverless.progress_update(job, "storing private Avantiqo asset")
        base._upload(path, data["storage_upload"])
        size_bytes = path.stat().st_size
        certification_access = base._object(data.get("certification_access"))
        is_extend = data["capability"] == TEMPORAL_EXTEND_CAPABILITY
        source_duration = request.get("source_duration_seconds") if is_extend else None
        temporal_extension_observed = bool(
            is_extend
            and source_duration is not None
            and actual_duration > float(source_duration) + 0.5
        )

        return {
            "status": "completed",
            "provider": "avantiqo-audio",
            "model": base.PRODUCT_MODEL,
            "model_family": base.MODEL_FAMILY,
            "model_variant": base.MODEL_VARIANT,
            "quality_profile": base.QUALITY_PROFILE,
            "engine_contract": base.ENGINE_CONTRACT,
            "capability": data["capability"],
            "task_type": request["task_type"],
            "storage_reference": data["storage_upload"]["storage_reference"],
            "foundation_model": base.FOUNDATION_MODEL,
            "duration_seconds": round(actual_duration, 3),
            "sample_rate": sample_rate,
            "seed": resolved_seed,
            "size_bytes": size_bytes,
            "generation_seconds": round(time.perf_counter() - started, 3),
            "source_audio_used": source_path is not None,
            "audio_cover_strength": request["audio_cover_strength"] if request["task_type"] == "cover" else None,
            "repainting_start": request["repainting_start"] if request["task_type"] == "repaint" else None,
            "repainting_end": request["repainting_end"] if request["task_type"] == "repaint" else None,
            "source_duration_seconds": round(source_duration, 3) if source_duration is not None else None,
            "extension_seconds_requested": request.get("extension_seconds_requested") if is_extend else None,
            "extension_seconds_effective": round(request.get("extension_seconds_effective"), 3) if is_extend else None,
            "target_duration_seconds": round(request.get("target_duration_seconds"), 3) if is_extend else None,
            "continuity_overlap_seconds": round(request.get("continuity_overlap_seconds"), 3) if is_extend else None,
            "temporal_extend_strategy": request.get("temporal_extend_strategy") if is_extend else None,
            "temporal_extension_observed": temporal_extension_observed if is_extend else None,
            "temporal_extension_proven": False,
            "ace_step_lm_used": use_lm,
            "ace_step_lm_model": base.LM_MODEL if use_lm else None,
            "ace_step_lm_backend": base.LM_BACKEND if use_lm else None,
            "thinking_enabled": use_lm,
            "certification_candidate": certification_access.get("candidate") is True,
            "production_certified": certification_access.get("production_certified") is True,
            "certification_contract": certification_access.get("contract"),
            "human_review_required": certification_access.get("human_review_required") is True,
            "activation_allowed": certification_access.get("activation_allowed") is True,
            "raw_reasoning_persisted": False,
            "generation_input_persisted": False,
        }
    finally:
        base._cleanup_job_dir(job_output_dir)


# Importing handler.py above registers the canonical worker fitness check.
# Do not register a second check here; handler_v2 reuses the same CUDA/model validation.

if __name__ == "__main__":
    runpod.serverless.start({"handler": handler})
