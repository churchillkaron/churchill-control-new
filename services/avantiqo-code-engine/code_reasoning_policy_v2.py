"""Adaptive reasoning policy for Avantiqo Code V2.

The objective is total-task latency and correctness, not maximum reasoning on
every turn. Simple bounded edits stay fast; repository-wide, concurrency,
security and state-machine work receive more reasoning budget. Reasoning remains
internal to the owned model and is never persisted or returned to the user.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

CONTRACT = "AVANTIQO_CODE_REASONING_POLICY_V2"


@dataclass(frozen=True)
class ReasoningPlan:
    lane: str
    reasoning_effort: str
    max_completion_tokens: int
    max_model_calls: int
    max_repairs: int
    preserve_thinking: bool
    require_repo_agent: bool


FAST = ReasoningPlan(
    lane="fast",
    reasoning_effort="low",
    max_completion_tokens=1200,
    max_model_calls=4,
    max_repairs=1,
    preserve_thinking=False,
    require_repo_agent=False,
)
STANDARD = ReasoningPlan(
    lane="standard",
    reasoning_effort="medium",
    max_completion_tokens=2400,
    max_model_calls=8,
    max_repairs=2,
    preserve_thinking=False,
    require_repo_agent=True,
)
DEEP = ReasoningPlan(
    lane="deep",
    reasoning_effort="xhigh",
    max_completion_tokens=5000,
    max_model_calls=12,
    max_repairs=2,
    preserve_thinking=True,
    require_repo_agent=True,
)

_SIMPLE_CAPABILITIES = {"ai.code.review", "ai.code.generate"}
_DEEP_SIGNALS = {
    "concurrency",
    "race condition",
    "idempotency",
    "at-most-once",
    "authorization",
    "authentication",
    "security",
    "migration",
    "transaction",
    "deadlock",
    "distributed",
    "multi-file",
    "cross-file",
    "state machine",
    "ledger",
    "financial",
    "rollback",
}
_STANDARD_SIGNALS = {
    "debug",
    "refactor",
    "test failure",
    "typescript",
    "next.js",
    "nextjs",
    "sql",
    "supabase",
    "api contract",
    "performance",
}


def choose(request: dict[str, Any]) -> ReasoningPlan:
    capability = str(request.get("capability") or "").strip().lower()
    instruction = str(request.get("instruction") or "").strip().lower()
    spec = request.get("structured_specification")
    specification = spec if isinstance(spec, dict) else {}

    explicit = str(specification.get("reasoning_effort") or "").strip().lower()
    if explicit in {"xhigh", "high"}:
        return DEEP
    if explicit == "medium":
        return STANDARD
    if explicit == "low":
        return FAST

    files = specification.get("files")
    file_count = len(files) if isinstance(files, list) else int(specification.get("file_count") or 0)
    test_execution_required = specification.get("execute_tests") is True
    repo_task = specification.get("repository_task") is True or file_count > 1
    text = instruction + " " + str(specification.get("production_contract") or "").lower()

    if repo_task and any(signal in text for signal in _DEEP_SIGNALS):
        return DEEP
    if file_count >= 4:
        return DEEP
    if any(signal in text for signal in _DEEP_SIGNALS):
        return DEEP
    if repo_task or test_execution_required:
        return STANDARD
    if capability in {"ai.code.edit", "ai.code.refactor", "ai.code.debug"}:
        return STANDARD
    if any(signal in text for signal in _STANDARD_SIGNALS):
        return STANDARD
    if capability in _SIMPLE_CAPABILITIES and len(instruction) <= 1800:
        return FAST
    return STANDARD


def evidence(plan: ReasoningPlan) -> dict[str, Any]:
    return {
        "contract": CONTRACT,
        "lane": plan.lane,
        "reasoning_effort": plan.reasoning_effort,
        "max_completion_tokens": plan.max_completion_tokens,
        "max_model_calls": plan.max_model_calls,
        "max_repairs": plan.max_repairs,
        "preserve_thinking": plan.preserve_thinking,
        "require_repo_agent": plan.require_repo_agent,
        "raw_reasoning_persisted": False,
        "chain_of_thought_returned": False,
    }
