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
EXPECTED_TARGET_PARAMETERS = {
    "mlp.experts.gate_up_proj",
    "mlp.experts.down_proj",
}
EXPERT_LORA_KEY = re.compile(
    r"experts.*(?:gate_up_proj|down_proj).*lora_[AB](?:\.default)?(?:\.weight)?$"
)


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

    target_parameters = {
        text(value, 300)
        for value in config.get("target_parameters", [])
        if text(value, 300)
    }
    if target_parameters != EXPECTED_TARGET_PARAMETERS:
        fail(
            "ADAPTER_QWEN3_MOE_TARGET_PARAMETERS_MISMATCH",
            json.dumps(sorted(target_parameters), separators=(",", ":")),
        )

    rank_pattern = config.get("rank_pattern") or {}
    if not isinstance(rank_pattern, dict):
        fail("ADAPTER_QWEN3_MOE_RANK_PATTERN_REQUIRED")
    for key in ("experts.gate_up_proj", "experts.down_proj"):
        try:
            effective_rank = int(rank_pattern.get(key, 0))
        except (TypeError, ValueError):
            effective_rank = 0
        if effective_rank < 1:
            fail("ADAPTER_QWEN3_MOE_EFFECTIVE_RANK_INVALID", key)

    try:
        dropout = float(config.get("lora_dropout", 0.0) or 0.0)
    except (TypeError, ValueError):
        fail("ADAPTER_LORA_DROPOUT_INVALID")
    if dropout != 0.0:
        fail("ADAPTER_QWEN3_MOE_LORA_DROPOUT_MUST_BE_ZERO")

    return {
        "rank": rank,
        "base_model": base,
        "config": config,
        "target_parameters": sorted(target_parameters),
    }


def tensor_metadata(adapter: Path) -> dict[str, list[int]]:
    files = sorted(adapter.glob("*.safetensors"))
    if not files:
        fail("ADAPTER_SAFETENSORS_REQUIRED")
    metadata = {}
    for file_path in files:
        try:
            with safe_open(str(file_path), framework="pt", device="cpu") as handle:
                for key in handle.keys():
                    metadata[key] = list(handle.get_slice(key).get_shape())
        except Exception as error:
            fail("ADAPTER_SAFETENSORS_INVALID", f"{file_path.name}:{error}")
    if not metadata:
        fail("ADAPTER_SAFETENSORS_EMPTY")
    return metadata


def classify_layout(metadata: dict[str, list[int]]) -> dict:
    expert_items = {
        key: shape
        for key, shape in metadata.items()
        if EXPERT_LORA_KEY.search(key)
    }
    if not expert_items:
        fail("ADAPTER_MOE_LORA_TENSORS_REQUIRED")

    target_coverage = {
        "gate_up_proj": {"A": False, "B": False},
        "down_proj": {"A": False, "B": False},
    }
    for key, shape in expert_items.items():
        if len(shape) != 3:
            fail("ADAPTER_MOE_LORA_TENSOR_NOT_3D", f"{key}:{shape}")
        target = "gate_up_proj" if "gate_up_proj" in key else "down_proj"
        side = "A" if "lora_A" in key else "B"
        target_coverage[target][side] = True

    for target, coverage in target_coverage.items():
        if coverage != {"A": True, "B": True}:
            fail(
                "ADAPTER_MOE_LORA_TARGET_INCOMPLETE",
                f"{target}:{json.dumps(coverage, separators=(',', ':'))}",
            )

    return {
        "layout": "MOE_3D_FUSED_PEFT",
        "is_3d_lora_weight": True,
        "enable_mixed_moe_lora_format": True,
        "matched_moe_tensor_count": len(expert_items),
        "expert_target_coverage": target_coverage,
    }


def inspect(adapter_path: str) -> dict:
    adapter = resolve_adapter(adapter_path)
    config = load_config(adapter)
    metadata = tensor_metadata(adapter)
    layout = classify_layout(metadata)
    return {
        "contract": CONTRACT,
        "status": "CERTIFIED_FOR_CANDIDATE_STARTUP",
        "adapter_path": str(adapter),
        "base_model": config["base_model"],
        "lora_rank": config["rank"],
        "target_parameters": config["target_parameters"],
        "tensor_key_count": len(metadata),
        **layout,
        "governance": {
            "training_root_enforced": True,
            "foundation_model_verified": True,
            "rank_bounded": True,
            "target_parameters_verified": True,
            "rank_pattern_verified": True,
            "zero_dropout_verified": True,
            "fused_3d_tensor_shapes_verified": True,
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
