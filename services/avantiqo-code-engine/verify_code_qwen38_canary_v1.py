"""Zero-cost source verifier for the isolated Qwen3.8 Code canary."""

from __future__ import annotations

import ast
from pathlib import Path

ROOT = Path(__file__).resolve().parent
POLICY_PATH = ROOT / "code_model_canary_v2.py"
PREFLIGHT_PATH = ROOT / "modal_code_model_canary_preflight.py"
BOOTSTRAP_PATH = ROOT / "modal_code_qwen38_bootstrap.py"
RUNTIME_PATH = ROOT / "modal_code_qwen38_canary_runtime.py"

EXPECTED_MODEL = "Qwen/Qwen3.8-27B-FP8"
EXPECTED_REVISION = "017b9c7af6b5689d5dd426a76e0bc077eb5ca20a"
EXPECTED_VOLUME = "avantiqo-code-models"
EXPECTED_RUNTIME_CONTRACT = "AVANTIQO_CODE_QWEN38_CANARY_RUNTIME_V3"
EXPECTED_VLLM_VERSION = "0.28.0"
EXPECTED_VLLM_BUILD_COMMIT = "2cf0a6915ce544dc493a0990f2ea38d81601128a"


def _source(path: Path) -> str:
    text = path.read_text(encoding="utf-8")
    ast.parse(text, filename=str(path))
    return text


def _assert_policy() -> None:
    source = _source(POLICY_PATH)
    assert f'CANDIDATE_MODEL = "{EXPECTED_MODEL}"' in source
    assert f'CANDIDATE_REVISION = "{EXPECTED_REVISION}"' in source
    assert f'CODE_VOLUME = "{EXPECTED_VOLUME}"' in source
    assert 'CONTRACT = "AVANTIQO_CODE_MODEL_CANARY_V3"' in source
    assert '"single_code_storage"' in source
    assert '"production_routing_change"' in source
    assert '"production_deploy_performed"' in source


def _assert_preflight() -> None:
    source = _source(PREFLIGHT_PATH)
    assert "snapshot_download" not in source
    assert '"gpu_used": False' in source
    assert '"container_started": False' in source
    assert '"model_download_performed": False' in source
    assert '"volume_created": False' in source
    assert 'modal.Volume.objects.list()' in source


def _assert_bootstrap() -> None:
    source = _source(BOOTSTRAP_PATH)
    assert 'create_if_missing=False' in source
    assert '.add_local_python_source("code_model_canary_v2")' in source
    assert 'snapshot_download(' in source
    assert 'gpu=' not in source
    assert 'ephemeral_disk=' not in source
    assert 'CURRENT_MARKER.read_bytes()' in source
    assert 'model_volume.commit()' in source


def _assert_runtime() -> None:
    source = _source(RUNTIME_PATH)
    required = (
        f'CONTRACT = "{EXPECTED_RUNTIME_CONTRACT}"',
        f'VLLM_VERSION = "{EXPECTED_VLLM_VERSION}"',
        f'VLLM_BUILD_COMMIT = "{EXPECTED_VLLM_BUILD_COMMIT}"',
        'INSTANTTENSOR_VERSION = "0.1.9"',
        'MAX_MODEL_LEN = 32_768',
        'MAX_NUM_SEQS = 128',
        'GPU_MEMORY_UTILIZATION = 0.90',
        'LOAD_FORMAT = "instanttensor"',
        'GDN_PREFILL_BACKEND = "triton"',
        'FAST_BOOT_ENFORCE_EAGER = True',
        'SMOKE_WARM_LATENCY_TARGET_MS = 4_000',
        'def generation_smoke(approved: bool = False)',
        '_render(tokenizer, "Return only OK.")',
        'SamplingParams(temperature=0.0, max_tokens=8, skip_special_tokens=True)',
        'SamplingParams(temperature=0.0, max_tokens=96, skip_special_tokens=True)',
        'warmup_pass = warm_text == "OK"',
        'correctness_pass = scored_text == SMOKE_EXPECTED_TYPESCRIPT',
        'latency_pass = warm_scored_ms <= SMOKE_WARM_LATENCY_TARGET_MS',
        'smoke_pass = warmup_pass and correctness_pass and latency_pass',
        '"warm_scored_ms": warm_scored_ms',
        '"warm_latency_target_ms": SMOKE_WARM_LATENCY_TARGET_MS',
        'create_if_missing=False',
        '.pip_install(f"instanttensor=={INSTANTTENSOR_VERSION}")',
        '.add_local_python_source("code_model_canary_v2")',
        '"VLLM_CACHE_ROOT": str(VLLM_CACHE_ROOT)',
        'max_num_seqs=MAX_NUM_SEQS',
        'load_format=LOAD_FORMAT',
        'gdn_prefill_backend=GDN_PREFILL_BACKEND',
        'enforce_eager=FAST_BOOT_ENFORCE_EAGER',
        'startup_timeout=3 * 60',
        'retries=0',
        'min_containers=0',
        'max_containers=1',
        'gpu="H100"',
        'model_volume.commit()',
        '"production_routing_change": False',
        '"production_deploy_performed": False',
        '"model_download_performed": False',
        '"volume_created": False',
        'NO_DEFAULT_PAID_ENTRYPOINT',
    )
    for token in required:
        assert token in source, token
    forbidden = (
        'snapshot_download',
        'huggingface_hub',
        'create_if_missing=True',
        'max_num_seqs=1024',
        'safetensors_load_strategy="prefetch"',
        'gdn_prefill_backend="flashinfer"',
        'speculative_model',
        '@app.function(retries=',
    )
    for token in forbidden:
        assert token not in source, token
    assert source.count('if approved is not True:') >= 3
    assert source.count('warm_outputs = engine.generate(') == 1
    assert source.count('scored_outputs = engine.generate(') == 1
    assert 'policy.CANDIDATE_MODEL' in source
    assert 'policy.CANDIDATE_REVISION' in source
    assert 'policy.CODE_VOLUME' in source


def main() -> None:
    _assert_policy()
    _assert_preflight()
    _assert_bootstrap()
    _assert_runtime()
    print("AVANTIQO_CODE_QWEN38_POLICY_V3=PASS")
    print("AVANTIQO_CODE_QWEN38_SINGLE_STORAGE=PASS")
    print("AVANTIQO_CODE_QWEN38_RUNTIME_V3=PASS")
    print("AVANTIQO_CODE_QWEN38_MAMBA_CACHE_FIX=PASS")
    print("AVANTIQO_CODE_QWEN38_INSTANTTENSOR_FAST_LOAD=PASS")
    print("AVANTIQO_CODE_QWEN38_TRITON_GDN_FAST_BOOT=PASS")
    print("AVANTIQO_CODE_QWEN38_PERSISTENT_VLLM_CACHE=PASS")
    print("AVANTIQO_CODE_QWEN38_WARM_SMOKE_CONTRACT=PASS")
    print("AVANTIQO_CODE_QWEN38_ZERO_COST_VERIFIER=PASS")


if __name__ == "__main__":
    main()
