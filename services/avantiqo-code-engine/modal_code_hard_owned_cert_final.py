"""Final hard Code certification hardening layer.

This module strengthens only public-contract verification and certification truth:
- production clauses that escaped earlier semantic probes are gated before hidden scoring,
- first-pass and repair prompts receive explicit public-contract implementation plans,
- repair prompts are contract-first and never include the failed candidate source,
- generated source is bounded for the <=4s warm target,
- the legacy inner PASS marker is emitted only after final 10/10 + latency evidence.

No hidden test is copied into a prompt or public probe.
"""

from __future__ import annotations

import builtins
import json
from typing import Any

import modal_code_hard_owned_cert as hard
import modal_code_hard_owned_cert_fixed as fixed

app = fixed.app
MAX_COMPLETION_TOKENS = 800
COMPACT_TARGET_TOKENS = 650


def _task(case_id: str) -> dict[str, str]:
    return next(item for item in hard.HARD_TASKS if item["id"] == case_id)


def _append_public_probe(case_id: str, assertions: str) -> None:
    current = str(hard.HARD_PROBES.get(case_id) or "").rstrip()
    if assertions.strip() not in current:
        hard.HARD_PROBES[case_id] = current + "\n" + assertions.strip() + "\n"


idempotent = _task("idempotent_event_apply")
if "Missing/null state" not in idempotent["spec"]:
    idempotent["spec"] += (
        " Missing/null state behaves as {balance:0, appliedIds:[]}; a missing or "
        "non-array events input behaves as an empty event list."
    )

transition = _task("governed_state_transition")
if "Non-string/missing values" not in transition["spec"]:
    transition["spec"] += (
        " Non-string/missing values are unknown inputs and therefore return false; "
        "the function must never throw for unknown input values."
    )

inventory = _task("inventory_reservation")
if "Malformed/null request rows" not in inventory["spec"]:
    inventory["spec"] += (
        " Malformed/null request rows are ignored exactly like other invalid requests; "
        "they must never be dereferenced or throw."
    )

ledger = _task("ledger_currency_summary")
if "unrounded debit and credit totals" not in ledger["spec"]:
    ledger["spec"] += (
        " Accumulate debit and credit as raw unrounded numeric totals. At return time round "
        "the raw debit total, raw credit total, and raw (debit-credit) balance independently "
        "to two decimals; never derive balance by subtracting already-rounded display totals."
    )

tier = _task("progressive_tier_pricing")
if "Validate the complete tiers array before pricing" not in tier["spec"]:
    tier["spec"] += (
        " Validate the complete tiers array before pricing any units: every finite upTo must be "
        "finite, positive and strictly greater than the previous finite threshold; an open-ended "
        "null upTo may appear at most once and only as the final tier; every rate must be finite "
        "and non-negative. Any structural violation throws TypeError even when the requested units "
        "would fit inside an earlier tier."
    )

_append_public_probe(
    "inventory_reservation",
    '''assert.deepEqual(
  reserveInventory({bad:"not-a-number", zero:0}, [null,{sku:"zero",quantity:1}]),
  {remaining:{ZERO:0}, allocations:[]}
);''',
)
_append_public_probe(
    "idempotent_event_apply",
    '''assert.deepEqual(
  applyAccountEvents(undefined, []),
  {balance:0, appliedIds:[]}
);
assert.deepEqual(
  applyAccountEvents({balance:"invalid", appliedIds:null}, undefined),
  {balance:0, appliedIds:[]}
);''',
)
_append_public_probe(
    "governed_state_transition",
    '''assert.equal(canTransition(undefined,"DRAFT","admin"),false);
assert.equal(canTransition("UNKNOWN","DRAFT","admin"),false);
assert.equal(canTransition("DRAFT","SUBMITTED","unknown-role"),false);''',
)
_append_public_probe(
    "ledger_currency_summary",
    '''const roundingRows=[
  {currency:" eur ",side:"debit",amount:"2.675"},
  {currency:"EUR",side:"credit",amount:"0.005"}
];
assert.deepEqual(
  summarizeLedger(roundingRows),
  {EUR:{debit:2.67,credit:0.01,balance:2.67}}
);''',
)
_append_public_probe(
    "progressive_tier_pricing",
    '''assert.throws(
  ()=>calculateCharge(5,[{upTo:80,rate:1},{upTo:70,rate:2}]),
  TypeError
);
assert.throws(
  ()=>calculateCharge(5,[{upTo:null,rate:1},{upTo:90,rate:2}]),
  TypeError
);
assert.throws(
  ()=>calculateCharge(5,[{upTo:90,rate:"bad"}]),
  TypeError
);''',
)


_original_plan = fixed._contract_repair_plan


def _hardened_repair_plan(contract: str) -> str:
    base = _original_plan(contract)
    text = contract.lower()
    additions: list[str] = []
    if "canonicalize sku" in text and "remaining" in text:
        additions.append(
            "VALID-STOCK/REQUEST PLAN: validate each raw stock quantity before inserting its "
            "canonical SKU; invalid/non-finite stock is omitted completely while valid numeric "
            "zero remains. Before reading any request field, skip null/non-object request rows. "
            "Then canonicalize/validate SKU and quantity and omit zero allocations."
        )
    if "summarizeledger" in text or "canonical currency" in text:
        additions.append(
            "LEDGER RAW-TOTAL PLAN: keep mutable rawDebit/rawCredit totals separate from the "
            "returned display object. Never overwrite raw totals with rounded values. At output, "
            "compute debit=round(rawDebit), credit=round(rawCredit), and "
            "balance=round(rawDebit-rawCredit) independently from the still-unrounded totals."
        )
    if "appliedids" in text:
        additions.append(
            "STREAMING-IDEMPOTENCY PLAN: normalize state first, copy prior appliedIds, and seed a "
            "Set with canonical prior IDs. Process events in one loop, not a pre-filter pass. "
            "For each event, reject seen IDs; after a DEPOSIT succeeds or a sufficiently funded "
            "WITHDRAWAL succeeds, immediately add its canonical ID to the Set and append it before "
            "the next event. A failed overdraft is never marked applied."
        )
        additions.append(
            "EMPTY-INPUT PLAN: missing/null state is normalized before any dereference; invalid "
            "balance becomes 0, invalid appliedIds becomes [], and missing/non-array events is []."
        )
    if "cantransition" in text or "unknown states/roles" in text:
        additions.append(
            "TOTAL-BOOLEAN PLAN: normalize only actual strings. Missing/non-string/unknown "
            "current, next or role values return false immediately; no map lookup or .includes "
            "call may occur on an undefined transition set."
        )
    if "pricing is progressive" in text or "strictly increasing finite positive" in text:
        additions.append(
            "TIER TWO-PASS PLAN: first validate the entire tier array and convert each threshold/" 
            "rate without pricing anything. Then price with remainingUnits as a quantity, never an "
            "absolute position: for a finite tier width=upTo-previousThreshold and "
            "used=min(remainingUnits,width); charge += used*rate; remainingUnits -= used. For the "
            "final null tier charge += remainingUnits*rate and set remainingUnits=0. Never subtract "
            "previousThreshold from remainingUnits. If remainingUnits remains after finite tiers "
            "with no null tier, throw RangeError."
        )
    additions.append(
        f"LATENCY PLAN: return a complete minimal implementation with no explanatory comments "
        f"or redundant helpers; target <= {COMPACT_TARGET_TOKENS} completion tokens."
    )
    return "\n".join([base, *additions])


fixed._contract_repair_plan = _hardened_repair_plan

_original_hard_prompt = hard._hard_prompt


def _compact_hard_prompt(task: dict[str, str], failure: str) -> str:
    plan = fixed._contract_repair_plan(task["spec"])
    return "\n\n".join(
        [
            _original_hard_prompt(task, failure),
            "PUBLIC-CONTRACT IMPLEMENTATION PLAN:\n" + plan,
            (
                f"LATENCY-CONSTRAINED SOURCE CONTRACT: return the complete correct source in "
                f"<= {COMPACT_TARGET_TOKENS} completion tokens. Use direct code, no explanatory "
                "comments, no prose and no redundant abstractions. Correctness is mandatory."
            ),
        ]
    )


hard._hard_prompt = _compact_hard_prompt

_original_repair_request = hard.cert._repair_request


def _compact_repair_request(
    request: dict[str, Any], candidate: str, failure: str
) -> dict[str, Any]:
    # Let the established repair builder preserve identity/sampling metadata, then
    # replace its source-anchored instruction with a contract-first instruction.
    # The failed candidate is deliberately absent: the deterministic machine
    # failure already explains what was wrong, and copying candidate structure was
    # the proven cause of repeated repairs in run 33703280964.
    repaired = _original_repair_request(request, candidate, failure)
    specification = dict(repaired.get("structured_specification") or {})
    case_id = str(specification.get("benchmark_case") or "").strip()
    task = _task(case_id)
    production_contract = str(
        specification.get("production_contract") or task["spec"]
    ).strip()
    declared_probe = str(hard.HARD_PROBES.get(case_id) or "").strip()
    plan = fixed._contract_repair_plan(production_contract)
    repaired["instruction"] = "\n\n".join(
        [
            "AVANTIQO CONTRACT-FIRST EXECUTABLE REPAIR.",
            "Write a fresh implementation from the authoritative public contract. Do not preserve, "
            "imitate, patch around, or reason from the previous candidate's code structure.",
            (
                f'Return ONLY strict JSON with exactly this shape: '
                f'{{"path":"{task["module"]}","content":"<complete UTF-8 source file>"}}.'
            ),
            f"Modify only {task['module']}. Keep the existing public export name. No imports, "
            "environment access, filesystem, child processes, network calls, global state, or "
            "dynamic evaluation.",
            "AUTHORITATIVE PRODUCTION CONTRACT:\n" + production_contract,
            (
                "DECLARED PUBLIC SEMANTIC PROBE:\n" + declared_probe
                if declared_probe
                else "DECLARED PUBLIC SEMANTIC PROBE: none"
            ),
            "DETERMINISTIC MACHINE FAILURE TO CORRECT:\n" + str(failure)[-3000:],
            "MANDATORY CONTRACT-DERIVED ALGORITHM:\n" + plan,
            (
                "Before returning, mentally execute the visible/public semantic cases against the "
                "fresh implementation. Correct every clause, not only the first assertion."
            ),
            (
                f"COMPACT REPLACEMENT REQUIREMENT: complete replacement source must target <= "
                f"{COMPACT_TARGET_TOKENS} completion tokens; omit comments, prose, and redundant "
                "helpers inside the source."
            ),
        ]
    )
    for key in (
        "failed_candidate",
        "candidate",
        "previous_candidate",
        "failed_source",
        "previous_source",
    ):
        specification.pop(key, None)
    specification["max_completion_tokens"] = MAX_COMPLETION_TOKENS
    specification["compact_completion_target_tokens"] = COMPACT_TARGET_TOKENS
    specification["repair_prompt_contract_first"] = True
    specification["failed_candidate_included_in_prompt"] = False
    specification["contract_derived_repair_plan"] = plan
    repaired["structured_specification"] = specification
    return repaired


hard.cert._repair_request = _compact_repair_request


def _summary_is_certified(summary: dict[str, Any]) -> bool:
    return all(
        (
            int(summary.get("cases") or 0) == 10,
            int(summary.get("passed") or 0) == 10,
            int(summary.get("hidden_tests_passed") or 0) == 10,
            int(summary.get("instruction_format_passed") or 0) == 10,
            int(summary.get("security_boundary_passed") or 0) == 10,
            summary.get("machine_gate_passed") is True,
            summary.get("warm_container_reused") is True,
            summary.get("warm_latency_passed") is True,
            int(summary.get("warm_max_ms") or 10**9) <= hard.WARM_LATENCY_TARGET_MS,
            summary.get("persistent_model_storage") is True,
            summary.get("model_storage_ready") is True,
            summary.get("model_storage_reused") is True,
            summary.get("production_deploy_performed") is False,
        )
    )


assert _summary_is_certified(
    {
        "cases": 10,
        "passed": 10,
        "hidden_tests_passed": 10,
        "instruction_format_passed": 10,
        "security_boundary_passed": 10,
        "machine_gate_passed": True,
        "warm_container_reused": True,
        "warm_latency_passed": True,
        "warm_max_ms": 3999,
        "persistent_model_storage": True,
        "model_storage_ready": True,
        "model_storage_reused": True,
        "production_deploy_performed": False,
    }
)
assert not _summary_is_certified(
    {
        "cases": 10,
        "passed": 7,
        "hidden_tests_passed": 7,
        "instruction_format_passed": 10,
        "security_boundary_passed": 10,
        "machine_gate_passed": True,
        "warm_container_reused": True,
        "warm_latency_passed": False,
        "warm_max_ms": 5225,
        "persistent_model_storage": True,
        "model_storage_ready": True,
        "model_storage_reused": True,
        "production_deploy_performed": False,
    }
)


@app.local_entrypoint(name="hard_owned_cert_final")
def hard_owned_cert_final() -> None:
    real_print = builtins.print

    def truth_print(*args: Any, **kwargs: Any) -> None:
        if len(args) == 1 and str(args[0]) == f"{hard.CONTRACT}=PASS":
            return
        real_print(*args, **kwargs)

    builtins.print = truth_print
    try:
        fixed.hard_owned_cert_fixed()
    finally:
        builtins.print = real_print

    if not hard.OUTPUT_PATH.is_file():
        raise RuntimeError(f"{hard.CONTRACT}_FINAL_REPORT_REQUIRED")
    report = json.loads(hard.OUTPUT_PATH.read_text(encoding="utf-8"))
    summary = report.get("summary") if isinstance(report, dict) else None
    if not isinstance(summary, dict) or not _summary_is_certified(summary):
        real_print(
            "AVANTIQO_CODE_HARD_FINAL_CERTIFICATION=FAIL:"
            + json.dumps(summary or {}, separators=(",", ":")),
            flush=True,
        )
        raise RuntimeError(f"{hard.CONTRACT}_FINAL_EVIDENCE_NOT_CERTIFIED")

    real_print(
        "AVANTIQO_CODE_HARD_FINAL_CERTIFICATION="
        + json.dumps(summary, separators=(",", ":")),
        flush=True,
    )
    real_print(f"{hard.CONTRACT}=PASS", flush=True)
