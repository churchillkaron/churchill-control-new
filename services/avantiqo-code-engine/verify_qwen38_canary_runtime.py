"""Zero-cost structural verifier for the isolated Qwen3.8 Code canary path."""

from __future__ import annotations

import ast
from pathlib import Path

ROOT = Path(__file__).resolve().parent
RUNTIME = ROOT / "modal_code_qwen38_canary_runtime.py"
BOOTSTRAP = ROOT / "modal_code_qwen38_bootstrap.py"
POLICY = ROOT / "code_model_canary_v2.py"
PREFLIGHT = ROOT / "modal_code_model_canary_preflight.py"


def _text(path: Path) -> str:
    value = path.read_text(encoding="utf-8")
    ast.parse(value, filename=str(path))
    return value


def main() -> None:
    runtime = _text(RUNTIME)
    bootstrap = _text(BOOTSTRAP)
    policy = _text(POLICY)
    preflight = _text(PREFLIGHT)

    required_runtime = (
        'CANDIDATE_MODEL',
        'CANDIDATE_REVISION',
        'create_if_missing=False',
        'gpu="H100"',
        'min_containers=0',
        'max_containers=1',
        'HF_HUB_OFFLINE',
        'TRANSFORMERS_OFFLINE',
        'model_download_performed',
        'production_routing_change',
        'production_deploy_performed',
        'NO_DEFAULT_PAID_ENTRYPOINT',
        'enforce_eager=False',
        'safetensors_load_strategy="prefetch"',
    )
    for token in required_runtime:
        assert token in runtime, token
    assert 'create_if_missing=True' not in runtime
    assert 'snapshot_download(' not in runtime
    assert 'handler.py' in runtime

    required_policy = (
        'AVANTIQO_CODE_MODEL_CANARY_V3',
        'MIN_BOOTSTRAP_EPHEMERAL_DISK_BYTES',
        'PLANNED_BOOTSTRAP_EPHEMERAL_DISK_BYTES',
        'distributed_volume_storage',
        'fixed_capacity_assumption_used',
        'single_code_storage',
    )
    for token in required_policy:
        assert token in policy, token
    assert 'MIN_FREE_AFTER_DOWNLOAD_BYTES' not in policy
    assert 'code_volume_free_bytes' not in policy

    required_preflight = (
        'modal.Volume.objects.list()',
        'modal.Volume.from_name(policy.CODE_VOLUME, create_if_missing=False)',
        'volume.read_file(',
        'control_plane_only',
        'modal_function_created',
        'container_started',
        'fixed_capacity_assumption_used',
    )
    for token in required_preflight:
        assert token in preflight, token
    assert '@app.function' not in preflight
    assert 'shutil.disk_usage' not in preflight

    required_bootstrap = (
        'create_if_missing=False',
        'AVANTIQO_CODE_QWEN38_BOOTSTRAP_APPROVED',
        'policy.assert_admitted',
        'snapshot_download(',
        'CANDIDATE_REVISION',
        'ephemeral_disk=EPHEMERAL_DISK_MIB',
        'PLANNED_BOOTSTRAP_EPHEMERAL_DISK_BYTES',
        'distributed_volume_storage',
        'fixed_capacity_assumption_used',
        'CURRENT_MARKER_CHANGED',
        'model_volume.commit()',
        'gpu_used',
        'production_routing_change',
        'production_deploy_performed',
        'volume_created',
    )
    for token in required_bootstrap:
        assert token in bootstrap, token
    assert 'create_if_missing=True' not in bootstrap
    assert 'gpu=' not in bootstrap
    assert 'CURRENT_MARKER.write_' not in bootstrap
    assert 'shutil.disk_usage' not in bootstrap
    assert 'MIN_FREE_AFTER_DOWNLOAD_BYTES' not in bootstrap

    print('AVANTIQO_CODE_QWEN38_RUNTIME_ISOLATED=PASS')
    print('AVANTIQO_CODE_QWEN38_BOOTSTRAP_SAME_VOLUME=PASS')
    print('AVANTIQO_CODE_QWEN38_MODAL_VOLUME_SEMANTICS=PASS')
    print('AVANTIQO_CODE_QWEN38_CONTROL_PLANE_PREFLIGHT=PASS')
    print('AVANTIQO_CODE_QWEN38_NO_PRODUCTION_ROUTING=PASS')
    print('AVANTIQO_CODE_QWEN38_ZERO_COST_VERIFIER=PASS')


if __name__ == '__main__':
    main()
