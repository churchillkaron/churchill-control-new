from __future__ import annotations

import json
import time
from typing import Any

import modal
import modal_app as base

APP_NAME = "avantiqo-intelligence-fast-snapshot-canary-v1"
CONTRACT = "AVANTIQO_INTELLIGENCE_FAST_GPU_SNAPSHOT_CANARY_V1"

app = modal.App(APP_NAME)
image = base.fast_image.add_local_python_source("modal_app")


@app.cls(
    image=image,
    gpu=base.GPU,
    min_containers=0,
    max_containers=1,
    buffer_containers=0,
    scaledown_window=10,
    timeout=10 * 60,
    startup_timeout=10 * 60,
    enable_memory_snapshot=True,
    experimental_options={"enable_gpu_snapshot": True},
)
class FastSnapshotCanary:
    @modal.enter(snap=True)
    def initialize_for_snapshot(self) -> None:
        from vllm import LLM, SamplingParams

        started = time.perf_counter()
        engine = LLM(
            model=base.FAST_MODEL_PATH,
            dtype="bfloat16",
            max_model_len=base.MAX_MODEL_LEN,
            tensor_parallel_size=1,
            gpu_memory_utilization=0.90,
            trust_remote_code=False,
            enforce_eager=False,
            safetensors_load_strategy="prefetch",
            enable_sleep_mode=True,
        )
        tokenizer = engine.get_tokenizer()
        load_seconds = time.perf_counter() - started
        warm_started = time.perf_counter()
        rendered = tokenizer.apply_chat_template(
            [{"role": "user", "content": "Reply only READY."}],
            tokenize=False,
            add_generation_prompt=True,
        )
        engine.generate(
            [rendered],
            SamplingParams(temperature=0.0, max_tokens=8, skip_special_tokens=True),
            use_tqdm=False,
        )
        warmup_seconds = time.perf_counter() - warm_started
        base._LLM_CACHE[base.FAST_MODEL] = engine
        sleep_started = time.perf_counter()
        engine.sleep(level=1)
        sleep_seconds = time.perf_counter() - sleep_started
        self.snapshot_init = {
            "contract": CONTRACT,
            "model": base.FAST_MODEL,
            "model_revision": base.FAST_REVISION,
            "engine_load_seconds": round(load_seconds, 3),
            "warmup_seconds": round(warmup_seconds, 3),
            "sleep_seconds": round(sleep_seconds, 3),
            "total_seconds": round(time.perf_counter() - started, 3),
            "gpu_snapshot_enabled": True,
            "modal_volume_created": False,
            "production_routing_changed": False,
        }
        print("AVANTIQO_INTELLIGENCE_FAST_SNAPSHOT_INIT=" + json.dumps(self.snapshot_init, separators=(",", ":")), flush=True)

    @modal.enter(snap=False)
    def wake_after_restore(self) -> None:
        engine = base._LLM_CACHE.get(base.FAST_MODEL)
        if engine is None:
            raise RuntimeError(f"{CONTRACT}_ENGINE_MISSING_AFTER_RESTORE")
        started = time.perf_counter()
        engine.wake_up()
        self.snapshot_wake_seconds = round(time.perf_counter() - started, 3)

    @modal.method()
    def invoke(self, data: dict[str, Any]) -> dict[str, Any]:
        started = time.perf_counter()
        output = base._run(data, model=base.FAST_MODEL, lane="fast")
        result = dict(output)
        result["snapshot_contract"] = CONTRACT
        result["snapshot_wake_seconds"] = self.snapshot_wake_seconds
        result["snapshot_method_seconds"] = round(time.perf_counter() - started, 3)
        result["snapshot_init"] = dict(self.snapshot_init)
        result["production_routing_changed"] = False
        return result
