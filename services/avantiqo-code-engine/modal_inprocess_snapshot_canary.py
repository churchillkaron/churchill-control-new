from __future__ import annotations

import json
import os
import time
import uuid
from typing import Any

import modal

APP_NAME = "avantiqo-code-inprocess-snapshot-canary-v1"
CONTRACT = "AVANTIQO_CODE_INPROCESS_GPU_SNAPSHOT_V1"
BASE_IMAGE_ID = "im-jAkmG5niafDQsnuSUxak9c"
FOUNDATION_MODEL = "Qwen/Qwen3-Coder-30B-A3B-Instruct"
RUNTIME_MODEL = "Qwen/Qwen3-Coder-30B-A3B-Instruct-FP8"

# Keep the exact immutable Code image. This creates only a tiny environment
# layer and never republishes the 29 GiB Qwen checkpoint.
image = modal.Image.from_id(BASE_IMAGE_ID).env(
    {
        "VLLM_ENABLE_V1_MULTIPROCESSING": "0",
        "VLLM_WORKER_MULTIPROC_METHOD": "spawn",
        "VLLM_USE_FLASHINFER_SAMPLER": "0",
        "AVANTIQO_CODE_REQUIRE_CACHED_MODEL": "1",
    }
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
class CodeInprocessSnapshotCanary:
    @modal.enter(snap=True)
    def initialize_snapshot(self) -> None:
        os.chdir("/app")
        import handler as code_engine
        from vllm import LLM, SamplingParams

        code_engine.runpod.serverless.progress_update = lambda *_args, **_kwargs: None
        cached_path = code_engine._cached_model_path(code_engine.RUNTIME_MODEL)
        if not cached_path:
            raise RuntimeError(f"{CONTRACT}_CACHED_MODEL_REQUIRED")

        total_started = time.perf_counter()
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
        )
        tokenizer = engine.get_tokenizer()
        load_seconds = time.perf_counter() - load_started

        # Cover the first real MoE decode shape before the snapshot so a restored
        # worker does not pay first-token Triton/JIT latency.
        rendered = tokenizer.apply_chat_template(
            [{"role": "user", "content": "Return only READY."}],
            tokenize=False,
            add_generation_prompt=True,
        )
        warm_started = time.perf_counter()
        engine.generate(
            [rendered],
            SamplingParams(temperature=0.0, max_tokens=8, skip_special_tokens=True),
            use_tqdm=False,
        )
        warm_seconds = time.perf_counter() - warm_started

        code_engine._ENGINE = engine
        code_engine._TOKENIZER = tokenizer

        sleep_started = time.perf_counter()
        engine.sleep(level=1)
        sleep_seconds = time.perf_counter() - sleep_started

        self.snapshot_init = {
            "load_seconds": round(load_seconds, 3),
            "warm_seconds": round(warm_seconds, 3),
            "sleep_seconds": round(sleep_seconds, 3),
            "total_seconds": round(time.perf_counter() - total_started, 3),
            "inprocess_vllm": os.environ.get("VLLM_ENABLE_V1_MULTIPROCESSING") == "0",
            "base_image_id": BASE_IMAGE_ID,
        }
        print(
            "AVANTIQO_CODE_INPROCESS_SNAPSHOT_INIT="
            + json.dumps(self.snapshot_init, separators=(",", ":")),
            flush=True,
        )

    @modal.enter(snap=False)
    def restore_gpu(self) -> None:
        os.chdir("/app")
        import handler as code_engine

        if code_engine._ENGINE is None or code_engine._TOKENIZER is None:
            raise RuntimeError(f"{CONTRACT}_ENGINE_NOT_RESTORED")
        started = time.perf_counter()
        code_engine._ENGINE.wake_up()
        self.wake_seconds = round(time.perf_counter() - started, 3)
        print(
            "AVANTIQO_CODE_INPROCESS_SNAPSHOT_WAKE="
            + json.dumps({"wake_seconds": self.wake_seconds}, separators=(",", ":")),
            flush=True,
        )

    @modal.method()
    def invoke(self, request: dict[str, Any]) -> dict[str, Any]:
        os.chdir("/app")
        import handler as code_engine

        started = time.perf_counter()
        output = code_engine.handler(
            {"id": f"inprocess-snapshot-{uuid.uuid4()}", "input": request}
        )
        if not isinstance(output, dict):
            raise RuntimeError(f"{CONTRACT}_OUTPUT_OBJECT_REQUIRED")
        result = dict(output)
        result["snapshot_contract"] = CONTRACT
        result["snapshot_init"] = dict(self.snapshot_init)
        result["snapshot_wake_seconds"] = self.wake_seconds
        result["method_elapsed_seconds"] = round(time.perf_counter() - started, 3)
        result["production_deploy_performed"] = False
        return result
