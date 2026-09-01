"""One-shot Modal execution path for the owned Avantiqo Code model.

This is deliberately a development/certification transport, not a production
HTTP deployment. It exists to get the real Code model running when RunPod's
allocator/scheduler cannot provide a worker.

Properties:
- reuses the exact currently-bound Avantiqo Code worker image
- pins the exact Qwen FP8 revision already certified by the Code runtime
- bakes model weights into the Modal Image (no Modal Volume is created)
- uses one H100 only for the bounded real-write inference
- writes the generated source back to the caller's local computer
- executes the generated file under Node's permission model
- creates no RunPod storage and performs no production deployment

Run from the repository root after `modal setup` / token authentication:

    modal run services/avantiqo-code-engine/modal_app.py
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import shutil
import subprocess
import time
import uuid
from pathlib import Path
from typing import Any

import modal

APP_NAME = "avantiqo-code-real-write-one-shot"
CONTRACT = "AVANTIQO_CODE_MODAL_REAL_WRITE_E2E_V1"
ENGINE_CONTRACT = "AVANTIQO_CODE_ENGINE_V1"
PRODUCT_MODEL = "avantiqo-code-v1"
FOUNDATION_MODEL = "Qwen/Qwen3-Coder-30B-A3B-Instruct"
RUNTIME_MODEL = "Qwen/Qwen3-Coder-30B-A3B-Instruct-FP8"
MODEL_REVISION = "dcaee4d4dfc5ee71ad501f01f530e5652438fde0"
WORKER_IMAGE = (
    "ghcr.io/churchillkaron/avantiqo-code-worker@"
    "sha256:fa6559a184998d75fb6430ea9fa303fe7b6c1af0da441e61ac4bd587b2bdf3c6"
)
HF_ROOT = "/opt/avantiqo-code-cache"
HF_CACHE_ROOT = f"{HF_ROOT}/hub"
MODULE_NAME = "invoice-total.mjs"
TEST_NAME = "invoice-total.test.mjs"
LOCAL_OUTPUT_DIR = "local-audit-output/avantiqo-code-real-generation-modal"

BUGGY_SOURCE = '''export function invoiceTotal(subtotal, taxRate) {
  if (!Number.isFinite(subtotal) || !Number.isFinite(taxRate)) {
    throw new TypeError("subtotal and taxRate must be finite numbers");
  }
  return Number((subtotal + taxRate).toFixed(2));
}
'''

TEST_SOURCE = '''import assert from "node:assert/strict";
import { invoiceTotal } from "./invoice-total.mjs";

assert.equal(invoiceTotal(100, 0.07), 107);
assert.equal(invoiceTotal(19.99, 0.075), 21.49);
assert.equal(invoiceTotal(0, 0.2), 0);
assert.throws(() => invoiceTotal(Number.NaN, 0.07), TypeError);
assert.throws(() => invoiceTotal(100, Number.POSITIVE_INFINITY), TypeError);
console.log("AVANTIQO_CODE_FIXTURE_TEST_PASS");
'''

app = modal.App(APP_NAME)


def _bake_runtime_model(repo_id: str, revision: str, cache_root: str) -> None:
    from huggingface_hub import snapshot_download

    resolved = snapshot_download(
        repo_id=repo_id,
        revision=revision,
        cache_dir=cache_root,
    )
    if not Path(resolved).is_dir():
        raise RuntimeError("AVANTIQO_CODE_MODAL_MODEL_SNAPSHOT_MISSING")
    print(
        json.dumps(
            {
                "event": "AVANTIQO_CODE_MODAL_MODEL_BAKED",
                "runtime_model": repo_id,
                "revision": revision,
                "cache_root": cache_root,
                "modal_volume_created": False,
            },
            separators=(",", ":"),
        ),
        flush=True,
    )


# Modal Functions require external registry images to expose `python` and `pip`
# on PATH. The certified worker image has a working Python 3 runtime but was
# built around `python3`; expose aliases during the base setup without adding a
# second Python distribution or changing the vLLM/CUDA environment.
# The default RunPod entrypoint is removed because Modal invokes the function
# directly. The model snapshot is an image layer, not a persistent Modal Volume.
image = (
    modal.Image.from_registry(
        WORKER_IMAGE,
        add_python=None,
        setup_dockerfile_commands=[
            "RUN command -v python >/dev/null 2>&1 || ln -s \"$(command -v python3)\" /usr/local/bin/python",
            "RUN command -v pip >/dev/null 2>&1 || ln -s \"$(command -v pip3)\" /usr/local/bin/pip",
            "RUN python --version && pip --version",
        ],
    )
    .entrypoint([])
    .env(
        {
            "HF_HOME": HF_ROOT,
            "AVANTIQO_CODE_HF_CACHE_ROOT": HF_CACHE_ROOT,
            "VLLM_CACHE_ROOT": "/tmp/avantiqo-code-vllm-cache",
            "VLLM_WORKER_MULTIPROC_METHOD": "spawn",
            "VLLM_USE_FLASHINFER_SAMPLER": "0",
            "VLLM_USE_DEEP_GEMM": "0",
            "VLLM_MOE_USE_DEEP_GEMM": "0",
            "AVANTIQO_CODE_DEVICE": "cuda",
            "AVANTIQO_CODE_QUANTIZATION": "fp8",
            "AVANTIQO_CODE_FOUNDATION_MODEL": FOUNDATION_MODEL,
            "AVANTIQO_CODE_RUNTIME_MODEL": RUNTIME_MODEL,
            "AVANTIQO_CODE_MAX_MODEL_LEN": "32768",
            "AVANTIQO_CODE_GPU_MEMORY_UTILIZATION": "0.90",
            "AVANTIQO_CODE_MAX_NEW_TOKENS": "4096",
            "AVANTIQO_CODE_REQUIRE_CACHED_MODEL": "1",
        }
    )
    .run_function(
        _bake_runtime_model,
        args=(RUNTIME_MODEL, MODEL_REVISION, HF_CACHE_ROOT),
        timeout=60 * 60,
    )
)


@app.function(
    image=image,
    gpu="H100",
    timeout=30 * 60,
    scaledown_window=5,
)
def generate(data: dict[str, Any]) -> dict[str, Any]:
    """Execute one bounded owned-model Code request on Modal."""
    os.chdir("/app")
    import handler as code_engine

    # The source-owned handler uses RunPod progress events only for telemetry.
    # On Modal the inference contract is unchanged, so replace only that
    # transport-specific telemetry call; model loading/generation stay exactly
    # inside the certified handler.
    code_engine.runpod.serverless.progress_update = lambda *_args, **_kwargs: None

    started = time.perf_counter()
    output = code_engine.handler(
        {
            "id": f"modal-{uuid.uuid4()}",
            "input": data,
        }
    )
    if not isinstance(output, dict):
        raise RuntimeError("AVANTIQO_CODE_MODAL_OUTPUT_OBJECT_REQUIRED")
    output = dict(output)
    output["modal_transport"] = "one-shot-function"
    output["modal_gpu"] = "H100"
    output["modal_elapsed_seconds"] = round(time.perf_counter() - started, 3)
    output["modal_volume_created"] = False
    output["runpod_inference_performed"] = False
    output["production_deploy_performed"] = False
    return output


def _text(value: Any) -> str:
    return str(value or "").strip()


def _sha256(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def _run_fixture_test(workspace: Path) -> dict[str, Any]:
    node = shutil.which("node")
    if not node:
        raise RuntimeError(f"{CONTRACT}_NODE_REQUIRED")
    result = subprocess.run(
        [
            node,
            "--permission",
            f"--allow-fs-read={workspace}",
            TEST_NAME,
        ],
        cwd=workspace,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        timeout=30,
        env={
            "PATH": os.environ.get("PATH", ""),
            "HOME": str(workspace),
            "TMPDIR": str(workspace),
            "NODE_NO_WARNINGS": "1",
        },
        check=False,
    )
    return {
        "exit_code": result.returncode,
        "stdout": result.stdout[-4000:],
        "stderr": result.stderr[-4000:],
    }


def _parse_generated_file(raw: str) -> str:
    candidate = _text(raw)
    candidate = re.sub(r"^```(?:json)?\s*", "", candidate, flags=re.IGNORECASE)
    candidate = re.sub(r"\s*```$", "", candidate).strip()
    start = candidate.find("{")
    end = candidate.rfind("}")
    if start < 0 or end <= start:
        raise RuntimeError(f"{CONTRACT}_GENERATED_JSON_OBJECT_REQUIRED")
    try:
        parsed = json.loads(candidate[start : end + 1])
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"{CONTRACT}_GENERATED_JSON_INVALID:{exc}") from exc
    if not isinstance(parsed, dict):
        raise RuntimeError(f"{CONTRACT}_GENERATED_JSON_OBJECT_REQUIRED")
    if sorted(parsed.keys()) != ["content", "path"]:
        raise RuntimeError(
            f"{CONTRACT}_GENERATED_JSON_KEYS_INVALID:{','.join(parsed.keys())}"
        )
    if _text(parsed.get("path")) != MODULE_NAME:
        raise RuntimeError(
            f"{CONTRACT}_GENERATED_PATH_INVALID:{_text(parsed.get('path'))}"
        )
    content = str(parsed.get("content") or "")
    if not content.strip() or len(content) > 12000:
        raise RuntimeError(f"{CONTRACT}_GENERATED_CONTENT_INVALID")
    if content == BUGGY_SOURCE:
        raise RuntimeError(f"{CONTRACT}_GENERATED_SOURCE_UNCHANGED")
    forbidden = (
        r"\bimport\s*(?:\(|[\"'])",
        r"\brequire\s*\(",
        r"\bprocess\b",
        r"\bglobalThis\b",
        r"\bfetch\s*\(",
        r"\bWebSocket\b",
        r"\bchild_process\b",
        r"\bnode:",
        r"\beval\s*\(",
        r"\bnew\s+Function\b",
        r"\bFunction\s*\(",
    )
    if any(re.search(pattern, content, flags=re.IGNORECASE) for pattern in forbidden):
        raise RuntimeError(f"{CONTRACT}_GENERATED_SOURCE_SECURITY_BOUNDARY_INVALID")
    if not re.search(
        r"\bexport\s+(?:function|const|let|var)\s+invoiceTotal\b", content
    ):
        raise RuntimeError(f"{CONTRACT}_GENERATED_EXPORT_REQUIRED")
    return content if content.endswith("\n") else f"{content}\n"


def _request(initial_failure: str) -> dict[str, Any]:
    usage_id = f"modal-real-write-{uuid.uuid4()}"
    instruction = " ".join(
        [
            "Debug the supplied JavaScript module so the supplied Node test passes.",
            f'Return ONLY strict JSON with exactly this shape: {{"path":"{MODULE_NAME}","content":"<complete UTF-8 source file>"}}.',
            "Do not use markdown fences and do not include commentary outside the JSON object.",
            f"Modify only {MODULE_NAME}; never modify {TEST_NAME}.",
            "The generated module must be self-contained and must not import modules, access environment variables, use the filesystem, start child processes, access the network, or use dynamic code evaluation.",
            "Keep the public export named invoiceTotal.",
            "Use the failing test as the authority for required behavior.",
        ]
    )
    return {
        "contract": ENGINE_CONTRACT,
        "capability": "ai.code.debug",
        "model": PRODUCT_MODEL,
        "organization_id": "benchmark-only",
        "usage_id": usage_id,
        "instruction": instruction,
        "structured_specification": {
            "certification_probe": True,
            "real_source_write_required": True,
            "workspace": {
                "files": [
                    {"path": MODULE_NAME, "content": BUGGY_SOURCE, "editable": True},
                    {"path": TEST_NAME, "content": TEST_SOURCE, "editable": False},
                ],
                "failing_command": f"node --permission --allow-fs-read=<workspace> {TEST_NAME}",
                "failing_output": initial_failure[-5000:],
            },
            "output_contract": {
                "format": "strict-json",
                "path": MODULE_NAME,
                "complete_file_content_required": True,
                "markdown_forbidden": True,
            },
            "security_contract": {
                "imports_forbidden": True,
                "environment_access_forbidden": True,
                "filesystem_access_forbidden": True,
                "child_process_forbidden": True,
                "network_access_forbidden": True,
                "dynamic_code_evaluation_forbidden": True,
            },
            "raw_reasoning_must_not_persist": True,
        },
    }


def _validate_owned_output(output: dict[str, Any]) -> None:
    required = {
        "status": "completed",
        "provider": "avantiqo-code",
        "model": PRODUCT_MODEL,
        "engine_contract": ENGINE_CONTRACT,
        "capability": "ai.code.debug",
        "foundation_model": FOUNDATION_MODEL,
        "runtime_model": RUNTIME_MODEL,
        "serving_runtime": "vllm",
        "quantization": "fp8",
        "raw_reasoning_persisted": False,
        "modal_transport": "one-shot-function",
        "modal_gpu": "H100",
        "modal_volume_created": False,
        "runpod_inference_performed": False,
        "production_deploy_performed": False,
    }
    for key, expected in required.items():
        if output.get(key) != expected:
            raise RuntimeError(
                f"{CONTRACT}_MODEL_OUTPUT_CONTRACT_INVALID:{key}:"
                f"expected={expected!r}:actual={output.get(key)!r}"
            )
    usage = output.get("usage") if isinstance(output.get("usage"), dict) else {}
    if not (float(usage.get("input_tokens") or 0) > 0):
        raise RuntimeError(f"{CONTRACT}_INPUT_TOKEN_EVIDENCE_REQUIRED")
    if not (float(usage.get("output_tokens") or 0) > 0):
        raise RuntimeError(f"{CONTRACT}_OUTPUT_TOKEN_EVIDENCE_REQUIRED")
    if not _text(output.get("result")):
        raise RuntimeError(f"{CONTRACT}_RESULT_REQUIRED")


@app.local_entrypoint()
def main(output_dir: str = LOCAL_OUTPUT_DIR) -> None:
    """Run the actual owned-model write and persist its result on this Mac."""
    repository_root = Path.cwd().resolve()
    if not (repository_root / ".git").exists():
        raise RuntimeError(f"{CONTRACT}_RUN_FROM_REPOSITORY_ROOT_REQUIRED")

    workspace = (repository_root / output_dir).resolve()
    workspace.mkdir(parents=True, exist_ok=True)
    module_path = workspace / MODULE_NAME
    test_path = workspace / TEST_NAME
    report_path = workspace / "modal-real-write-report.json"

    module_path.write_text(BUGGY_SOURCE, encoding="utf-8")
    test_path.write_text(TEST_SOURCE, encoding="utf-8")
    initial = _run_fixture_test(workspace)
    if initial["exit_code"] == 0:
        raise RuntimeError(f"{CONTRACT}_BROKEN_FIXTURE_MUST_FAIL_BEFORE_AI")

    print(
        json.dumps(
            {
                "event": f"{CONTRACT}_START",
                "transport": "MODAL_ONE_SHOT_H100",
                "runtime_model": RUNTIME_MODEL,
                "model_revision": MODEL_REVISION,
                "worker_image": WORKER_IMAGE,
                "runpod_used": False,
                "modal_volume_created": False,
                "production_deploy_performed": False,
                "broken_fixture_failed_before_ai": True,
            },
            separators=(",", ":"),
        ),
        flush=True,
    )

    output = generate.remote(_request(initial["stdout"] + initial["stderr"]))
    if not isinstance(output, dict):
        raise RuntimeError(f"{CONTRACT}_REMOTE_OUTPUT_OBJECT_REQUIRED")
    _validate_owned_output(output)

    generated_source = _parse_generated_file(_text(output.get("result")))
    module_path.write_text(generated_source, encoding="utf-8")
    final = _run_fixture_test(workspace)
    if final["exit_code"] != 0:
        raise RuntimeError(
            f"{CONTRACT}_GENERATED_TEST_FAILED:"
            f"{_text(final['stdout'] + final['stderr'])[-1200:]}"
        )
    if "AVANTIQO_CODE_FIXTURE_TEST_PASS" not in final["stdout"]:
        raise RuntimeError(f"{CONTRACT}_FINAL_PASS_MARKER_REQUIRED")

    report = {
        "success": True,
        "contract": CONTRACT,
        "transport": "MODAL_ONE_SHOT_H100",
        "generated_file": {
            "path": str(module_path.relative_to(repository_root)),
            "sha256": _sha256(generated_source),
            "bytes": len(generated_source.encode("utf-8")),
        },
        "proof": {
            "broken_fixture_failed_before_ai": True,
            "model_inference_performed": True,
            "source_mutation_performed": generated_source != BUGGY_SOURCE,
            "generated_code_executed": True,
            "generated_tests_passed": True,
            "final_test_exit_code": final["exit_code"],
            "provider": output.get("provider"),
            "model": output.get("model"),
            "foundation_model": output.get("foundation_model"),
            "runtime_model": output.get("runtime_model"),
            "model_revision": MODEL_REVISION,
            "serving_runtime": output.get("serving_runtime"),
            "quantization": output.get("quantization"),
            "usage": output.get("usage"),
            "generation_seconds": output.get("generation_seconds"),
            "modal_elapsed_seconds": output.get("modal_elapsed_seconds"),
        },
        "safeguards": {
            "runpod_transport_used": False,
            "runpod_storage_created": False,
            "modal_volume_created": False,
            "persistent_repository_mutation_performed": False,
            "production_deploy_performed": False,
            "raw_reasoning_persisted": False,
        },
    }
    report_path.write_text(f"{json.dumps(report, indent=2)}\n", encoding="utf-8")
    print(json.dumps(report, indent=2), flush=True)
    print(f"{CONTRACT}=PASS", flush=True)
