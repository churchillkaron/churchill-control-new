"""Zero-cost structural verifier for the isolated Qwen3.8 Code canary path."""

from __future__ import annotations

import ast
from pathlib import Path

ROOT = Path(__file__).resolve().parent
RUNTIME = ROOT / "modal_code_qwen38_canary_runtime.py"
BOOTSTRAP = ROOT / "modal_code_qwen38_bootstrap.py"


def _text(path: Path) -> str:
    value = path.read_text(encoding="utf-8")
    ast.parse(value, filename=str(path))
    return value


def main() -> None:
    runtime = _text(RUNTIME)
    bootstrap = _text(BOOTSTRAP)

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
    assert 'handler.py' in runtime  # documented non-replacement boundary

    required_bootstrap = (
        'create_if_missing=False',
        'AVANTIQO_CODE_QWEN38_BOOTSTRAP_APPROVED',
        'policy.assert_admitted',
        'snapshot_download(',
        'CANDIDATE_REVISION',
        'MIN_FREE_AFTER_DOWNLOAD_BYTES',
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

    print('AVANTIQO_CODE_QWEN38_RUNTIME_ISOLATED=PASS')
    print('AVANTIQO_CODE_QWEN38_BOOTSTRAP_SAME_VOLUME=PASS')
    print('AVANTIQO_CODE_QWEN38_NO_PRODUCTION_ROUTING=PASS')
    print('AVANTIQO_CODE_QWEN38_ZERO_COST_VERIFIER=PASS')


if __name__ == '__main__':
    main()
