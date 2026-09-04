"""Avantiqo Code Qwen3.8 Private12 V7 certification wrapper.

V7 intentionally reuses the already-audited V6 certification orchestration and
strict World-Class V3 scorer while swapping only the two components whose
contracts changed after V6 evidence:

* Repo Agent V8: selective semantic guidance + transactional edit application;
* Runtime V7: the V6 CUDA/prefix/ngram acceleration path plus grammar-constrained
  actor/reviewer JSON.

The fresh run seed prevents fixture identity reuse. The underlying V6 runner
still enforces the same 12-case sealed suite, <=4 quality batches, exactly three
representative warm single-request latency calls, <=7 total Modal calls and the
unchanged <=4000 ms p95 requirement. This wrapper performs no deployment,
production routing, model download or volume creation.
"""

from __future__ import annotations

from typing import Iterable

import modal_code_qwen38_private12_v6_cert as base
import modal_code_qwen38_canary_runtime_v7 as runtime
import repo_agent_v8 as agent

CONTRACT = "AVANTIQO_CODE_QWEN38_PRIVATE12_CERT_V7"
RUN_SEED = "20260904-qwen38-private12-v7"
RUNTIME_CONTRACT = runtime.CONTRACT
WARM_TARGET_MS = base.WARM_TARGET_MS
MAX_MODAL_QUALITY_BATCH_CALLS = base.MAX_MODAL_QUALITY_BATCH_CALLS
MAX_MODAL_SINGLE_LATENCY_CALLS = base.MAX_MODAL_SINGLE_LATENCY_CALLS
MAX_MODAL_TOTAL_CALLS = base.MAX_MODAL_TOTAL_CALLS
MAX_CASE_MODEL_SEQUENCES = agent.MAX_CASE_MODEL_SEQUENCES

app = runtime.app


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


def _bind_v7() -> None:
    base.CONTRACT = CONTRACT
    base.RUN_SEED = RUN_SEED
    base.RUNTIME_CONTRACT = RUNTIME_CONTRACT
    base.generate_v6 = runtime.generate_v7
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


@app.local_entrypoint(name="qwen38_private12_v7")
def qwen38_private12_v7(approved: bool = False) -> None:
    if approved is not True:
        raise RuntimeError(f"{CONTRACT}_EXPLICIT_APPROVAL_REQUIRED")
    _bind_v7()
    base.qwen38_private12_v6(approved=True)


if __name__ == "__main__":
    raise RuntimeError("RUN_THROUGH_MODAL_ONLY")
