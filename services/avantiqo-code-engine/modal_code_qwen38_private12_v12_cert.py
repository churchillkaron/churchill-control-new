"""Avantiqo Code Qwen3.8 Private12 V12 certification wrapper.

V12 keeps the V11 implementation/review behavior and changes only phase-local
structured-output budgets:

* initial actor: 640 tokens
* normal reviewer: 320 tokens
* shared repair actor: 1024 tokens
* final semantic reviewer: 448 tokens

The V11 paid evidence showed the remaining hot-path failure occurred only after
a successful repair/public-test pass, when the final reviewer ended exactly at
the 320-token ceiling and could not complete valid JSON. The normal reviewer and
all representative latency probes stay at their existing limits. Quality batch
and total Modal-call ceilings are unchanged.
"""

from __future__ import annotations

from typing import Any, Iterable

import modal_code_qwen38_private12_v6_cert as base
import modal_code_qwen38_canary_runtime_v7 as runtime
import repo_agent_v11 as agent

CONTRACT = "AVANTIQO_CODE_QWEN38_PRIVATE12_CERT_V12"
RUN_SEED = "20260904-qwen38-private12-v12"
RUNTIME_CONTRACT = runtime.CONTRACT
WARM_TARGET_MS = base.WARM_TARGET_MS
ACTOR_MAX_TOKENS = 640
REPAIR_MAX_TOKENS = 1024
REVIEWER_MAX_TOKENS = 320
FINAL_REVIEW_MAX_TOKENS = 448
MAX_MODAL_QUALITY_BATCH_CALLS = base.MAX_MODAL_QUALITY_BATCH_CALLS
MAX_MODAL_SINGLE_LATENCY_CALLS = base.MAX_MODAL_SINGLE_LATENCY_CALLS
MAX_MODAL_TOTAL_CALLS = base.MAX_MODAL_TOTAL_CALLS
MAX_CASE_MODEL_SEQUENCES = agent.MAX_CASE_MODEL_SEQUENCES

app = runtime.app
_BASE_BATCH = base._batch


def _effective_max_tokens(phase: str, requested: int) -> int:
    if phase == "quality_repair":
        return REPAIR_MAX_TOKENS
    if phase == "quality_final_review":
        return FINAL_REVIEW_MAX_TOKENS
    return requested


def _batch_v12(
    prompts: list[str],
    *,
    phase: str,
    role: str,
    max_tokens: int,
) -> tuple[list[str], int, list[int], list[int]]:
    return _BASE_BATCH(
        prompts,
        phase=phase,
        role=role,
        max_tokens=_effective_max_tokens(phase, max_tokens),
    )


def _edit_recovery_adapter(
    *,
    root: str,
    task: str,
    policy: agent.AgentPolicy,
    criteria: Iterable[str],
    error: str,
) -> str:
    return agent.build_edit_recovery_prompt(
        root=root,
        task=task,
        policy=policy,
        criteria=criteria,
        error=error,
        previous_output="",
    )


def _bind_v12() -> None:
    base.CONTRACT = CONTRACT
    base.RUN_SEED = RUN_SEED
    base.RUNTIME_CONTRACT = RUNTIME_CONTRACT
    base.ACTOR_MAX_TOKENS = ACTOR_MAX_TOKENS
    base.REVIEWER_MAX_TOKENS = REVIEWER_MAX_TOKENS
    base.generate_v6 = runtime.generate_v7
    base._batch = _batch_v12
    base.AgentContractError = agent.AgentContractError
    base.AgentPolicy = agent.AgentPolicy
    base.MAX_CASE_MODEL_SEQUENCES = MAX_CASE_MODEL_SEQUENCES
    base.apply_edits = agent.apply_edits
    base.build_actor_prompt = agent.build_actor_prompt
    base.build_review_prompt = agent.build_review_prompt
    base.build_repair_prompt = agent.build_repair_prompt
    base.build_edit_recovery_prompt = _edit_recovery_adapter
    base.parse_actor_result = agent.parse_actor_result
    base.parse_review = agent.parse_review
    base.run_public_tests = agent.run_public_tests


@app.local_entrypoint(name="qwen38_private12_v12")
def qwen38_private12_v12(approved: bool = False) -> None:
    if approved is not True:
        raise RuntimeError(f"{CONTRACT}_EXPLICIT_APPROVAL_REQUIRED")
    _bind_v12()
    base.qwen38_private12_v6(approved=True)


if __name__ == "__main__":
    raise RuntimeError("RUN_THROUGH_MODAL_ONLY")
