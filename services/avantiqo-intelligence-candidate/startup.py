import json
import os
import sys

from inspect_adapter import FOUNDATION_MODEL, inspect

CANDIDATE_MODEL = "avantiqo-intelligence-candidate-v1"
WORKER_MAIN = "/src/main.py"


def text(value, limit=2000):
    return str(value or "").strip()[:limit]


def enabled(value):
    return text(value, 20).lower() in {"1", "true", "yes", "on"}


def fail(code):
    print(
        json.dumps(
            {
                "contract": "AVANTIQO_INTELLIGENCE_CANDIDATE_STARTUP_V1",
                "status": "REJECTED",
                "code": code,
            },
            separators=(",", ":"),
        ),
        file=sys.stderr,
    )
    raise SystemExit(2)


def append_extra_flag(existing: str, flag: str) -> str:
    source = text(existing, 12000)
    return f"{source} {flag}".strip()


def configure_environment():
    if not enabled(os.getenv("AVANTIQO_INTELLIGENCE_CANDIDATE_ENABLED")):
        fail("CANDIDATE_ENDPOINT_DISABLED")

    adapter_path = text(os.getenv("AVANTIQO_INTELLIGENCE_CANDIDATE_ADAPTER_PATH"), 1000)
    if not adapter_path:
        fail("CANDIDATE_ADAPTER_PATH_REQUIRED")

    certification = inspect(adapter_path)
    module = {
        "name": CANDIDATE_MODEL,
        "path": certification["adapter_path"],
        "base_model_name": FOUNDATION_MODEL,
        "is_3d_lora_weight": certification["is_3d_lora_weight"],
    }

    os.environ["MODEL_NAME"] = FOUNDATION_MODEL
    os.environ["OPENAI_SERVED_MODEL_NAME_OVERRIDE"] = "avantiqo-intelligence-candidate-base"
    os.environ["ENABLE_LORA"] = "true"
    os.environ["MAX_LORA_RANK"] = str(certification["lora_rank"])
    os.environ["MAX_LORAS"] = "1"
    os.environ["MAX_CPU_LORAS"] = "1"
    os.environ["LORA_MODULES"] = json.dumps(module, separators=(",", ":"))
    os.environ["ENABLE_AUTO_TOOL_CHOICE"] = "true"
    os.environ["TOOL_CALL_PARSER"] = "hermes"
    os.environ["REASONING_PARSER"] = "qwen3"
    os.environ["MAX_CONCURRENCY"] = text(os.getenv("MAX_CONCURRENCY"), 20) or "4"
    os.environ["VLLM_EXTRA_ARGS"] = append_extra_flag(
        os.getenv("VLLM_EXTRA_ARGS", ""),
        "--enable-mixed-moe-lora-format",
    )

    print(
        json.dumps(
            {
                "contract": "AVANTIQO_INTELLIGENCE_CANDIDATE_STARTUP_V1",
                "status": "CONFIGURED",
                "foundation_model": FOUNDATION_MODEL,
                "candidate_model": CANDIDATE_MODEL,
                "adapter_layout": certification["layout"],
                "is_3d_lora_weight": certification["is_3d_lora_weight"],
                "lora_rank": certification["lora_rank"],
                "production_endpoint_effect": "NONE",
            },
            separators=(",", ":"),
        )
    )


def main():
    configure_environment()
    os.execv(sys.executable, [sys.executable, WORKER_MAIN])


if __name__ == "__main__":
    main()
