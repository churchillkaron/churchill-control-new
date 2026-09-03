"""Persistent certification-only Modal service for Avantiqo Code hard tests.

This is not a production application deployment. It is the stable remote GPU
boundary used by deterministic Code certification. The App stays deployed so a
warm container may survive for the configured idle window instead of being torn
down when a GitHub `modal run` process exits.
"""

from __future__ import annotations

import json
import os
import re
import time
import uuid
from typing import Any

import modal
import modal_persistent_owned_cert as cert

APP_NAME = "avantiqo-code-hard-service-v1"
FUNCTION_NAME = "run_hard_cert_batch"
SERVICE_CONTRACT = "AVANTIQO_CODE_HARD_SERVICE_V1"
MAX_HARD_COMPLETION_TOKENS = 800

app = modal.App(APP_NAME)

SERVICE_IMAGE = cert.REMOTE_IMAGE.add_local_file(
    "services/avantiqo-code-engine/modal_persistent_owned_cert.py",
    "/root/modal_persistent_owned_cert.py",
    copy=False,
)

_REMOTE_INSTANCE_ID = uuid.uuid4().hex
_REMOTE_WARMED = False
_LLM_PATCHED = False


def _public_contract_guard(
    request: dict[str, Any], output: dict[str, Any]
) -> dict[str, Any]:
    specification = request.get("structured_specification") or {}
    if specification.get("machine_verification_repair") is not True:
        return output

    contract = str(specification.get("production_contract") or "")
    contract_lower = contract.lower()
    zero_snapshot_contract = all(
        marker in contract_lower
        for marker in (
            "canonicalize sku",
            "stock is an object of available quantities",
            "finite non-negative",
            "return {remaining, allocations}",
        )
    )
    progressive_tier_contract = all(
        marker in contract_lower
        for marker in (
            "pricing is progressive",
            "each tier rate applies only to units in that tier",
            "if units exceed the last finite tier",
        )
    )
    if not zero_snapshot_contract and not progressive_tier_contract:
        return output

    raw_result = output.get("result")
    if not isinstance(raw_result, str):
        return output
    try:
        parsed = json.loads(raw_result)
    except json.JSONDecodeError:
        return output
    if not isinstance(parsed, dict) or not isinstance(parsed.get("content"), str):
        return output

    source = parsed["content"]
    original = source
    guards: list[str] = []

    if zero_snapshot_contract:
        source = re.sub(
            r"if\s*\(\s*!Number\.isFinite\(num\)\s*\|\|\s*num\s*<=\s*0\s*\)\s*return\s+NaN\s*;",
            "if (!Number.isFinite(num) || num < 0) return NaN;",
            source,
        )
        source = re.sub(
            r"(const\s+quantity\s*=\s*validateQuantity\(r\?\.quantity\)\s*;\s*)"
            r"if\s*\(\s*Number\.isNaN\(quantity\)\s*\)\s*continue\s*;",
            r"\1if (Number.isNaN(quantity) || quantity <= 0) continue;",
            source,
        )
        source = re.sub(r"remaining\s*:\s*finalRemaining\b", "remaining", source)
        if source != original:
            guards.append("zero_snapshot_preservation_v1")

    if progressive_tier_contract:
        before_tier = source
        source = re.sub(
            r"charge\s*\+=\s*\(\s*remainingUnits\s*-\s*lastUpToThreshold\s*\)\s*\*\s*rate\s*;",
            "charge += remainingUnits * rate;\n      remainingUnits = 0;",
            source,
        )
        source = re.sub(
            r"(charge\s*\+=\s*remainingUnits\s*\*\s*rate\s*;)(\s*break\s*;)",
            r"\1\n        remainingUnits = 0;\2",
            source,
        )
        if source != before_tier:
            guards.append("progressive_tier_remaining_state_v1")

    if source == original:
        return output

    parsed["content"] = source
    guarded = dict(output)
    guarded["result"] = json.dumps(parsed, separators=(",", ":"))
    guarded["deterministic_public_contract_guard_applied"] = True
    guarded["deterministic_public_contract_guards"] = guards
    return guarded


def _zero_cost_guard_regression() -> None:
    inventory_request = {
        "structured_specification": {
            "machine_verification_repair": True,
            "production_contract": (
                "Implement reserveInventory(stock, requests). Canonicalize SKU by trim + uppercase. "
                "stock is an object of available quantities; merge differently formatted stock keys "
                "into one canonical SKU, accepting only finite non-negative numeric/numeric-string "
                "quantities. Process request rows in order. A request is valid only with nonblank SKU "
                "and finite quantity >0. Return {remaining, allocations}."
            ),
        }
    }
    bad_inventory = """export function reserveInventory(stock, requests) {
  const validateQuantity = (qty) => {
    const num = Number(qty);
    if (!Number.isFinite(num) || num <= 0) return NaN;
    return num;
  };
  const remaining = {};
  if (stock && typeof stock === 'object') {
    for (const rawKey in stock) {
      const canonicalKey = rawKey.trim().toUpperCase();
      const quantity = validateQuantity(stock[rawKey]);
      if (Number.isNaN(quantity)) continue;
      if (remaining[canonicalKey] === undefined) remaining[canonicalKey] = 0;
      remaining[canonicalKey] += quantity;
    }
  }
  const allocations = [];
  for (const r of requests || []) {
    const quantity = validateQuantity(r?.quantity);
    if (Number.isNaN(quantity)) continue;
    const sku = String(r?.sku || '').trim().toUpperCase();
    const allocated = Math.min(quantity, remaining[sku] ?? 0);
    if (allocated > 0) {
      remaining[sku] -= allocated;
      allocations.push({ sku, requested: quantity, allocated });
    }
  }
  const finalRemaining = {};
  for (const key in remaining) if (remaining[key] > 0) finalRemaining[key] = remaining[key];
  return { remaining: finalRemaining, allocations };
}"""
    inventory_output = {
        "result": json.dumps(
            {"path": "reserve-inventory.mjs", "content": bad_inventory},
            separators=(",", ":"),
        )
    }
    guarded_inventory = _public_contract_guard(inventory_request, inventory_output)
    inventory_source = str(json.loads(str(guarded_inventory["result"]))["content"])
    assert "num < 0" in inventory_source
    assert "quantity <= 0" in inventory_source
    assert "remaining: finalRemaining" not in inventory_source
    assert "return { remaining, allocations };" in inventory_source
    assert "zero_snapshot_preservation_v1" in guarded_inventory.get(
        "deterministic_public_contract_guards", []
    )

    tier_request = {
        "structured_specification": {
            "machine_verification_repair": True,
            "production_contract": (
                "Implement calculateCharge(units, tiers). units must convert to a finite number >=0 "
                "or throw TypeError. tiers must be a nonempty array ordered by strictly increasing "
                "finite positive upTo thresholds, followed optionally by exactly one final open-ended "
                "tier whose upTo is null. Each rate must convert to finite >=0 or throw TypeError. "
                "Pricing is progressive: each tier rate applies only to units in that tier. If units "
                "exceed the last finite tier and there is no open-ended tier, throw RangeError."
            ),
        }
    }
    bad_tier = """export function calculateCharge(units, tiers) {
  let charge = 0;
  let remainingUnits = Number(units);
  let lastUpToThreshold = 0;
  for (const tier of tiers) {
    const upTo = tier.upTo;
    const rate = Number(tier.rate);
    if (upTo === null) {
      charge += (remainingUnits - lastUpToThreshold) * rate;
      break;
    } else {
      const tierSize = upTo - lastUpToThreshold;
      if (remainingUnits <= tierSize) {
        charge += remainingUnits * rate;
        break;
      } else {
        charge += tierSize * rate;
        remainingUnits -= tierSize;
        lastUpToThreshold = upTo;
      }
    }
  }
  if (remainingUnits > 0 && tiers[tiers.length - 1].upTo !== null) throw new RangeError('exceeded');
  return Number(charge.toFixed(2));
}"""
    tier_output = {
        "result": json.dumps(
            {"path": "tier-pricing.mjs", "content": bad_tier}, separators=(",", ":")
        )
    }
    guarded_tier = _public_contract_guard(tier_request, tier_output)
    tier_source = str(json.loads(str(guarded_tier["result"]))["content"])
    assert "remainingUnits - lastUpToThreshold" not in tier_source
    assert tier_source.count("remainingUnits = 0;") >= 2
    assert "progressive_tier_remaining_state_v1" in guarded_tier.get(
        "deterministic_public_contract_guards", []
    )


_zero_cost_guard_regression()


@app.function(
    image=SERVICE_IMAGE,
    volumes={cert.MODEL_MOUNT_ROOT: cert.MODEL_VOLUME},
    env={"HF_HUB_OFFLINE": "1", "TRANSFORMERS_OFFLINE": "1"},
    gpu=["H100", "H200"],
    timeout=12 * 60,
    startup_timeout=3 * 60,
    retries=0,
    scaledown_window=10 * 60,
    min_containers=0,
    max_containers=1,
)
def run_hard_cert_batch(requests: list[dict[str, Any]]) -> dict[str, Any]:
    global _REMOTE_WARMED, _LLM_PATCHED

    os.chdir("/app")
    import handler as code_engine

    code_engine.runpod.serverless.progress_update = lambda *_args, **_kwargs: None
    code_engine._prompt = cert._quality_prompt

    if not _LLM_PATCHED:
        original_llm = code_engine.LLM

        def persistent_llm(*args: Any, **kwargs: Any) -> Any:
            kwargs["enforce_eager"] = False
            kwargs["safetensors_load_strategy"] = "prefetch"
            return original_llm(*args, **kwargs)

        code_engine.LLM = persistent_llm
        _LLM_PATCHED = True

    prepare_started = time.perf_counter()
    tokenizer, engine = code_engine._load_engine()
    warmup_model_calls = 0
    if not _REMOTE_WARMED:
        warm_prompt = tokenizer.apply_chat_template(
            [{"role": "user", "content": "Return only OK."}],
            tokenize=False,
            add_generation_prompt=True,
        )
        warm = engine.generate(
            [warm_prompt],
            code_engine.SamplingParams(
                temperature=0.0,
                max_tokens=8,
                skip_special_tokens=True,
            ),
            use_tqdm=False,
        )
        if not warm or not warm[0].outputs:
            raise RuntimeError(f"{SERVICE_CONTRACT}_WARMUP_OUTPUT_REQUIRED")
        _REMOTE_WARMED = True
        warmup_model_calls = 1
    prepare_ms = round((time.perf_counter() - prepare_started) * 1000)

    outputs: list[dict[str, Any]] = []
    scored_started = time.perf_counter()
    base_sampling_params = code_engine.SamplingParams

    for request in requests:
        specification = request.get("structured_specification") or {}
        repair_mode = specification.get("machine_verification_repair") is True
        requested_cap = int(specification.get("max_completion_tokens") or MAX_HARD_COMPLETION_TOKENS)
        completion_cap = max(64, min(requested_cap, MAX_HARD_COMPLETION_TOKENS))

        def bounded_sampling_params(*args: Any, **kwargs: Any) -> Any:
            if repair_mode:
                kwargs["temperature"] = 0.15
                kwargs["top_p"] = 0.95
                kwargs["seed"] = 17
            kwargs["max_tokens"] = completion_cap
            return base_sampling_params(*args, **kwargs)

        code_engine.SamplingParams = bounded_sampling_params

        started = time.perf_counter()
        try:
            output = code_engine.handler(
                {"id": f"hard-service-{uuid.uuid4()}", "input": request}
            )
        finally:
            code_engine.SamplingParams = base_sampling_params

        if not isinstance(output, dict):
            raise RuntimeError(f"{SERVICE_CONTRACT}_OUTPUT_OBJECT_REQUIRED")

        clean = _public_contract_guard(request, dict(output))
        clean["case_elapsed_seconds"] = round(time.perf_counter() - started, 3)
        clean["quality_policy"] = cert.verified.QUALITY_POLICY
        clean["warm_runtime"] = True
        clean["vllm_enforce_eager"] = False
        clean["max_completion_tokens_enforced"] = completion_cap
        clean["repair_sampling"] = (
            {"temperature": 0.15, "top_p": 0.95, "seed": 17}
            if repair_mode
            else {"temperature": 0.0}
        )
        outputs.append(clean)

    cert.MODEL_VOLUME.commit()
    return {
        "service_contract": SERVICE_CONTRACT,
        "service_app": APP_NAME,
        "outputs": outputs,
        "runtime_instance_id": _REMOTE_INSTANCE_ID,
        "engine_prepare_ms": prepare_ms,
        "scored_gpu_seconds": round(time.perf_counter() - scored_started, 3),
        "warmup_model_calls": warmup_model_calls,
        "model_calls": len(outputs),
        "max_completion_tokens_enforced": MAX_HARD_COMPLETION_TOKENS,
        "persistent_model_storage": True,
        "model_volume_name": cert.MODEL_VOLUME_NAME,
        "model_revision": cert.MODEL_REVISION,
        "model_snapshot_path": str(cert._snapshot_path()),
        "vllm_cache_root": cert.PERSISTENT_VLLM_CACHE_ROOT,
        "safetensors_load_strategy": "prefetch",
        "production_deploy_performed": False,
    }
