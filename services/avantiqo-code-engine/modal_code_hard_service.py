"""Persistent certification-only Modal service for Avantiqo Code hard tests.

This is not a production application deployment. It is the stable remote GPU
boundary used by deterministic Code certification. The App stays deployed so a
warm container may survive for the configured idle window instead of being torn
down when a GitHub `modal run` process exits.
"""

from __future__ import annotations

import os
import time
import uuid
from typing import Any

import modal
import modal_persistent_owned_cert as cert

APP_NAME = "avantiqo-code-hard-service-v1"
FUNCTION_NAME = "run_hard_cert_batch"
SERVICE_CONTRACT = "AVANTIQO_CODE_HARD_SERVICE_V1"

app = modal.App(APP_NAME)

SERVICE_IMAGE = cert.REMOTE_IMAGE.add_local_file(
    "services/avantiqo-code-engine/modal_persistent_owned_cert.py",
    "/root/modal_persistent_owned_cert.py",
    copy=False,
)

_REMOTE_INSTANCE_ID = uuid.uuid4().hex
_REMOTE_WARMED = False
_LLM_PATCHED = False


@app.function(
    image=SERVICE_IMAGE,
    volumes={cert.MODEL_MOUNT_ROOT: cert.MODEL_VOLUME},
    env={"HF_HUB_OFFLINE": "1", "TRANSFORMERS_OFFLINE": "1"},
    gpu=["H100", "H200"],
    timeout=12 * 60,
    startup_timeout=3 * 60,
    retries=0,
    scaledown_window=10 * 60,
    min_containers=0,
    max_containers=1,
)
def run_hard_cert_batch(requests: list[dict[str, Any]]) -> dict[str, Any]:
    """Execute one first-pass or repair batch on the persistent Code runtime."""
    global _REMOTE_WARMED, _LLM_PATCHED

    os.chdir("/app")
    import handler as code_engine

    code_engine.runpod.serverless.progress_update = lambda *_args, **_kwargs: None
    code_engine._prompt = cert._quality_prompt

    if not _LLM_PATCHED:
        original_llm = code_engine.LLM

        def persistent_llm(*args: Any, **kwargs: Any) -> Any:
            kwargs["enforce_eager"] = False
            kwargs["safetensors_load_strategy"] = "prefetch"
            return original_llm(*args, **kwargs)

        code_engine.LLM = persistent_llm
        _LLM_PATCHED = True

    prepare_started = time.perf_counter()
    tokenizer, engine = code_engine._load_engine()
    warmup_model_calls = 0
    if not _REMOTE_WARMED:
        warm_prompt = tokenizer.apply_chat_template(
            [{"role": "user", "content": "Return only OK."}],
            tokenize=False,
            add_generation_prompt=True,
        )
        warm = engine.generate(
            [warm_prompt],
            code_engine.SamplingParams(
                temperature=0.0,
                max_tokens=8,
                skip_special_tokens=True,
            ),
            use_tqdm=False,
        )
        if not warm or not warm[0].outputs:
            raise RuntimeError(f"{SERVICE_CONTRACT}_WARMUP_OUTPUT_REQUIRED")
        _REMOTE_WARMED = True
        warmup_model_calls = 1
    prepare_ms = round((time.perf_counter() - prepare_started) * 1000)

    outputs: list[dict[str, Any]] = []
    scored_started = time.perf_counter()
    base_sampling_params = code_engine.SamplingParams

    for request in requests:
        specification = request.get("structured_specification") or {}
        repair_mode = specification.get("machine_verification_repair") is True

        if repair_mode:
            def repair_sampling_params(*args: Any, **kwargs: Any) -> Any:
                kwargs["temperature"] = 0.15
                kwargs["top_p"] = 0.95
                kwargs["seed"] = 17
                return base_sampling_params(*args, **kwargs)

            code_engine.SamplingParams = repair_sampling_params
        else:
            code_engine.SamplingParams = base_sampling_params

        started = time.perf_counter()
        try:
            output = code_engine.handler(
                {"id": f"hard-service-{uuid.uuid4()}", "input": request}
            )
        finally:
            code_engine.SamplingParams = base_sampling_params

        if not isinstance(output, dict):
            raise RuntimeError(f"{SERVICE_CONTRACT}_OUTPUT_OBJECT_REQUIRED")

        clean = dict(output)
        clean["case_elapsed_seconds"] = round(time.perf_counter() - started, 3)
        clean["quality_policy"] = cert.verified.QUALITY_POLICY
        clean["warm_runtime"] = True
        clean["vllm_enforce_eager"] = False
        clean["repair_sampling"] = (
            {"temperature": 0.15, "top_p": 0.95, "seed": 17}
            if repair_mode
            else {"temperature": 0.0}
        )
        outputs.append(clean)

    cert.MODEL_VOLUME.commit()
    return {
        "service_contract": SERVICE_CONTRACT,
        "service_app": APP_NAME,
        "outputs": outputs,
        "runtime_instance_id": _REMOTE_INSTANCE_ID,
        "engine_prepare_ms": prepare_ms,
        "scored_gpu_seconds": round(time.perf_counter() - scored_started, 3),
        "warmup_model_calls": warmup_model_calls,
        "model_calls": len(outputs),
        "persistent_model_storage": True,
        "model_volume_name": cert.MODEL_VOLUME_NAME,
        "model_revision": cert.MODEL_REVISION,
        "model_snapshot_path": str(cert._snapshot_path()),
        "vllm_cache_root": cert.PERSISTENT_VLLM_CACHE_ROOT,
        "safetensors_load_strategy": "prefetch",
        "production_deploy_performed": False,
    }
