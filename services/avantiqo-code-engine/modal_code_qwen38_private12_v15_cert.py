"""Avantiqo Code Qwen3.8 Private12 V15 certification wrapper.

V15 preserves the V14 restored-actor + compact-review architecture and changes
only the two conditions directly implicated by the V14 hot-path failure:

* Repo Agent V14 uses a shorter, explicit, general comparator-index algorithm;
* the batched quality actor gets 768 tokens so a performance edit cannot be
  cut off at V14's exact 640-token ceiling.

Representative warm latency actors remain at 640 tokens, the compact reviewer
remains at 256, repair remains at 1024, and all call ceilings / certification
requirements remain unchanged.
"""

from __future__ import annotations

from typing import Iterable

import modal_code_qwen38_private12_v6_cert as base
import modal_code_qwen38_canary_runtime_v9 as runtime
import repo_agent_v14 as agent

CONTRACT = "AVANTIQO_CODE_QWEN38_PRIVATE12_CERT_V15"
RUN_SEED = "20260904-qwen38-private12-v15"
RUNTIME_CONTRACT = runtime.CONTRACT
WARM_TARGET_MS = base.WARM_TARGET_MS
ACTOR_MAX_TOKENS = 640
QUALITY_ACTOR_MAX_TOKENS = 768
REVIEWER_MAX_TOKENS = 256
REPAIR_MAX_TOKENS = 1024
MAX_MODAL_QUALITY_BATCH_CALLS = base.MAX_MODAL_QUALITY_BATCH_CALLS
MAX_MODAL_SINGLE_LATENCY_CALLS = base.MAX_MODAL_SINGLE_LATENCY_CALLS
MAX_MODAL_TOTAL_CALLS = base.MAX_MODAL_TOTAL_CALLS
MAX_CASE_MODEL_SEQUENCES = agent.MAX_CASE_MODEL_SEQUENCES

app = runtime.app
_BASE_BATCH = base._batch


def _effective_max_tokens(phase: str, requested: int) -> int:
    if phase == "quality_actor":
        return QUALITY_ACTOR_MAX_TOKENS
    if phase == "quality_repair":
        return REPAIR_MAX_TOKENS
    return requested


def _batch_v15(
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


def _bind_v15() -> None:
    base.CONTRACT = CONTRACT
    base.RUN_SEED = RUN_SEED
    base.RUNTIME_CONTRACT = RUNTIME_CONTRACT
    base.ACTOR_MAX_TOKENS = ACTOR_MAX_TOKENS
    base.REVIEWER_MAX_TOKENS = REVIEWER_MAX_TOKENS
    base.generate_v6 = runtime.generate_v9
    base._batch = _batch_v15
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


@app.local_entrypoint(name="qwen38_private12_v15")
def qwen38_private12_v15(approved: bool = False) -> None:
    if approved is not True:
        raise RuntimeError(f"{CONTRACT}_EXPLICIT_APPROVAL_REQUIRED")
    _bind_v15()
    base.qwen38_private12_v6(approved=True)


if __name__ == "__main__":
    raise RuntimeError("RUN_THROUGH_MODAL_ONLY")
