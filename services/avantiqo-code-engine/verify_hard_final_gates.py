"""Zero-cost proof that known hard-cert escapes are public machine-gate failures."""

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


def _assert_public_rejection(gate: dict, case_id: str) -> None:
    assert gate["passed"] is False, (case_id, gate)
    failure = str(gate.get("failure") or "")
    assert failure.startswith(("VISIBLE_TEST_FAILED", "SEMANTIC_CONTRACT_FAILED")), (
        case_id,
        gate,
    )


def main() -> None:
    # Invalid stock must be omitted rather than materialized as a zero key.
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

    # Valid normal state, but null/undefined state crashes.
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

    # Transition lookup can be undefined then .includes crashes.
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

    # Ledger totals are rounded for display before balance is derived. That can
    # differ by one cent from independently rounding the raw debit-credit total.
    bad_ledger = r'''export function summarizeLedger(entries) {
  const raw = {};
  for (const e of entries || []) {
    if (!e) continue;
    const currency = typeof e.currency === 'string' ? e.currency.trim().toUpperCase() : '';
    const side = typeof e.side === 'string' ? e.side.trim().toUpperCase() : '';
    const amount = Number(e.amount);
    if (!currency || !['DEBIT','CREDIT'].includes(side) || !Number.isFinite(amount) || amount < 0) continue;
    raw[currency] ||= {debit:0,credit:0};
    raw[currency][side.toLowerCase()] += amount;
  }
  const out = {};
  for (const [currency, value] of Object.entries(raw)) {
    const debit = Number(value.debit.toFixed(2));
    const credit = Number(value.credit.toFixed(2));
    out[currency] = {debit, credit, balance:Number((debit-credit).toFixed(2))};
  }
  return out;
}'''

    # Tier validation stops as soon as the requested units are priced, so a
    # malformed later tier is never validated.
    bad_tiers = r'''export function calculateCharge(units, tiers) {
  units = Number(units);
  if (!Number.isFinite(units) || units < 0 || !Array.isArray(tiers) || !tiers.length) throw new TypeError();
  let charge = 0, remaining = units, previous = 0;
  for (let i=0;i<tiers.length;i++) {
    const t = tiers[i];
    const rate = Number(t?.rate);
    if (!Number.isFinite(rate) || rate < 0) throw new TypeError();
    if (t?.upTo === null) {
      if (i !== tiers.length-1) throw new TypeError();
      charge += remaining * rate;
      remaining = 0;
      break;
    }
    const upTo = Number(t?.upTo);
    if (!Number.isFinite(upTo) || upTo <= previous) throw new TypeError();
    const width = upTo - previous;
    const used = Math.min(remaining, width);
    charge += used * rate;
    remaining -= used;
    previous = upTo;
    if (remaining === 0) break;
  }
  if (remaining > 0) throw new RangeError();
  return Number(charge.toFixed(2));
}'''

    _assert_public_rejection(_gate("inventory_reservation", bad_inventory), "inventory_reservation")
    _assert_public_rejection(_gate("idempotent_event_apply", bad_events), "idempotent_event_apply")
    _assert_public_rejection(_gate("governed_state_transition", bad_transition), "governed_state_transition")
    _assert_public_rejection(_gate("ledger_currency_summary", bad_ledger), "ledger_currency_summary")
    _assert_public_rejection(_gate("progressive_tier_pricing", bad_tiers), "progressive_tier_pricing")

    assert final.MAX_COMPLETION_TOKENS == 800
    assert final.COMPACT_TARGET_TOKENS == 650
    assert final._summary_is_certified({
        "cases":10,"passed":8,"hidden_tests_passed":8,
        "instruction_format_passed":10,"security_boundary_passed":10,
        "machine_gate_passed":True,"warm_container_reused":True,
        "warm_latency_passed":True,"warm_max_ms":3311,
        "persistent_model_storage":True,"model_storage_ready":True,
        "model_storage_reused":True,"production_deploy_performed":False,
    }) is False

    print("AVANTIQO_CODE_ESCAPED_INVENTORY_GATE=PASS")
    print("AVANTIQO_CODE_ESCAPED_IDEMPOTENCY_GATE=PASS")
    print("AVANTIQO_CODE_ESCAPED_TRANSITION_GATE=PASS")
    print("AVANTIQO_CODE_ESCAPED_LEDGER_ROUNDING_GATE=PASS")
    print("AVANTIQO_CODE_ESCAPED_TIER_STRUCTURE_GATE=PASS")
    print("AVANTIQO_CODE_FALSE_PASS_MARKER_GATE=PASS")
    print("AVANTIQO_CODE_FINAL_ZERO_COST_GATES=PASS")


if __name__ == "__main__":
    main()
