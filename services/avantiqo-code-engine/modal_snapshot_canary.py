from __future__ import annotations

import json
import os
import time
import uuid
from pathlib import Path
from typing import Any

import modal

APP_NAME = "avantiqo-code-snapshot-canary-v1"
CONTRACT = "AVANTIQO_CODE_MODAL_SNAPSHOT_CANARY_V2"
FOUNDATION_MODEL = "Qwen/Qwen3-Coder-30B-A3B-Instruct"
RUNTIME_MODEL = "Qwen/Qwen3-Coder-30B-A3B-Instruct-FP8"
MODEL_REVISION = "dcaee4d4dfc5ee71ad501f01f530e5652438fde0"
WORKER_IMAGE = (
    "ghcr.io/churchillkaron/avantiqo-code-worker@"
    "sha256:fa6559a184998d75fb6430ea9fa303fe7b6c1af0da441e61ac4bd587b2bdf3c6"
)
HF_ROOT = "/opt/avantiqo-code-cache"
HF_CACHE_ROOT = f"{HF_ROOT}/hub"


def _bake_runtime_model(repo_id: str, revision: str, cache_root: str) -> None:
    from huggingface_hub import snapshot_download

    resolved = snapshot_download(
        repo_id=repo_id,
        revision=revision,
        cache_dir=cache_root,
    )
    if not Path(resolved).is_dir():
        raise RuntimeError(f"{CONTRACT}_MODEL_SNAPSHOT_MISSING")
    print(
        "AVANTIQO_CODE_SNAPSHOT_MODEL_BAKED="
        + json.dumps(
            {
                "runtime_model": repo_id,
                "revision": revision,
                "cache_root": cache_root,
                "modal_volume_created": False,
            },
            separators=(",", ":"),
        ),
        flush=True,
    )


# Keep this canary self-contained. Modal 1.x only auto-includes the module that
# defines the Function/Class; relying on a sibling modal_app.py caused the V1
# canary to crash-loop before snapshot creation.
image = (
    modal.Image.from_registry(
        WORKER_IMAGE,
        add_python=None,
        setup_dockerfile_commands=[
            "RUN command -v python >/dev/null 2>&1 || ln -s \"$(command -v python3)\" /usr/local/bin/python",
            "RUN command -v pip >/dev/null 2>&1 || ln -s \"$(command -v pip3)\" /usr/local/bin/pip",
            "RUN python --version && pip --version",
        ],
    )
    .entrypoint([])
    .env(
        {
            "HF_HOME": HF_ROOT,
            "AVANTIQO_CODE_HF_CACHE_ROOT": HF_CACHE_ROOT,
            "VLLM_CACHE_ROOT": "/tmp/avantiqo-code-vllm-cache",
            "VLLM_WORKER_MULTIPROC_METHOD": "spawn",
            "VLLM_USE_FLASHINFER_SAMPLER": "0",
            "VLLM_USE_DEEP_GEMM": "0",
            "VLLM_MOE_USE_DEEP_GEMM": "0",
            "AVANTIQO_CODE_DEVICE": "cuda",
            "AVANTIQO_CODE_QUANTIZATION": "fp8",
            "AVANTIQO_CODE_FOUNDATION_MODEL": FOUNDATION_MODEL,
            "AVANTIQO_CODE_RUNTIME_MODEL": RUNTIME_MODEL,
            "AVANTIQO_CODE_MAX_MODEL_LEN": "32768",
            "AVANTIQO_CODE_GPU_MEMORY_UTILIZATION": "0.90",
            "AVANTIQO_CODE_MAX_NEW_TOKENS": "768",
            "AVANTIQO_CODE_REQUIRE_CACHED_MODEL": "1",
            "TORCHINDUCTOR_COMPILE_THREADS": "1",
        }
    )
    .run_function(
        _bake_runtime_model,
        args=(RUNTIME_MODEL, MODEL_REVISION, HF_CACHE_ROOT),
        timeout=60 * 60,
    )
)

app = modal.App(APP_NAME)


@app.cls(
    image=image,
    gpu="H100",
    min_containers=0,
    max_containers=1,
    scaledown_window=10,
    timeout=5 * 60,
    startup_timeout=5 * 60,
    enable_memory_snapshot=True,
    experimental_options={"enable_gpu_snapshot": True},
)
class CodeSnapshotCanary:
    @modal.enter(snap=True)
    def initialize_for_snapshot(self) -> None:
        os.chdir("/app")
        import handler as code_engine
        from vllm import LLM, SamplingParams

        code_engine.runpod.serverless.progress_update = lambda *_args, **_kwargs: None
        total_started = time.perf_counter()
        cached_path = code_engine._cached_model_path(code_engine.RUNTIME_MODEL)
        if not cached_path:
            raise RuntimeError(f"{CONTRACT}_CACHED_MODEL_REQUIRED:{RUNTIME_MODEL}")

        load_started = time.perf_counter()
        engine = LLM(
            model=cached_path,
            tokenizer=cached_path,
            dtype="auto",
            trust_remote_code=False,
            tensor_parallel_size=1,
            max_model_len=code_engine.MAX_MODEL_LEN,
            gpu_memory_utilization=code_engine.GPU_MEMORY_UTILIZATION,
            enforce_eager=True,
            enable_prefix_caching=True,
            disable_log_stats=True,
            enable_sleep_mode=True,
            safetensors_load_strategy="prefetch",
            compilation_config={"fast_moe_cold_start": True},
        )
        tokenizer = engine.get_tokenizer()
        load_seconds = time.perf_counter() - load_started

        warm_started = time.perf_counter()
        rendered = tokenizer.apply_chat_template(
            [{"role": "user", "content": "Return only the word READY."}],
            tokenize=False,
            add_generation_prompt=True,
        )
        engine.generate(
            [rendered],
            SamplingParams(
                temperature=0.0,
                max_tokens=8,
                skip_special_tokens=True,
            ),
            use_tqdm=False,
        )
        warmup_seconds = time.perf_counter() - warm_started

        # Preserve the exact engine/tokenizer that the source-owned handler uses.
        code_engine._ENGINE = engine
        code_engine._TOKENIZER = tokenizer

        # vLLM sleep mode is the supported GPU-snapshot preparation path: model
        # weights move to CPU memory and KV cache is discarded before snapshot.
        sleep_started = time.perf_counter()
        engine.sleep(level=1)
        sleep_seconds = time.perf_counter() - sleep_started

        self.snapshot_init = {
            "engine_load_seconds": round(load_seconds, 3),
            "warmup_seconds": round(warmup_seconds, 3),
            "sleep_seconds": round(sleep_seconds, 3),
            "total_seconds": round(time.perf_counter() - total_started, 3),
            "runtime_model": code_engine.RUNTIME_MODEL,
            "model_revision": MODEL_REVISION,
            "safetensors_load_strategy": "prefetch",
            "fast_moe_cold_start": True,
            "gpu_snapshot_enabled": True,
            "modal_volume_created": False,
        }
        print(
            "AVANTIQO_CODE_SNAPSHOT_INIT="
            + json.dumps(self.snapshot_init, separators=(",", ":")),
            flush=True,
        )

    @modal.enter(snap=False)
    def wake_after_restore(self) -> None:
        os.chdir("/app")
        import handler as code_engine

        if code_engine._ENGINE is None or code_engine._TOKENIZER is None:
            raise RuntimeError(f"{CONTRACT}_SNAPSHOT_ENGINE_MISSING")
        wake_started = time.perf_counter()
        code_engine._ENGINE.wake_up()
        self.wake_seconds = round(time.perf_counter() - wake_started, 3)
        print(
            "AVANTIQO_CODE_SNAPSHOT_WAKE="
            + json.dumps({"wake_seconds": self.wake_seconds}, separators=(",", ":")),
            flush=True,
        )

    @modal.method()
    def invoke(self, request: dict[str, Any]) -> dict[str, Any]:
        os.chdir("/app")
        import handler as code_engine

        started = time.perf_counter()
        output = code_engine.handler(
            {
                "id": f"snapshot-canary-{uuid.uuid4()}",
                "input": request,
            }
        )
        if not isinstance(output, dict):
            raise RuntimeError(f"{CONTRACT}_OUTPUT_OBJECT_REQUIRED")
        result = dict(output)
        result["snapshot_contract"] = CONTRACT
        result["snapshot_init"] = dict(self.snapshot_init)
        result["snapshot_wake_seconds"] = float(self.wake_seconds)
        result["method_elapsed_seconds"] = round(time.perf_counter() - started, 3)
        result["production_deploy_performed"] = False
        return result

    @modal.method()
    def invoke_batch(self, requests: list[dict[str, Any]]) -> dict[str, Any]:
        os.chdir("/app")
        import handler as code_engine

        batch_started = time.perf_counter()
        outputs: list[dict[str, Any]] = []
        for request in requests:
            case_started = time.perf_counter()
            output = code_engine.handler(
                {
                    "id": f"snapshot-batch-{uuid.uuid4()}",
                    "input": request,
                }
            )
            if not isinstance(output, dict):
                raise RuntimeError(f"{CONTRACT}_OUTPUT_OBJECT_REQUIRED")
            clean = dict(output)
            clean["case_elapsed_seconds"] = round(time.perf_counter() - case_started, 3)
            outputs.append(clean)
        return {
            "contract": CONTRACT,
            "outputs": outputs,
            "snapshot_init": dict(self.snapshot_init),
            "snapshot_wake_seconds": float(self.wake_seconds),
            "batch_elapsed_seconds": round(time.perf_counter() - batch_started, 3),
            "production_deploy_performed": False,
        }
