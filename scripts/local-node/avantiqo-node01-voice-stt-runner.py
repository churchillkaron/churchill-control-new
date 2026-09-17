from __future__ import annotations

import argparse
import json
import os
import sys
import time
from pathlib import Path

MODEL_PATH = Path(r"C:\Avantiqo\voice-stt-models\whisper-large-v3-turbo")
HANDLER_DIR = Path(r"C:\Avantiqo\voice-stt")

def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    args = parser.parse_args()

    os.environ["AVANTIQO_VOICE_STT_FOUNDATION_MODEL"] = "openai/whisper-large-v3-turbo"
    os.environ["AVANTIQO_VOICE_STT_LOCAL_MODEL_PATH"] = str(MODEL_PATH)
    os.environ["AVANTIQO_VOICE_STT_BATCH_SIZE"] = "1"
    os.environ["HF_HUB_OFFLINE"] = "1"
    os.environ["TRANSFORMERS_OFFLINE"] = "1"
    sys.path.insert(0, str(HANDLER_DIR))

    import torch
    import handler as voice_engine

    if not torch.cuda.is_available():
        raise RuntimeError("AVANTIQO_LOCAL_VOICE_STT_CUDA_REQUIRED")
    if voice_engine.BATCH_SIZE != 1:
        raise RuntimeError("AVANTIQO_LOCAL_VOICE_STT_BATCH_SIZE_INVALID")

    payload = json.loads(Path(args.input).read_text(encoding="utf-8-sig"))
    torch.cuda.empty_cache()
    torch.cuda.reset_peak_memory_stats()
    started = time.perf_counter()
    output = voice_engine.handler({"id": "local-node-stt", "input": payload})
    torch.cuda.synchronize()
    result = dict(output)
    result.update({
        "infrastructure_provider": "AVANTIQO_LOCAL_NODE_V1",
        "execution_resource": "LOCAL_GPU",
        "runtime_model": "openai/whisper-large-v3-turbo",
        "local_batch_size": 1,
        "local_elapsed_seconds": round(time.perf_counter() - started, 3),
        "gpu_peak_allocated_bytes": int(torch.cuda.max_memory_allocated()),
        "raw_reasoning_persisted": False,
    })
    print(json.dumps(result, separators=(",", ":"), ensure_ascii=False))
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
