import json
import os
import re
import sys
from pathlib import Path

from safetensors import safe_open

CONTRACT = "AVANTIQO_INTELLIGENCE_ADAPTER_LAYOUT_V1"
FOUNDATION_MODEL = "Qwen/Qwen3-30B-A3B-Thinking-2507"
TRAINING_ROOT = Path("/runpod-volume/avantiqo-intelligence-training").resolve()
MAX_LORA_RANK = 64
PER_EXPERT_PATTERN = re.compile(
    r"(?:^|\.)experts\.\d+\.(?:gate_proj|up_proj|down_proj)\.lora_[AB](?:\.default)?\.weight$"
)
FUSED_3D_PATTERN = re.compile(
    r"(?:^|\.)experts\.(?:gate_up_proj|down_proj)\.lora_[AB](?:\.default)?\.weight$"
)
MOE_LORA_HINT = re.compile(r"(?:^|\.)experts\..*\.lora_[AB](?:\.default)?\.weight$")


def fail(code: str, detail: str | None = None) -> None:
    payload = {"contract": CONTRACT, "status": "REJECTED", "code": code}
    if detail:
        payload["detail"] = detail
    print(json.dumps(payload, separators=(",", ":")), file=sys.stderr)
    raise SystemExit(2)


def text(value, limit=1000):
    return str(value or "").strip()[:limit]


def resolve_adapter(value: str) -> Path:
    source = Path(text(value, 1000)).expanduser()
    if not source.is_absolute():
        fail("ADAPTER_PATH_MUST_BE_ABSOLUTE")
    candidate = source.resolve()
    if TRAINING_ROOT != candidate and TRAINING_ROOT not in candidate.parents:
        fail("ADAPTER_PATH_OUTSIDE_TRAINING_ROOT")
    if candidate.name != "adapter":
        fail("ADAPTER_DIRECTORY_NAME_INVALID")
    if not candidate.is_dir():
        fail("ADAPTER_DIRECTORY_NOT_FOUND")
    return candidate


def load_config(adapter: Path) -> dict:
    config_path = adapter / "adapter_config.json"
    if not config_path.is_file():
        fail("ADAPTER_CONFIG_REQUIRED")
    try:
        config = json.loads(config_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        fail("ADAPTER_CONFIG_INVALID", str(error))
    base = text(config.get("base_model_name_or_path"), 500)
    if base != FOUNDATION_MODEL:
        fail("ADAPTER_BASE_MODEL_MISMATCH", base or "missing")
    rank = config.get("r")
    try:
        rank = int(rank)
    except (TypeError, ValueError):
        fail("ADAPTER_LORA_RANK_INVALID")
    if rank < 1 or rank > MAX_LORA_RANK:
        fail("ADAPTER_LORA_RANK_OUT_OF_RANGE", str(rank))
    peft_type = text(config.get("peft_type"), 80).upper()
    if peft_type and peft_type != "LORA":
        fail("ADAPTER_PEFT_TYPE_UNSUPPORTED", peft_type)
    return {"rank": rank, "base_model": base, "config": config}


def tensor_keys(adapter: Path) -> list[str]:
    files = sorted(adapter.glob("*.safetensors"))
    if not files:
        fail("ADAPTER_SAFETENSORS_REQUIRED")
    keys = []
    for file_path in files:
        try:
            with safe_open(str(file_path), framework="pt", device="cpu") as handle:
                keys.extend(handle.keys())
        except Exception as error:
            fail("ADAPTER_SAFETENSORS_INVALID", f"{file_path.name}:{error}")
    if not keys:
        fail("ADAPTER_SAFETENSORS_EMPTY")
    return sorted(set(keys))


def classify_layout(keys: list[str]) -> dict:
    per_expert = [key for key in keys if PER_EXPERT_PATTERN.search(key)]
    fused_3d = [key for key in keys if FUSED_3D_PATTERN.search(key)]
    moe_hints = [key for key in keys if MOE_LORA_HINT.search(key)]

    if per_expert and fused_3d:
        fail("ADAPTER_MOE_LAYOUT_MIXED")
    if fused_3d:
        unknown_moe = [key for key in moe_hints if key not in fused_3d]
        if unknown_moe:
            fail("ADAPTER_MOE_LAYOUT_UNKNOWN_KEYS", unknown_moe[0])
        return {
            "layout": "MOE_3D_FUSED_PEFT",
            "is_3d_lora_weight": True,
            "enable_mixed_moe_lora_format": True,
            "matched_moe_key_count": len(fused_3d),
        }
    if per_expert:
        unknown_moe = [key for key in moe_hints if key not in per_expert]
        if unknown_moe:
            fail("ADAPTER_MOE_LAYOUT_UNKNOWN_KEYS", unknown_moe[0])
        return {
            "layout": "MOE_2D_PER_EXPERT",
            "is_3d_lora_weight": False,
            "enable_mixed_moe_lora_format": True,
            "matched_moe_key_count": len(per_expert),
        }

    # Qwen3-30B-A3B is MoE. An adapter with no recognizable expert LoRA layout
    # cannot be safely declared 2D or 3D to vLLM, so candidate serving fails closed.
    fail("ADAPTER_MOE_LAYOUT_UNRECOGNIZED")


def inspect(adapter_path: str) -> dict:
    adapter = resolve_adapter(adapter_path)
    config = load_config(adapter)
    keys = tensor_keys(adapter)
    layout = classify_layout(keys)
    return {
        "contract": CONTRACT,
        "status": "CERTIFIED_FOR_CANDIDATE_STARTUP",
        "adapter_path": str(adapter),
        "base_model": config["base_model"],
        "lora_rank": config["rank"],
        "tensor_key_count": len(keys),
        **layout,
        "governance": {
            "training_root_enforced": True,
            "foundation_model_verified": True,
            "rank_bounded": True,
            "mixed_or_unknown_layout_allowed": False,
            "production_endpoint_effect": "NONE",
        },
    }


if __name__ == "__main__":
    adapter_path = os.getenv("AVANTIQO_INTELLIGENCE_CANDIDATE_ADAPTER_PATH")
    if len(sys.argv) > 1:
        adapter_path = sys.argv[1]
    if not text(adapter_path):
        fail("ADAPTER_PATH_REQUIRED")
    print(json.dumps(inspect(adapter_path), separators=(",", ":")))
