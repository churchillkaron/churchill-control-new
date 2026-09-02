#!/usr/bin/env python3
"""Run the strict one-shot Modal proof for the owned Avantiqo Code engine.

This runner is intentionally certification-only. It submits exactly one owned
model call through the Modal H100 function, requires a broken fixture before AI,
requires the generated source to execute and pass its test, emits a canonical
artifact for GitHub Actions, and never performs a production deployment.
"""

from __future__ import annotations

import json
import os
import re
import subprocess
import sys
from pathlib import Path
from typing import Any

CONTRACT = "AVANTIQO_CODE_MODAL_REAL_WRITE_E2E_CI_V1"
ENGINE_REPORT_CONTRACT = "AVANTIQO_CODE_MODAL_REAL_WRITE_E2E_V1"
EXPECTED_PROVIDER = "avantiqo-code"
EXPECTED_PRODUCT_MODEL = "avantiqo-code-v1"
EXPECTED_FOUNDATION_MODEL = "Qwen/Qwen3-Coder-30B-A3B-Instruct"
EXPECTED_RUNTIME_MODEL = "Qwen/Qwen3-Coder-30B-A3B-Instruct-FP8"
EXPECTED_TRANSPORT = "MODAL_ONE_SHOT_H100"
EXPECTED_SERVING_RUNTIME = "vllm"
EXPECTED_QUANTIZATION = "fp8"
MODAL_APP = Path("services/avantiqo-code-engine/modal_app.py")
OUTPUT_DIR = Path("artifacts/avantiqo-code-real-generation-modal")
SOURCE_REPORT = OUTPUT_DIR / "modal-real-write-report.json"
CANONICAL_REPORT = Path("artifacts/avantiqo-code-real-write-e2e.json")
TIMEOUT_SECONDS = 60 * 60


def _text(value: Any) -> str:
    return str(value or "").strip()


def _require(condition: bool, code: str) -> None:
    if not condition:
        raise RuntimeError(f"{CONTRACT}_{code}")


def _secret_values() -> list[str]:
    names = (
        "MODAL_TOKEN_ID",
        "MODAL_TOKEN_SECRET",
        "AVANTIQO_MODAL_TOKEN_ID",
        "AVANTIQO_MODAL_TOKEN_SECRET",
    )
    return [value for value in (_text(os.environ.get(name)) for name in names) if value]


def _verify_single_model_invocation_source(repo: Path) -> None:
    source = (repo / MODAL_APP).read_text(encoding="utf-8")
    invocations = re.findall(r"\bgenerate\.(?:remote|spawn)\s*\(", source)
    _require(len(invocations) == 1, f"EXACTLY_ONE_MODEL_INVOCATION_REQUIRED:{len(invocations)}")
    _require(source.count("generate.remote(") == 1, "ONE_SYNCHRONOUS_REMOTE_INVOCATION_REQUIRED")
    _require("production_deploy_performed\"] = False" in source, "PRODUCTION_DEPLOY_GUARD_REQUIRED")
    _require('gpu="H100"' in source, "H100_RUNTIME_REQUIRED")


def _run_modal(repo: Path, secrets: list[str]) -> str:
    command = [
        sys.executable,
        "-m",
        "modal",
        "run",
        str(MODAL_APP),
        "--output-dir",
        str(OUTPUT_DIR),
    ]
    result = subprocess.run(
        command,
        cwd=repo,
        env=os.environ.copy(),
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        timeout=TIMEOUT_SECONDS,
        check=False,
    )
    combined = f"{result.stdout}\n{result.stderr}"
    leaked = [index for index, value in enumerate(secrets) if value and value in combined]
    _require(not leaked, "SECRET_VALUE_OUTPUT_DETECTED")
    if result.stdout:
        sys.stdout.write(result.stdout)
    if result.stderr:
        sys.stderr.write(result.stderr)
    _require(result.returncode == 0, f"MODAL_RUN_FAILED:{result.returncode}")
    _require(f"{ENGINE_REPORT_CONTRACT}=PASS" in combined, "MODAL_APP_PASS_MARKER_REQUIRED")
    _require(combined.count(f"{ENGINE_REPORT_CONTRACT}=PASS") == 1, "SINGLE_MODAL_APP_PASS_REQUIRED")
    return combined


def _validate_report(repo: Path) -> dict[str, Any]:
    source_path = repo / SOURCE_REPORT
    _require(source_path.is_file(), "SOURCE_REPORT_REQUIRED")
    report = json.loads(source_path.read_text(encoding="utf-8"))
    _require(report.get("success") is True, "REPORT_SUCCESS_REQUIRED")
    _require(_text(report.get("contract")) == ENGINE_REPORT_CONTRACT, "REPORT_CONTRACT_INVALID")
    _require(_text(report.get("transport")) == EXPECTED_TRANSPORT, "TRANSPORT_INVALID")

    proof = report.get("proof") if isinstance(report.get("proof"), dict) else {}
    _require(proof.get("broken_fixture_failed_before_ai") is True, "BROKEN_FIXTURE_MUST_FAIL_FIRST")
    _require(proof.get("model_inference_performed") is True, "REAL_MODEL_INFERENCE_REQUIRED")
    _require(proof.get("source_mutation_performed") is True, "REAL_SOURCE_WRITE_REQUIRED")
    _require(proof.get("generated_code_executed") is True, "GENERATED_CODE_EXECUTION_REQUIRED")
    _require(proof.get("generated_tests_passed") is True, "GENERATED_TEST_PASS_REQUIRED")
    _require(int(proof.get("final_test_exit_code", -1)) == 0, "FINAL_TEST_EXIT_ZERO_REQUIRED")
    _require(_text(proof.get("provider")) == EXPECTED_PROVIDER, "OWNED_PROVIDER_REQUIRED")
    _require(_text(proof.get("model")) == EXPECTED_PRODUCT_MODEL, "PRODUCT_MODEL_REQUIRED")
    _require(_text(proof.get("foundation_model")) == EXPECTED_FOUNDATION_MODEL, "FOUNDATION_MODEL_REQUIRED")
    _require(_text(proof.get("runtime_model")) == EXPECTED_RUNTIME_MODEL, "FP8_RUNTIME_MODEL_REQUIRED")
    _require(_text(proof.get("serving_runtime")) == EXPECTED_SERVING_RUNTIME, "VLLM_RUNTIME_REQUIRED")
    _require(_text(proof.get("quantization")) == EXPECTED_QUANTIZATION, "FP8_QUANTIZATION_REQUIRED")
    usage = proof.get("usage") if isinstance(proof.get("usage"), dict) else {}
    _require(float(usage.get("input_tokens") or 0) > 0, "INPUT_TOKEN_EVIDENCE_REQUIRED")
    _require(float(usage.get("output_tokens") or 0) > 0, "OUTPUT_TOKEN_EVIDENCE_REQUIRED")

    safeguards = report.get("safeguards") if isinstance(report.get("safeguards"), dict) else {}
    _require(safeguards.get("runpod_transport_used") is False, "RUNPOD_TRANSPORT_FORBIDDEN_IN_MODAL_PROOF")
    _require(safeguards.get("runpod_storage_created") is False, "RUNPOD_STORAGE_CREATION_FORBIDDEN")
    _require(safeguards.get("modal_volume_created") is False, "MODAL_VOLUME_CREATION_FORBIDDEN")
    _require(safeguards.get("persistent_repository_mutation_performed") is False, "PERSISTENT_REPO_MUTATION_FORBIDDEN")
    _require(safeguards.get("production_deploy_performed") is False, "PRODUCTION_DEPLOY_FORBIDDEN")
    _require(safeguards.get("raw_reasoning_persisted") is False, "RAW_REASONING_PERSISTENCE_FORBIDDEN")

    generated = report.get("generated_file") if isinstance(report.get("generated_file"), dict) else {}
    generated_path = repo / _text(generated.get("path"))
    _require(generated_path.is_file(), "GENERATED_FILE_REQUIRED")
    _require(generated_path.resolve().is_relative_to((repo / OUTPUT_DIR).resolve()), "GENERATED_FILE_SCOPE_INVALID")
    _require(int(generated.get("bytes") or 0) > 0, "GENERATED_FILE_BYTES_REQUIRED")
    _require(len(_text(generated.get("sha256"))) == 64, "GENERATED_FILE_SHA256_REQUIRED")

    proof["model_inference_count"] = 1
    safeguards["secrets_printed"] = False
    report["proof"] = proof
    report["safeguards"] = safeguards
    report["certification"] = {
        "runner_contract": CONTRACT,
        "single_model_invocation_source_verified": True,
        "model_inference_count": 1,
        "owned_only": True,
        "external_provider_fallback_used": False,
        "production_deploy_performed": False,
        "secrets_printed": False,
    }
    return report


def main() -> None:
    repo = Path.cwd().resolve()
    _require((repo / ".git").is_dir(), "REPOSITORY_ROOT_REQUIRED")
    _require((repo / MODAL_APP).is_file(), "MODAL_APP_REQUIRED")
    token_id = _text(os.environ.get("MODAL_TOKEN_ID") or os.environ.get("AVANTIQO_MODAL_TOKEN_ID"))
    token_secret = _text(os.environ.get("MODAL_TOKEN_SECRET") or os.environ.get("AVANTIQO_MODAL_TOKEN_SECRET"))
    _require(bool(token_id and token_secret), "MODAL_CREDENTIAL_REQUIRED")
    _require(_text(os.environ.get("NODE_ENV")).lower() != "production", "PRODUCTION_ENV_FORBIDDEN")

    _verify_single_model_invocation_source(repo)
    (repo / OUTPUT_DIR).mkdir(parents=True, exist_ok=True)
    _run_modal(repo, _secret_values())
    report = _validate_report(repo)
    canonical = repo / CANONICAL_REPORT
    canonical.parent.mkdir(parents=True, exist_ok=True)
    canonical.write_text(f"{json.dumps(report, indent=2)}\n", encoding="utf-8")
    print(
        json.dumps(
            {
                "success": True,
                "contract": CONTRACT,
                "transport": EXPECTED_TRANSPORT,
                "provider": EXPECTED_PROVIDER,
                "model": EXPECTED_PRODUCT_MODEL,
                "foundation_model": EXPECTED_FOUNDATION_MODEL,
                "runtime_model": EXPECTED_RUNTIME_MODEL,
                "model_inference_count": 1,
                "generated_tests_passed": True,
                "persistent_repository_mutation_performed": False,
                "production_deploy_performed": False,
                "secrets_printed": False,
            },
            separators=(",", ":"),
        )
    )
    print(f"{CONTRACT}=PASS")


if __name__ == "__main__":
    main()
