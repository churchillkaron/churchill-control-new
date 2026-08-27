import hashlib
import json
import os
import sys

from inspect_adapter import FOUNDATION_MODEL, inspect

WORKER_MAIN = "/src/main.py"
MODEL_PREFIX = "avantiqo-intelligence-deep-adapter"
CONTRACT = "AVANTIQO_INTELLIGENCE_PRODUCTION_ADAPTER_STARTUP_V1"


def text(value, limit=2000):
    return str(value or "").strip()[:limit]


def enabled(value):
    return text(value, 20).lower() in {"1", "true", "yes", "on"}


def fail(code):
    print(
        json.dumps(
            {
                "contract": CONTRACT,
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


def adapter_fingerprint(adapter_path: str) -> str:
    return hashlib.sha256(adapter_path.encode("utf-8")).hexdigest()[:16]


def production_model_name(adapter_path: str) -> str:
    return f"{MODEL_PREFIX}-{adapter_fingerprint(adapter_path)}"


def configure_environment():
    if not enabled(os.getenv("AVANTIQO_INTELLIGENCE_PRODUCTION_ADAPTER_ENABLED")):
        fail("PRODUCTION_ADAPTER_DISABLED")

    adapter_path = text(
        os.getenv("AVANTIQO_INTELLIGENCE_PRODUCTION_ADAPTER_PATH"),
        1000,
    )
    if not adapter_path:
        fail("PRODUCTION_ADAPTER_PATH_REQUIRED")

    expected_fingerprint = text(
        os.getenv("AVANTIQO_INTELLIGENCE_PRODUCTION_ADAPTER_FINGERPRINT"),
        128,
    ).lower()
    if not expected_fingerprint:
        fail("PRODUCTION_ADAPTER_FINGERPRINT_REQUIRED")

    model_candidate_id = text(
        os.getenv("AVANTIQO_INTELLIGENCE_PRODUCTION_MODEL_CANDIDATE_ID"),
        160,
    )
    if not model_candidate_id:
        fail("PRODUCTION_MODEL_CANDIDATE_ID_REQUIRED")

    certification = inspect(adapter_path)
    actual_fingerprint = adapter_fingerprint(certification["adapter_path"])
    if actual_fingerprint != expected_fingerprint:
        fail("PRODUCTION_ADAPTER_FINGERPRINT_MISMATCH")

    production_model = production_model_name(certification["adapter_path"])
    module = {
        "name": production_model,
        "path": certification["adapter_path"],
        "base_model_name": FOUNDATION_MODEL,
        "is_3d_lora_weight": certification["is_3d_lora_weight"],
    }

    os.environ["MODEL_NAME"] = FOUNDATION_MODEL
    os.environ["OPENAI_SERVED_MODEL_NAME_OVERRIDE"] = "avantiqo-intelligence-deep-base"
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
                "contract": CONTRACT,
                "status": "CONFIGURED",
                "foundation_model": FOUNDATION_MODEL,
                "production_model": production_model,
                "model_candidate_id": model_candidate_id,
                "adapter_artifact_fingerprint": actual_fingerprint,
                "adapter_layout": certification["layout"],
                "adapter_serialization": certification["serialization"],
                "is_3d_lora_weight": certification["is_3d_lora_weight"],
                "lora_rank": certification["lora_rank"],
                "tool_call_parser": "hermes",
                "reasoning_parser": "qwen3",
                "fast_lane_effect": "NONE",
                "automatic_promotion": False,
                "activation_authority": "EXTERNAL_EXPLICIT_RELEASE_BINDER_ONLY",
            },
            separators=(",", ":"),
        )
    )


def main():
    configure_environment()
    os.execv(sys.executable, [sys.executable, WORKER_MAIN])


if __name__ == "__main__":
    main()
