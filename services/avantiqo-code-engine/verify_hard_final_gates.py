"""Zero-cost proof that the three 7/10 escapes are now public machine-gate failures."""

from __future__ import annotations

import json

import modal_code_hard_owned_cert as hard
import modal_code_hard_owned_cert_final as final  # noqa: F401 - installs stronger probes


def _task(case_id: str) -> dict[str, str]:
    return next(item for item in hard.HARD_TASKS if item["id"] == case_id)


def _gate(case_id: str, source: str) -> dict:
    task = _task(case_id)
    raw = json.dumps({"path": task["module"], "content": source}, separators=(",", ":"))
    return hard._machine_gate(task, raw)


def main() -> None:
    # Exact behavioral defect from run 33700360729: invalid stock creates BAD:0.
    bad_inventory = r'''export function reserveInventory(stock, requests) {
  const remaining = {};
  for (const [rawKey, rawQty] of Object.entries(stock || {})) {
    const sku = String(rawKey).trim().toUpperCase();
    const qty = Number(rawQty);
    remaining[sku] = (remaining[sku] || 0) + (Number.isFinite(qty) && qty >= 0 ? qty : 0);
  }
  const allocations = [];
  for (const r of requests || []) {
    if (!r) continue;
    const sku = String(r.sku || '').trim().toUpperCase();
    const requested = Number(r.quantity);
    if (!sku || !Number.isFinite(requested) || requested <= 0) continue;
    const allocated = Math.min(requested, remaining[sku] || 0);
    if (allocated <= 0) continue;
    remaining[sku] -= allocated;
    allocations.push({sku, requested, allocated});
  }
  return {remaining, allocations};
}'''

    # Exact behavioral defect: valid normal state, but null/undefined state crashes.
    bad_events = r'''export function applyAccountEvents(state, events) {
  let balance = Number(state.balance);
  if (!Number.isFinite(balance)) balance = 0;
  const appliedIds = Array.isArray(state.appliedIds) ? [...state.appliedIds] : [];
  const seen = new Set(appliedIds.map(x => String(x).trim()));
  for (const e of events || []) {
    if (!e) continue;
    const id = String(e.id || '').trim();
    const type = String(e.type || '').trim().toUpperCase();
    const amount = Number(e.amount);
    if (!id || seen.has(id) || !Number.isFinite(amount) || amount <= 0) continue;
    if (type === 'DEPOSIT') balance += amount;
    else if (type === 'WITHDRAWAL' && balance >= amount) balance -= amount;
    else continue;
    seen.add(id); appliedIds.push(id);
  }
  return {balance:Number(balance.toFixed(2)), appliedIds};
}'''

    # Exact behavioral defect: transition lookup can be undefined then .includes crashes.
    bad_transition = r'''export function canTransition(current, next, role) {
  const c = current?.trim().toUpperCase();
  const n = next?.trim().toUpperCase();
  const r = role?.trim().toUpperCase();
  const allowed = {
    DRAFT:{SUBMITTED:['MEMBER','ADMIN']},
    SUBMITTED:{APPROVED:['ADMIN'],REJECTED:['ADMIN']},
    APPROVED:{POSTED:['FINANCE','ADMIN']},
    REJECTED:{DRAFT:['MEMBER','ADMIN']},
    POSTED:{}
  };
  if (c === n) return false;
  return allowed[c][n].includes(r);
}'''

    inventory_gate = _gate("inventory_reservation", bad_inventory)
    events_gate = _gate("idempotent_event_apply", bad_events)
    transition_gate = _gate("governed_state_transition", bad_transition)

    assert inventory_gate["passed"] is False, inventory_gate
    assert "SEMANTIC_CONTRACT_FAILED" in str(inventory_gate.get("failure") or ""), inventory_gate
    assert events_gate["passed"] is False, events_gate
    assert "SEMANTIC_CONTRACT_FAILED" in str(events_gate.get("failure") or ""), events_gate
    assert transition_gate["passed"] is False, transition_gate
    assert "SEMANTIC_CONTRACT_FAILED" in str(transition_gate.get("failure") or ""), transition_gate

    assert final.MAX_COMPLETION_TOKENS == 800
    assert final.COMPACT_TARGET_TOKENS == 650
    assert final._summary_is_certified({
        "cases":10,"passed":7,"hidden_tests_passed":7,
        "instruction_format_passed":10,"security_boundary_passed":10,
        "machine_gate_passed":True,"warm_container_reused":True,
        "warm_latency_passed":False,"warm_max_ms":5225,
        "persistent_model_storage":True,"model_storage_ready":True,
        "model_storage_reused":True,"production_deploy_performed":False,
    }) is False

    print("AVANTIQO_CODE_ESCAPED_INVENTORY_GATE=PASS")
    print("AVANTIQO_CODE_ESCAPED_IDEMPOTENCY_GATE=PASS")
    print("AVANTIQO_CODE_ESCAPED_TRANSITION_GATE=PASS")
    print("AVANTIQO_CODE_FALSE_PASS_MARKER_GATE=PASS")
    print("AVANTIQO_CODE_FINAL_ZERO_COST_GATES=PASS")


if __name__ == "__main__":
    main()
