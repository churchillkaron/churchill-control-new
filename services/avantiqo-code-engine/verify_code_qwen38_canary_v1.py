"""Zero-cost source verifier for the isolated Qwen3.8 Code canary.

This verifier intentionally performs no Modal call, model download, container
start or GPU work. It statically proves the properties that must remain true
before the candidate is allowed to consume persistent storage or H100 time.
"""

from __future__ import annotations

import ast
import operator
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent
POLICY_PATH = ROOT / "code_model_canary_v2.py"
PREFLIGHT_PATH = ROOT / "modal_code_model_canary_preflight.py"
BOOTSTRAP_PATH = ROOT / "modal_code_qwen38_bootstrap.py"
RUNTIME_PATH = ROOT / "modal_code_qwen38_canary_runtime.py"

EXPECTED_POLICY_CONTRACT = "AVANTIQO_CODE_MODEL_CANARY_V3"
EXPECTED_BOOTSTRAP_CONTRACT = "AVANTIQO_CODE_QWEN38_BOOTSTRAP_V2"
EXPECTED_MODEL = "Qwen/Qwen3.8-27B-FP8"
EXPECTED_REVISION = "017b9c7af6b5689d5dd426a76e0bc077eb5ca20a"
EXPECTED_VOLUME = "avantiqo-code-models"
EXPECTED_VLLM_COMMIT = "e9d1398d9edfd90fcc1cf783805240e3effec013"
EXPECTED_CURRENT_MARKER = "avantiqo-code-model-ready.json"
EXPECTED_CANDIDATE_MARKER = "avantiqo-code-qwen38-canary-ready.json"
EXPECTED_APPROVAL_ENV = "AVANTIQO_CODE_QWEN38_BOOTSTRAP_APPROVED"

_SAFE_BINOPS = {
    ast.Add: operator.add,
    ast.Sub: operator.sub,
    ast.Mult: operator.mul,
    ast.FloorDiv: operator.floordiv,
    ast.Pow: operator.pow,
}


def _source(path: Path) -> str:
    text = path.read_text(encoding="utf-8")
    ast.parse(text, filename=str(path))
    return text


def _tree(path: Path) -> ast.Module:
    return ast.parse(path.read_text(encoding="utf-8"), filename=str(path))


def _safe_constant(node: ast.expr) -> Any:
    if isinstance(node, ast.Constant):
        return node.value
    if isinstance(node, ast.UnaryOp) and isinstance(node.op, (ast.UAdd, ast.USub)):
        value = _safe_constant(node.operand)
        if not isinstance(value, (int, float)):
            raise ValueError("numeric unary operand required")
        return value if isinstance(node.op, ast.UAdd) else -value
    if isinstance(node, ast.BinOp) and type(node.op) in _SAFE_BINOPS:
        left = _safe_constant(node.left)
        right = _safe_constant(node.right)
        if not isinstance(left, (int, float)) or not isinstance(right, (int, float)):
            raise ValueError("numeric binary operands required")
        result = _SAFE_BINOPS[type(node.op)](left, right)
        if isinstance(result, (int, float)) and abs(result) <= 2**63:
            return result
        raise ValueError("constant result out of bounds")
    return ast.literal_eval(node)


def _constant_assignments(tree: ast.Module) -> dict[str, Any]:
    values: dict[str, Any] = {}
    for node in tree.body:
        if not isinstance(node, (ast.Assign, ast.AnnAssign)):
            continue
        target: ast.expr | None
        value_node: ast.expr | None
        if isinstance(node, ast.Assign):
            target = node.targets[0] if len(node.targets) == 1 else None
            value_node = node.value
        else:
            target = node.target
            value_node = node.value
        if not isinstance(target, ast.Name) or value_node is None:
            continue
        try:
            values[target.id] = _safe_constant(value_node)
        except (ValueError, TypeError, ZeroDivisionError, OverflowError):
            continue
    return values


def _call_name(node: ast.Call) -> str:
    parts: list[str] = []
    value: ast.expr = node.func
    while isinstance(value, ast.Attribute):
        parts.append(value.attr)
        value = value.value
    if isinstance(value, ast.Name):
        parts.append(value.id)
    return ".".join(reversed(parts))


def _keyword_literal(call: ast.Call, name: str) -> Any:
    for keyword in call.keywords:
        if keyword.arg != name:
            continue
        try:
            return _safe_constant(keyword.value)
        except (ValueError, TypeError, ZeroDivisionError, OverflowError):
            return None
    return None


def _volume_calls(tree: ast.Module) -> list[ast.Call]:
    return [node for node in ast.walk(tree) if isinstance(node, ast.Call) and _call_name(node).endswith("Volume.from_name")]


def _app_function_decorators(tree: ast.Module) -> list[tuple[str, ast.Call]]:
    found: list[tuple[str, ast.Call]] = []
    for node in tree.body:
        if not isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            continue
        for decorator in node.decorator_list:
            if isinstance(decorator, ast.Call) and _call_name(decorator).endswith("app.function"):
                found.append((node.name, decorator))
    return found


def _assert_single_existing_volume(tree: ast.Module, source: str, label: str) -> None:
    calls = _volume_calls(tree)
    assert len(calls) == 1, f"{label}: exactly one Volume.from_name call required"
    assert _keyword_literal(calls[0], "create_if_missing") is False
    assert "policy.CODE_VOLUME" in source
    assert "create_if_missing=True" not in source.replace(" ", "")


def _assert_policy() -> None:
    source = _source(POLICY_PATH)
    constants = _constant_assignments(_tree(POLICY_PATH))
    assert constants.get("CONTRACT") == EXPECTED_POLICY_CONTRACT
    assert constants.get("CANDIDATE_MODEL") == EXPECTED_MODEL
    assert constants.get("CANDIDATE_REVISION") == EXPECTED_REVISION
    assert constants.get("CODE_VOLUME") == EXPECTED_VOLUME
    assert constants.get("CURRENT_MODEL") != EXPECTED_MODEL
    assert constants.get("MIN_NATIVE_CONTEXT") == 262_144
    assert constants.get("MAX_CANDIDATE_BYTES") == 32 * 1024**3
    for invariant in (
        "single_code_storage", "candidate_size_bounded", "distributed_volume_storage",
        "fixed_capacity_assumption_used", "direct_to_volume_download",
        "explicit_ephemeral_disk_requested", "production_routing_change",
        "production_deploy_performed", "volume_created",
    ):
        assert invariant in source, f"policy invariant missing: {invariant}"
    for retired in (
        "candidate_fits_single_volume", "MIN_FREE_AFTER_DOWNLOAD_BYTES",
        "MIN_BOOTSTRAP_EPHEMERAL_DISK_BYTES", "PLANNED_BOOTSTRAP_EPHEMERAL_DISK_BYTES",
        "bootstrap_ephemeral_disk_safe",
    ):
        assert retired not in source, f"retired invariant present: {retired}"


def _assert_preflight() -> None:
    source = _source(PREFLIGHT_PATH)
    tree = _tree(PREFLIGHT_PATH)
    assert not _app_function_decorators(tree)
    for token in (
        "modal.Volume.objects.list()", "volume.hydrate()", "volume.read_file",
        'distributed_volume_storage\": True', 'fixed_capacity_assumption_used\": False',
        'direct_to_volume_download\": True', 'explicit_ephemeral_disk_requested\": False',
        'modal_function_created\": False', 'container_started\": False',
        'gpu_used\": False', 'model_download_performed\": False', 'volume_created\": False',
    ):
        assert token in source, token
    assert "shutil.disk_usage" not in source
    assert "snapshot_download" not in source
    assert "bootstrap_ephemeral_disk" not in source


def _assert_bootstrap() -> None:
    source = _source(BOOTSTRAP_PATH)
    tree = _tree(BOOTSTRAP_PATH)
    constants = _constant_assignments(tree)
    _assert_single_existing_volume(tree, source, "bootstrap")
    assert constants.get("CONTRACT") == EXPECTED_BOOTSTRAP_CONTRACT
    assert constants.get("APPROVAL_ENV") == EXPECTED_APPROVAL_ENV
    assert EXPECTED_CURRENT_MARKER in source and EXPECTED_CANDIDATE_MARKER in source

    decorators = dict(_app_function_decorators(tree))
    assert set(decorators) == {"bootstrap"}
    bootstrap_decorator = decorators["bootstrap"]
    assert _keyword_literal(bootstrap_decorator, "gpu") is None
    assert _keyword_literal(bootstrap_decorator, "ephemeral_disk") is None

    bootstrap_def = next(node for node in tree.body if isinstance(node, ast.FunctionDef) and node.name == "bootstrap")
    assert bootstrap_def.args.args and bootstrap_def.args.args[0].arg == "approved"
    assert "if approved is not True:" in source
    assert 'os.environ.get(APPROVAL_ENV) != "YES"' in source
    assert "bootstrap.remote(approved=True)" in source

    for cache_guard in (
        '"HF_HOME": str(HF_ROOT)', '"HF_HUB_CACHE": str(HF_CACHE_ROOT)',
        '"HF_XET_CACHE": str(HF_XET_CACHE_ROOT)', '"HF_XET_CHUNK_CACHE_SIZE_BYTES": "0"',
    ):
        assert cache_guard in source, cache_guard

    remote_approval_pos = source.index("if approved is not True:")
    admission_pos = source.index("policy.assert_admitted(_mounted_admission_snapshot())")
    marker_capture_pos = source.index("current_marker_before = CURRENT_MARKER.read_bytes()")
    download_pos = source.index("snapshot_download(")
    marker_guard_pos = source.index("CURRENT_MARKER.read_bytes() != current_marker_before")
    candidate_marker_write_pos = source.index("CANDIDATE_MARKER.write_text")
    commit_pos = source.index("model_volume.commit()")
    post_commit_guard_pos = source.index("CURRENT_MARKER.read_bytes() != current_marker_before", marker_guard_pos + 1)
    local_approval_pos = source.index('os.environ.get(APPROVAL_ENV) != "YES"', download_pos)
    remote_call_pos = source.index("bootstrap.remote(approved=True)")
    assert remote_approval_pos < admission_pos < marker_capture_pos < download_pos
    assert download_pos < marker_guard_pos < candidate_marker_write_pos < commit_pos < post_commit_guard_pos
    assert local_approval_pos < remote_call_pos

    for token in (
        "revision=policy.CANDIDATE_REVISION", "repo_id=policy.CANDIDATE_MODEL",
        "cache_dir=str(HF_CACHE_ROOT)", 'direct_to_volume_download\": True',
        'explicit_ephemeral_disk_requested\": False', 'distributed_volume_storage\": True',
        'fixed_capacity_assumption_used\": False', 'production_routing_change\": False',
        'production_deploy_performed\": False', 'gpu_used\": False', 'volume_created\": False',
    ):
        assert token in source, token
    assert "shutil.disk_usage" not in source
    assert "EPHEMERAL_DISK" not in source
    assert "PLANNED_BOOTSTRAP_EPHEMERAL_DISK_BYTES" not in source


def _assert_runtime() -> None:
    source = _source(RUNTIME_PATH)
    tree = _tree(RUNTIME_PATH)
    constants = _constant_assignments(tree)
    _assert_single_existing_volume(tree, source, "runtime")
    assert constants.get("VLLM_COMMIT") == EXPECTED_VLLM_COMMIT
    assert constants.get("MAX_MODEL_LEN") == 32_768
    assert constants.get("GPU_MEMORY_UTILIZATION") == 0.90
    assert EXPECTED_CANDIDATE_MARKER in source
    assert "snapshot_download" not in source and "huggingface_hub" not in source
    for token in (
        'os.environ["HF_HUB_OFFLINE"] = "1"', 'os.environ["TRANSFORMERS_OFFLINE"] = "1"',
        "enforce_eager=False", "enable_prefix_caching=True", 'safetensors_load_strategy="prefetch"',
        "NO_DEFAULT_PAID_ENTRYPOINT", 'production_routing_change\": False',
        'production_deploy_performed\": False', 'model_download_performed\": False', 'volume_created\": False',
    ):
        assert token in source, token
    decorators = dict(_app_function_decorators(tree))
    assert set(decorators) == {"runtime_probe", "generate"}
    for name in ("runtime_probe", "generate"):
        decorator = decorators[name]
        assert _keyword_literal(decorator, "gpu") == "H100"
        assert _keyword_literal(decorator, "min_containers") == 0
        assert _keyword_literal(decorator, "max_containers") == 1
    assert "policy.CANDIDATE_MODEL" in source and "policy.CANDIDATE_REVISION" in source and "policy.CODE_VOLUME" in source
    assert 'organization_id\") != \"benchmark-only\"' in source


def main() -> None:
    _assert_policy(); _assert_preflight(); _assert_bootstrap(); _assert_runtime()
    print("AVANTIQO_CODE_QWEN38_POLICY_V3=PASS")
    print("AVANTIQO_CODE_QWEN38_CONTROL_PLANE_PREFLIGHT=PASS")
    print("AVANTIQO_CODE_QWEN38_DIRECT_TO_VOLUME=PASS")
    print("AVANTIQO_CODE_QWEN38_EXPLICIT_REMOTE_APPROVAL=PASS")
    print("AVANTIQO_CODE_QWEN38_SINGLE_STORAGE=PASS")
    print("AVANTIQO_CODE_QWEN38_BOOTSTRAP_V2_GUARDS=PASS")
    print("AVANTIQO_CODE_QWEN38_RUNTIME_ISOLATION=PASS")
    print("AVANTIQO_CODE_QWEN38_ZERO_COST_VERIFIER=PASS")


if __name__ == "__main__":
    main()
