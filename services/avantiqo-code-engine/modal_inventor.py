"""Single-H100 multi-pass invention mode for Avantiqo Code.

Inventor deliberately keeps exploration inside one Modal GPU Function so a
single request cannot fan out into several concurrent H100 containers. It uses
the already-proven owned Qwen/vLLM handler repeatedly in one process:

1. three deliberately different solution lenses,
2. one adversarial comparison,
3. one final synthesis.

Intermediate candidates are ephemeral and are not returned or persisted. The
normal Code path remains deterministic and single-pass; this mode is opt-in via
`ai.code.invent` because it intentionally consumes more inference.
"""

from __future__ import annotations

import json
import os
import time
import uuid
from typing import Any

from modal_app import (
    ENGINE_CONTRACT,
    PRODUCT_MODEL,
    app,
    image,
)

INVENTOR_CAPABILITY = "ai.code.invent"
UNDERLYING_CAPABILITY = "ai.code.generate"
INVENTOR_CONTRACT = "AVANTIQO_CODE_INVENTOR_V1"
MAX_EPHEMERAL_CANDIDATE_CHARS = 12_000
MAX_EPHEMERAL_CRITIQUE_CHARS = 10_000


def _text(value: Any) -> str:
    return str(value or "").strip()


def _safe_specification(value: Any, depth: int = 0) -> Any:
    if depth > 8:
        return "[depth-limited]"
    if isinstance(value, list):
        return [_safe_specification(item, depth + 1) for item in value]
    if not isinstance(value, dict):
        return value
    private = {
        "reasoning",
        "reasoning_content",
        "chain_of_thought",
        "chainofthought",
        "cot",
        "thoughts",
        "scratchpad",
        "analysis",
    }
    return {
        str(key): _safe_specification(child, depth + 1)
        for key, child in value.items()
        if str(key).lower() not in private
    }


def _require_completed(output: Any, stage: str) -> dict[str, Any]:
    if not isinstance(output, dict):
        raise RuntimeError(f"AVANTIQO_CODE_INVENTOR_{stage}_OUTPUT_OBJECT_REQUIRED")
    if _text(output.get("status")) != "completed":
        code = _text(output.get("error_code")) or _text(output.get("status")) or "UNKNOWN"
        raise RuntimeError(f"AVANTIQO_CODE_INVENTOR_{stage}_FAILED:{code}")
    if output.get("raw_reasoning_persisted") is not False:
        raise RuntimeError("AVANTIQO_CODE_INVENTOR_REASONING_BOUNDARY_INVALID")
    if not _text(output.get("result")):
        raise RuntimeError(f"AVANTIQO_CODE_INVENTOR_{stage}_RESULT_REQUIRED")
    return output


def _aggregate_usage(outputs: list[dict[str, Any]]) -> dict[str, int]:
    totals = {
        "input_tokens": 0,
        "output_tokens": 0,
        "runtime_prompt_tokens": 0,
        "internal_prompt_tokens": 0,
    }
    for output in outputs:
        usage = output.get("usage") or {}
        for key in totals:
            try:
                totals[key] += max(0, int(usage.get(key) or 0))
            except (TypeError, ValueError):
                pass
    return totals


def _call_engine(code_engine: Any, data: dict[str, Any], instruction: str, stage: str) -> dict[str, Any]:
    specification = dict(data.get("structured_specification") or {})
    specification["inventor"] = {
        "contract": INVENTOR_CONTRACT,
        "stage": stage,
        "intermediate_outputs_persisted": False,
    }
    worker_input = {
        **data,
        "capability": UNDERLYING_CAPABILITY,
        "instruction": instruction,
        "structured_specification": _safe_specification(specification),
    }
    return _require_completed(
        code_engine.handler(
            {
                "id": f"modal-inventor-{stage}-{uuid.uuid4()}",
                "input": worker_input,
            }
        ),
        stage.upper().replace("-", "_"),
    )


@app.function(
    image=image,
    gpu="H100",
    timeout=30 * 60,
    scaledown_window=5,
)
def invent(data: dict[str, Any]) -> dict[str, Any]:
    """Run a governed invention tournament inside one H100 container."""
    if _text(data.get("contract")) != ENGINE_CONTRACT:
        raise ValueError("AVANTIQO_CODE_ENGINE_CONTRACT_INVALID")
    if _text(data.get("capability")) != INVENTOR_CAPABILITY:
        raise ValueError("AVANTIQO_CODE_INVENTOR_CAPABILITY_REQUIRED")
    if not _text(data.get("organization_id")):
        raise ValueError("AVANTIQO_CODE_ORGANIZATION_REQUIRED")
    if not _text(data.get("usage_id")):
        raise ValueError("AVANTIQO_CODE_USAGE_ID_REQUIRED")

    original_instruction = _text(data.get("instruction"))
    if not original_instruction:
        raise ValueError("AVANTIQO_CODE_INSTRUCTION_REQUIRED")
    if len(original_instruction) > 24_000:
        raise ValueError("AVANTIQO_CODE_INVENTOR_INSTRUCTION_TOO_LONG")

    os.chdir("/app")
    import handler as code_engine

    code_engine.runpod.serverless.progress_update = lambda *_args, **_kwargs: None
    started = time.perf_counter()
    stage_outputs: list[dict[str, Any]] = []

    lenses = [
        (
            "constraint-breaker",
            "Challenge the apparent architecture and assumptions. Reframe the problem if useful. "
            "Prefer a genuinely different abstraction over cosmetic variation. Produce a concrete, "
            "implementable solution or code artifact; do not expose hidden reasoning.",
        ),
        (
            "systems-engineer",
            "Optimize for correctness, security, performance, failure recovery, observability, and "
            "maintainability. Produce a concrete implementation that can survive production abuse; "
            "do not expose hidden reasoning.",
        ),
        (
            "elegant-simplifier",
            "Seek the smallest powerful design with lower cost, latency, operational complexity, and "
            "future maintenance burden. Remove unnecessary assumptions and invent a cleaner primitive "
            "when possible. Produce concrete implementation; do not expose hidden reasoning.",
        ),
    ]

    candidates: list[tuple[str, str]] = []
    for lens_name, lens_instruction in lenses:
        stage = f"candidate-{lens_name}"
        output = _call_engine(
            code_engine,
            data,
            "\n\n".join(
                [
                    f"Original problem:\n{original_instruction}",
                    f"Independent invention lens: {lens_name}.",
                    lens_instruction,
                    "Do not merely paraphrase a conventional answer. Make the result independently useful.",
                ]
            ),
            stage,
        )
        stage_outputs.append(output)
        candidates.append(
            (lens_name, _text(output.get("result"))[:MAX_EPHEMERAL_CANDIDATE_CHARS])
        )

    candidate_packet = "\n\n".join(
        f"=== CANDIDATE {index + 1}: {name} ===\n{candidate}"
        for index, (name, candidate) in enumerate(candidates)
    )
    judge = _call_engine(
        code_engine,
        data,
        "\n\n".join(
            [
                f"Original problem:\n{original_instruction}",
                "Act as an adversarial engineering judge. Compare the three independent candidates below.",
                "Evaluate correctness, novelty, simplicity, performance, security, maintainability, cost, "
                "failure modes, and fit to the actual problem. Reject superficial cleverness. Identify what "
                "should be kept, discarded, or combined. Return a concise engineering decision memo, not "
                "hidden chain-of-thought.",
                candidate_packet,
            ]
        ),
        "adversarial-judge",
    )
    stage_outputs.append(judge)
    critique = _text(judge.get("result"))[:MAX_EPHEMERAL_CRITIQUE_CHARS]

    synthesis = _call_engine(
        code_engine,
        data,
        "\n\n".join(
            [
                f"Original problem:\n{original_instruction}",
                "You are the final Avantiqo Code inventor. Produce the strongest final work product now.",
                "You may combine candidates, discard all of them, or introduce a better fourth idea if the "
                "judge exposed a weakness. Prefer proof, runnable code, explicit interfaces, and robust failure "
                "handling over vague prose. Return only the useful final deliverable; do not expose hidden reasoning.",
                f"Adversarial judge memo:\n{critique}",
                candidate_packet,
            ]
        ),
        "final-synthesis",
    )
    stage_outputs.append(synthesis)

    final = dict(synthesis)
    final["capability"] = INVENTOR_CAPABILITY
    final["usage"] = _aggregate_usage(stage_outputs)
    final["generation_seconds"] = round(time.perf_counter() - started, 3)
    final["inventor"] = {
        "contract": INVENTOR_CONTRACT,
        "candidate_count": len(candidates),
        "model_passes": len(stage_outputs),
        "strategy": "divergent-3+adversarial-judge+final-synthesis",
        "single_gpu_function": True,
        "concurrent_gpu_fanout": False,
        "intermediate_outputs_persisted": False,
        "raw_reasoning_persisted": False,
    }
    final["modal_transport"] = "inventor-single-h100"
    final["modal_gpu"] = "H100"
    final["modal_volume_created"] = False
    final["runpod_inference_performed"] = False
    final["production_deploy_performed"] = False
    final["raw_reasoning_persisted"] = False
    return final
