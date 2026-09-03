"""Semantic-review wrapper for Avantiqo Code Repo Agent V4.

V4 deliberately keeps the proven V3 sandbox/tool loop and adds a fresh-context
semantic reviewer after every provisional V3 completion. Public tests are
necessary evidence, never sufficient evidence: V4 returns completed only after
the reviewer confirms the changed implementation satisfies every behavioral
clause stated in the task. Reviewer findings may drive one bounded repair round;
hidden tests, secrets, network access, and benchmark-specific answers are never
exposed to either model call path.
"""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any, Callable

import repo_agent_v3 as v3

CONTRACT = "AVANTIQO_CODE_REPO_AGENT_V4"
MAX_SEMANTIC_REPAIRS = 1
MAX_REVIEW_FILES_BYTES = 80_000
MAX_REVIEW_FINDINGS = 12
MAX_REVIEW_CRITERIA = 20

AgentPolicy = v3.AgentPolicy
AgentContractError = v3.AgentContractError
ModelCall = Callable[[str], str]
ReviewerCall = Callable[[str], str]


def _json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def _bounded(value: Any, limit: int) -> str:
    raw = str(value or "").encode("utf-8")
    if len(raw) <= limit:
        return raw.decode("utf-8")
    return raw[:limit].decode("utf-8", errors="ignore") + "\n...[truncated]"


def _actor_task(task: str, findings: tuple[str, ...] = ()) -> str:
    parts = [
        "AVANTIQO REPOSITORY AGENT V4 CONTRACT DISCIPLINE.",
        (
            "Before the first edit, make the plan enumerate every independent behavioral "
            "clause and qualifier in the task as acceptance criteria. Preserve words such as "
            "once, at-most-once, order, duplicates, empty, mismatch, archived, disabled, and "
            "similar boundary semantics when they appear."
        ),
        (
            "Public tests are incomplete evidence. Implement the full stated task contract, "
            "including edge behavior implied by its wording, without inventing unrelated "
            "requirements or benchmark-specific logic."
        ),
        "ORIGINAL TASK:\n" + task.strip(),
    ]
    if findings:
        parts.append(
            "INDEPENDENT SEMANTIC REVIEW FINDINGS FROM THE PREVIOUS PROVISIONAL IMPLEMENTATION:\n"
            + _json(list(findings))
        )
        parts.append(
            "Repair only the contract gaps identified above, then rerun the declared public tests."
        )
    return "\n\n".join(parts)


def _changed_sources(root: Path, changed_files: list[str]) -> list[dict[str, str]]:
    remaining = MAX_REVIEW_FILES_BYTES
    payload: list[dict[str, str]] = []
    resolved_root = root.resolve()
    for relative in changed_files:
        if remaining <= 0:
            break
        raw = str(relative or "").replace("\\", "/").lstrip("./")
        if not raw:
            continue
        target = (resolved_root / raw).resolve()
        try:
            target.relative_to(resolved_root)
        except ValueError as exc:
            raise AgentContractError("REVIEW_PATH_ESCAPE_FORBIDDEN") from exc
        if not target.is_file():
            continue
        data = target.read_bytes()[:remaining]
        remaining -= len(data)
        payload.append(
            {
                "path": raw,
                "content": data.decode("utf-8", errors="replace"),
            }
        )
    return payload


def _review_prompt(
    *,
    root: Path,
    task: str,
    provisional: dict[str, Any],
) -> str:
    changed_files = [str(item) for item in (provisional.get("changed_files") or [])]
    return "\n\n".join(
        [
            "AVANTIQO INDEPENDENT SEMANTIC REVIEWER V4.",
            (
                "You did not participate in the implementation. Review the current changed code "
                "against the ORIGINAL TASK only. Public tests already passed, but they may be "
                "incomplete. Look specifically for behavioral clauses, qualifiers, edge cases, "
                "ordering/duplicate semantics, rounding/aggregation semantics, authorization or "
                "safety precedence, concurrency/idempotency, and performance-work requirements "
                "that are stated by the task but not actually guaranteed by the implementation."
            ),
            (
                "Do not request or infer hidden tests, secrets, benchmark case IDs, expected patches, "
                "network access, or unrelated improvements. A repair finding must be justified only "
                "from the task and the changed source shown here."
            ),
            (
                "Return exactly one JSON object and no prose outside JSON with shape: "
                '{"verdict":"pass|repair","criteria_checked":["..."],"findings":["..."]}. '
                "Use pass only when every material task clause is satisfied."
            ),
            "ORIGINAL TASK:\n" + task.strip(),
            "PROVISIONAL EXECUTION EVIDENCE:\n"
            + _json(
                {
                    "status": provisional.get("status"),
                    "tests_run": provisional.get("tests_run"),
                    "tests_passed": provisional.get("tests_passed"),
                    "changed_files": changed_files,
                }
            ),
            "CURRENT CHANGED SOURCES:\n" + _json(_changed_sources(root, changed_files)),
        ]
    )


def _clean_list(value: Any, *, maximum: int, item_limit: int) -> tuple[str, ...]:
    if not isinstance(value, list):
        return ()
    cleaned: list[str] = []
    for item in value[:maximum]:
        text = _bounded(item, item_limit).strip()
        if text:
            cleaned.append(text)
    return tuple(cleaned)


def _parse_review(raw: str) -> dict[str, Any]:
    text = str(raw or "").strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text, flags=re.IGNORECASE)
        text = re.sub(r"\s*```$", "", text).strip()
    try:
        value = json.loads(text)
    except json.JSONDecodeError as exc:
        raise AgentContractError("SEMANTIC_REVIEW_JSON_REQUIRED") from exc
    if not isinstance(value, dict):
        raise AgentContractError("SEMANTIC_REVIEW_OBJECT_REQUIRED")
    verdict = str(value.get("verdict") or "").strip().lower()
    if verdict not in {"pass", "repair"}:
        raise AgentContractError("SEMANTIC_REVIEW_VERDICT_INVALID")
    criteria = _clean_list(
        value.get("criteria_checked"), maximum=MAX_REVIEW_CRITERIA, item_limit=800
    )
    findings = _clean_list(value.get("findings"), maximum=MAX_REVIEW_FINDINGS, item_limit=1200)
    if not criteria:
        raise AgentContractError("SEMANTIC_REVIEW_CRITERIA_REQUIRED")
    if verdict == "repair" and not findings:
        raise AgentContractError("SEMANTIC_REVIEW_FINDINGS_REQUIRED")
    if verdict == "pass" and findings:
        raise AgentContractError("SEMANTIC_REVIEW_PASS_WITH_FINDINGS_FORBIDDEN")
    return {
        "verdict": verdict,
        "criteria_checked": criteria,
        "findings": findings,
    }


def run_repo_agent(
    *,
    workspace: str | Path,
    task: str,
    policy: AgentPolicy,
    model_call: ModelCall,
    reviewer_call: ReviewerCall | None = None,
    max_semantic_repairs: int = MAX_SEMANTIC_REPAIRS,
) -> dict[str, Any]:
    root = Path(workspace).resolve()
    original_task = str(task or "").strip()
    if not root.is_dir():
        raise AgentContractError("WORKSPACE_DIRECTORY_REQUIRED")
    if not original_task:
        raise AgentContractError("TASK_REQUIRED")
    if max_semantic_repairs < 0 or max_semantic_repairs > MAX_SEMANTIC_REPAIRS:
        raise AgentContractError("SEMANTIC_REPAIR_BUDGET_INVALID")
    reviewer = reviewer_call or model_call

    current_task = _actor_task(original_task)
    semantic_repairs = 0
    semantic_reviews = 0
    model_calls = 0
    steps = 0
    tests_run = 0
    tests_passed = 0
    internal_repairs = 0
    changed_files: set[str] = set()
    phases: list[str] = []
    attempts: list[dict[str, Any]] = []

    while True:
        provisional = v3.run_repo_agent(
            workspace=root,
            task=current_task,
            policy=policy,
            model_call=model_call,
        )
        model_calls += int(provisional.get("model_calls") or 0)
        steps += int(provisional.get("steps") or 0)
        tests_run += int(provisional.get("tests_run") or 0)
        tests_passed += int(provisional.get("tests_passed") or 0)
        internal_repairs += int(provisional.get("repairs") or 0)
        changed_files.update(str(item) for item in (provisional.get("changed_files") or []))
        phases.extend(str(item) for item in (provisional.get("agent_phases") or []))

        review_raw = reviewer(
            _review_prompt(root=root, task=original_task, provisional=provisional)
        )
        model_calls += 1
        semantic_reviews += 1
        phases.append("semantic_review")
        review = _parse_review(review_raw)
        attempts.append(
            {
                "round": semantic_reviews,
                "verdict": review["verdict"],
                "criteria_checked": list(review["criteria_checked"]),
                "findings": list(review["findings"]),
                "changed_files": list(provisional.get("changed_files") or []),
            }
        )

        if review["verdict"] == "pass":
            total_repairs = internal_repairs + semantic_repairs
            return {
                "contract": CONTRACT,
                "status": "completed",
                "changed_files": sorted(changed_files),
                "steps": steps,
                "model_calls": model_calls,
                "repairs": total_repairs,
                "tests_run": tests_run,
                "tests_passed": tests_passed,
                "agent_phases": list(dict.fromkeys(phases)),
                "semantic_review_passed": True,
                "semantic_reviews": semantic_reviews,
                "semantic_repairs": semantic_repairs,
                "review_criteria": list(review["criteria_checked"]),
                "review_findings": [],
                "review_attempts": attempts,
                "hidden_material_visible": False,
                "benchmark_task_specific_rewriter_used": False,
            }

        if semantic_repairs >= max_semantic_repairs:
            raise AgentContractError(
                "SEMANTIC_REVIEW_REPAIR_REQUIRED:" + _json(list(review["findings"]))
            )
        semantic_repairs += 1
        phases.append("bounded_repair")
        current_task = _actor_task(original_task, review["findings"])
