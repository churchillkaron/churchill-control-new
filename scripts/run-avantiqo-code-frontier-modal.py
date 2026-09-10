from __future__ import annotations

import argparse
import json
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import modal

CONTRACT = "AVANTIQO_CODE_FRONTIER_MODAL_RUNNER_V1"
SUITE_CONTRACT = "AVANTIQO_CODE_FRONTIER_ENGINEERING_SUITE_V1"
ENGINE_CONTRACT = "AVANTIQO_CODE_ENGINE_V1"
PRODUCT_MODEL = "avantiqo-code-v1"
APP_NAME = "avantiqo-code-snapshot-canary-v1"
CLS_NAME = "CodeSnapshotCanary"
DEFAULT_SUITE = Path("benchmarks/avantiqo-code-frontier-engineering-suite.json")
DEFAULT_OUTPUT = Path("/tmp/avantiqo-code-frontier-owned.json")


def text(value: Any) -> str:
    return str(value or "").strip()


def load_suite(path: Path) -> dict[str, Any]:
    suite = json.loads(path.read_text(encoding="utf-8"))
    if text(suite.get("contract")) != SUITE_CONTRACT:
        raise RuntimeError(f"{CONTRACT}_SUITE_CONTRACT_INVALID")
    cases = suite.get("cases") if isinstance(suite.get("cases"), list) else []
    if len(cases) < 20:
        raise RuntimeError(f"{CONTRACT}_MINIMUM_20_CASES_REQUIRED")
    ids = [text(case.get("case_id")) for case in cases]
    if not all(ids) or len(ids) != len(set(ids)):
        raise RuntimeError(f"{CONTRACT}_CASE_IDS_INVALID")
    return suite


def request_for_case(case: dict[str, Any]) -> dict[str, Any]:
    required = [text(v) for v in case.get("required_evidence", []) if text(v)]
    prompt = "\n".join([
        "You are being evaluated on one provider-neutral senior software engineering scenario.",
        f"Scenario: {text(case.get('title'))}",
        f"Category: {text(case.get('category'))}",
        "Return ONLY strict JSON; no markdown.",
        "The JSON must have exactly: case_id, diagnosis, solution, verification, evidence.",
        f"case_id must equal {text(case.get('case_id'))!r}.",
        "diagnosis, solution, and verification must be concise but technically specific strings.",
        "evidence must be an object containing every required evidence key below with a concise concrete string value, not booleans or generic claims.",
        "Do not claim a test, build, migration, deployment, source inspection, or provider call actually happened unless the scenario explicitly supplies observed evidence. Describe what must be verified instead.",
        "Prefer the smallest safe change, preserve unrelated behavior, and fail closed when evidence or authorization is missing.",
        f"Required evidence keys: {json.dumps(required)}",
    ])
    return {
        "contract": ENGINE_CONTRACT,
        "capability": "ai.code.review",
        "model": PRODUCT_MODEL,
        "organization_id": "benchmark-only",
        "usage_id": f"frontier-{text(case.get('case_id'))}-{int(time.time() * 1000)}",
        "instruction": prompt,
        "structured_specification": {
            "benchmark_contract": CONTRACT,
            "suite_contract": SUITE_CONTRACT,
            "case": case,
            "output_contract": "STRICT_JSON_ENGINEERING_ASSESSMENT_V1",
            "raw_reasoning_must_not_persist": True,
        },
    }


def parse_result(raw: Any) -> dict[str, Any] | None:
    source = text(raw)
    if source.startswith("```"):
        source = source.strip("`")
        if source.lower().startswith("json"):
            source = source[4:].lstrip()
    start, end = source.find("{"), source.rfind("}")
    if start < 0 or end <= start:
        return None
    try:
        value = json.loads(source[start:end + 1])
    except json.JSONDecodeError:
        return None
    return value if isinstance(value, dict) else None


def grade_case(case: dict[str, Any], parsed: dict[str, Any] | None) -> tuple[bool, list[str]]:
    failures: list[str] = []
    if not parsed:
        return False, ["STRICT_JSON_REQUIRED"]
    expected_keys = {"case_id", "diagnosis", "solution", "verification", "evidence"}
    if set(parsed.keys()) != expected_keys:
        failures.append("EXACT_TOP_LEVEL_KEYS_REQUIRED")
    if text(parsed.get("case_id")) != text(case.get("case_id")):
        failures.append("CASE_ID_MISMATCH")
    for field in ("diagnosis", "solution", "verification"):
        value = text(parsed.get(field))
        if len(value) < 20:
            failures.append(f"{field.upper()}_TOO_SHALLOW")
    evidence = parsed.get("evidence") if isinstance(parsed.get("evidence"), dict) else {}
    required = [text(v) for v in case.get("required_evidence", []) if text(v)]
    if set(evidence.keys()) != set(required):
        failures.append("EXACT_EVIDENCE_KEYS_REQUIRED")
    for key in required:
        value = text(evidence.get(key))
        if len(value) < 12:
            failures.append(f"EVIDENCE_TOO_SHALLOW:{key}")
    combined = " ".join(text(parsed.get(k)).lower() for k in ("diagnosis", "solution", "verification"))
    forbidden_false_completion = (
        "i ran the tests", "tests passed", "build passed", "deployed successfully",
        "migration applied", "verified in production", "i inspected the repository",
    )
    if any(marker in combined for marker in forbidden_false_completion):
        failures.append("UNOBSERVED_COMPLETION_CLAIM")
    return not failures, failures


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--suite", default=str(DEFAULT_SUITE))
    parser.add_argument("--output", default=str(DEFAULT_OUTPUT))
    parser.add_argument("--limit", type=int, default=3)
    parser.add_argument("--full", action="store_true")
    args = parser.parse_args()

    suite = load_suite(Path(args.suite))
    cases = suite["cases"]
    if not args.full:
        cases = cases[: max(1, min(args.limit, len(cases)))]

    Snapshot = modal.Cls.from_name(APP_NAME, CLS_NAME)
    worker = Snapshot()
    batch_started = time.perf_counter()
    batch = worker.invoke_batch.remote([request_for_case(case) for case in cases])
    batch_wall_ms = round((time.perf_counter() - batch_started) * 1000)
    if not isinstance(batch, dict):
        raise RuntimeError(f"{CONTRACT}_SNAPSHOT_BATCH_OBJECT_REQUIRED")
    outputs = batch.get("outputs") if isinstance(batch.get("outputs"), list) else []
    if len(outputs) != len(cases):
        raise RuntimeError(f"{CONTRACT}_SNAPSHOT_BATCH_OUTPUT_COUNT_INVALID")
    observations: list[dict[str, Any]] = []
    for case, output in zip(cases, outputs):
        if not isinstance(output, dict):
            output = {}
        parsed = parse_result(output.get("result"))
        passed, failures = grade_case(case, parsed)
        usage = output.get("usage") if isinstance(output.get("usage"), dict) else {}
        observation = {
            "case_id": text(case.get("case_id")),
            "category": text(case.get("category")),
            "passed": passed,
            "failures": failures,
            "wall_ms": round(float(output.get("case_elapsed_seconds") or output.get("generation_seconds") or 0) * 1000),
            "generation_seconds": output.get("generation_seconds"),
            "input_tokens": usage.get("input_tokens"),
            "output_tokens": usage.get("output_tokens"),
            "provider": output.get("provider"),
            "model": output.get("model"),
            "raw_reasoning_persisted": output.get("raw_reasoning_persisted"),
        }
        observations.append(observation)
        print("AVANTIQO_CODE_FRONTIER_CASE=" + json.dumps(observation, separators=(",", ":")), flush=True)
    print("AVANTIQO_CODE_FRONTIER_BATCH=" + json.dumps({
        "client_wall_ms": batch_wall_ms,
        "snapshot_wake_seconds": batch.get("snapshot_wake_seconds"),
        "batch_elapsed_seconds": batch.get("batch_elapsed_seconds"),
        "case_count": len(cases),
    }, separators=(",", ":")), flush=True)

    pass_count = sum(1 for item in observations if item["passed"])
    report = {
        "contract": CONTRACT,
        "suite_contract": SUITE_CONTRACT,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "model": {"provider": "avantiqo-code", "product_model": PRODUCT_MODEL},
        "execution": {"infrastructure": "MODAL_GPU_SNAPSHOT", "snapshot_contract": batch.get("contract"), "snapshot_wake_seconds": batch.get("snapshot_wake_seconds"), "batch_elapsed_seconds": batch.get("batch_elapsed_seconds"), "runpod_used": False, "persistent_storage_created": False},
        "observations": observations,
        "summary": {
            "requested_cases": len(cases),
            "completed_runs": len(observations),
            "passed_cases": pass_count,
            "pass_rate": round(pass_count / len(observations), 4) if observations else 0,
            "passed": pass_count == len(observations),
            "complete_suite": len(observations) == len(suite["cases"]),
        },
        "production_deploy_performed": False,
    }
    Path(args.output).write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print("AVANTIQO_CODE_FRONTIER_SUMMARY=" + json.dumps(report["summary"], separators=(",", ":")), flush=True)
    if not report["summary"]["passed"]:
        raise SystemExit(2)


if __name__ == "__main__":
    main()
