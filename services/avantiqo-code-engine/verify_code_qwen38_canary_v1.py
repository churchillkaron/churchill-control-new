"""Zero-cost source verifier for the isolated Qwen3.8 Code canary.

This verifier intentionally performs no Modal call, no model download and no
GPU work. It statically proves the properties that must remain true before the
candidate is allowed to consume storage or H100 time.
"""

from __future__ import annotations

import ast
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent
POLICY_PATH = ROOT / "code_model_canary_v2.py"
BOOTSTRAP_PATH = ROOT / "modal_code_qwen38_bootstrap.py"
RUNTIME_PATH = ROOT / "modal_code_qwen38_canary_runtime.py"

EXPECTED_MODEL = "Qwen/Qwen3.8-27B-FP8"
EXPECTED_REVISION = "017b9c7af6b5689d5dd426a76e0bc077eb5ca20a"
EXPECTED_VOLUME = "avantiqo-code-models"
EXPECTED_VLLM_COMMIT = "e9d1398d9edfd90fcc1cf783805240e3effec013"
EXPECTED_CURRENT_MARKER = "avantiqo-code-model-ready.json"
EXPECTED_CANDIDATE_MARKER = "avantiqo-code-qwen38-canary-ready.json"
EXPECTED_APPROVAL_ENV = "AVANTIQO_CODE_QWEN38_BOOTSTRAP_APPROVED"


def _source(path: Path) -> str:
    text = path.read_text(encoding="utf-8")
    ast.parse(text, filename=str(path))
    return text


def _tree(path: Path) -> ast.Module:
    return ast.parse(path.read_text(encoding="utf-8"), filename=str(path))


def _literal_assignments(tree: ast.Module) -> dict[str, Any]:
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
            values[target.id] = ast.literal_eval(value_node)
        except (ValueError, TypeError):
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
            return ast.literal_eval(keyword.value)
        except (ValueError, TypeError):
            return None
    return None


def _volume_calls(tree: ast.Module) -> list[ast.Call]:
    return [
        node
        for node in ast.walk(tree)
        if isinstance(node, ast.Call) and _call_name(node).endswith("Volume.from_name")
    ]


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
    call = calls[0]
    assert _keyword_literal(call, "create_if_missing") is False, (
        f"{label}: create_if_missing must be False"
    )
    assert "policy.CODE_VOLUME" in source, f"{label}: canonical policy volume required"
    assert "create_if_missing=True" not in source.replace(" ", ""), (
        f"{label}: new storage creation forbidden"
    )


def _assert_bootstrap() -> None:
    source = _source(BOOTSTRAP_PATH)
    tree = _tree(BOOTSTRAP_PATH)
    constants = _literal_assignments(tree)

    _assert_single_existing_volume(tree, source, "bootstrap")
    assert constants.get("APPROVAL_ENV") == EXPECTED_APPROVAL_ENV
    assert EXPECTED_CURRENT_MARKER in source
    assert EXPECTED_CANDIDATE_MARKER in source
    assert EXPECTED_CURRENT_MARKER != EXPECTED_CANDIDATE_MARKER

    decorators = _app_function_decorators(tree)
    assert {name for name, _ in decorators} == {"inspect", "bootstrap"}
    for name, decorator in decorators:
        assert _keyword_literal(decorator, "gpu") is None, f"bootstrap:{name}: GPU forbidden"

    approval_pos = source.index("os.environ.get(APPROVAL_ENV) != \"YES\"")
    admission_pos = source.index("policy.assert_admitted(_capacity_snapshot())")
    download_pos = source.index("snapshot_download(")
    floor_pos = source.index("policy.MIN_FREE_AFTER_DOWNLOAD_BYTES")
    marker_guard_pos = source.index("CURRENT_MARKER.read_bytes() != current_marker_before")
    candidate_marker_write_pos = source.index("CANDIDATE_MARKER.write_text")
    commit_pos = source.index("model_volume.commit()")

    assert approval_pos < admission_pos < download_pos, (
        "bootstrap: approval + live capacity admission must precede download"
    )
    assert download_pos < floor_pos < candidate_marker_write_pos, (
        "bootstrap: post-download free-space floor must precede readiness marker"
    )
    assert download_pos < marker_guard_pos < candidate_marker_write_pos, (
        "bootstrap: current model marker must be proven unchanged before candidate readiness"
    )
    assert candidate_marker_write_pos < commit_pos, (
        "bootstrap: candidate marker must be committed atomically with snapshot"
    )
    assert "revision=policy.CANDIDATE_REVISION" in source
    assert "repo_id=policy.CANDIDATE_MODEL" in source
    assert "production_routing_change\": False" in source
    assert "production_deploy_performed\": False" in source
    assert "gpu_used\": False" in source
    assert "volume_created\": False" in source


def _assert_runtime() -> None:
    source = _source(RUNTIME_PATH)
    tree = _tree(RUNTIME_PATH)
    constants = _literal_assignments(tree)

    _assert_single_existing_volume(tree, source, "runtime")
    assert constants.get("VLLM_COMMIT") == EXPECTED_VLLM_COMMIT
    assert constants.get("MAX_MODEL_LEN") == 32_768
    assert constants.get("GPU_MEMORY_UTILIZATION") == 0.90
    assert EXPECTED_CANDIDATE_MARKER in source
    assert "snapshot_download" not in source
    assert "huggingface_hub" not in source
    assert 'os.environ["HF_HUB_OFFLINE"] = "1"' in source
    assert 'os.environ["TRANSFORMERS_OFFLINE"] = "1"' in source
    assert 'enforce_eager=False' in source
    assert 'enable_prefix_caching=True' in source
    assert 'safetensors_load_strategy="prefetch"' in source
    assert "NO_DEFAULT_PAID_ENTRYPOINT" in source
    assert "production_routing_change\": False" in source
    assert "production_deploy_performed\": False" in source
    assert "model_download_performed\": False" in source
    assert "volume_created\": False" in source

    decorators = dict(_app_function_decorators(tree))
    assert set(decorators) == {"runtime_probe", "generate"}
    for name in ("runtime_probe", "generate"):
        decorator = decorators[name]
        assert _keyword_literal(decorator, "gpu") == "H100", f"runtime:{name}: H100 pin required"
        assert _keyword_literal(decorator, "min_containers") == 0
        assert _keyword_literal(decorator, "max_containers") == 1

    assert "policy.CANDIDATE_MODEL" in source
    assert "policy.CANDIDATE_REVISION" in source
    assert "policy.CODE_VOLUME" in source
    assert "organization_id\") != \"benchmark-only\"" in source


def _assert_policy() -> None:
    source = _source(POLICY_PATH)
    tree = _tree(POLICY_PATH)
    constants = _literal_assignments(tree)
    assert constants.get("CANDIDATE_MODEL") == EXPECTED_MODEL
    assert constants.get("CANDIDATE_REVISION") == EXPECTED_REVISION
    assert constants.get("CODE_VOLUME") == EXPECTED_VOLUME
    assert constants.get("CURRENT_MODEL") != EXPECTED_MODEL
    assert constants.get("MIN_NATIVE_CONTEXT") == 262_144
    assert "single_code_storage" in source
    assert "candidate_fits_single_volume" in source
    assert "production_routing_change" in source
    assert "production_deploy_performed" in source


def main() -> None:
    _assert_policy()
    _assert_bootstrap()
    _assert_runtime()
    print("AVANTIQO_CODE_QWEN38_POLICY_PIN=PASS")
    print("AVANTIQO_CODE_QWEN38_SINGLE_STORAGE=PASS")
    print("AVANTIQO_CODE_QWEN38_BOOTSTRAP_GUARDS=PASS")
    print("AVANTIQO_CODE_QWEN38_RUNTIME_ISOLATION=PASS")
    print("AVANTIQO_CODE_QWEN38_ZERO_COST_VERIFIER=PASS")


if __name__ == "__main__":
    main()
