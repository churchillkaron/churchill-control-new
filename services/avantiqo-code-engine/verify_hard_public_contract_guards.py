"""Zero-cost regression proof for hard Code public-contract guards."""

from __future__ import annotations

import json

import modal_code_hard_owned_cert as hard
import modal_code_hard_service as service


def _task(case_id: str) -> dict[str, str]:
    return next(item for item in hard.HARD_TASKS if item["id"] == case_id)


def _guarded(case_id: str, source: str) -> tuple[dict, dict]:
    task = _task(case_id)
    raw = json.dumps({"path": task["module"], "content": source}, separators=(",", ":"))
    before = hard._machine_gate(task, raw)
    request = {
        "structured_specification": {
            "machine_verification_repair": True,
            "production_contract": task["spec"],
        }
    }
    guarded = service._public_contract_guard(request, {"result": raw})
    after = hard._machine_gate(task, str(guarded["result"]))
    return before, after


def main() -> None:
    inventory = r'''export function reserveInventory(stock, requests) {
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
}'''

    progressive = r'''export function calculateCharge(units, tiers) {
  const unitsNum = Number(units);
  if (!Number.isFinite(unitsNum) || unitsNum < 0) throw new TypeError('units');
  if (!Array.isArray(tiers) || tiers.length === 0) throw new TypeError('tiers');
  let lastUpTo = -1;
  for (let i = 0; i < tiers.length; i++) {
    const tier = tiers[i];
    if (tier === null || tier === undefined) throw new TypeError('tier');
    const upTo = tier.upTo;
    if (upTo !== null && upTo !== undefined) {
      const upToNum = Number(upTo);
      if (!Number.isFinite(upToNum) || upToNum <= 0) throw new TypeError('upTo');
      if (upToNum <= lastUpTo) throw new TypeError('order');
      lastUpTo = upToNum;
    } else if (i !== tiers.length - 1) throw new TypeError('open-ended');
    const rateNum = Number(tier.rate);
    if (!Number.isFinite(rateNum) || rateNum < 0) throw new TypeError('rate');
  }
  let charge = 0;
  let remainingUnits = unitsNum;
  let lastUpToThreshold = 0;
  for (let i = 0; i < tiers.length; i++) {
    const tier = tiers[i];
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
}'''

    ledger = r'''export function summarizeLedger(entries) {
  if (entries === null || entries === undefined) return {};
  const result = {};
  for (const entry of entries) {
    if (!entry || typeof entry !== 'object') continue;
    const currency = entry.currency;
    if (currency === null || currency === undefined) continue;
    const canonical = String(currency).trim().toUpperCase();
    if (canonical === '') continue;
    const side = String(entry.side).toUpperCase();
    if (side !== 'DEBIT' && side !== 'CREDIT') continue;
    const num = Number(entry.amount);
    if (isNaN(num) || !isFinite(num) || num < 0) continue;
    if (!result[canonical]) result[canonical] = { debit: 0, credit: 0 };
    const acc = result[canonical];
    if (side === 'DEBIT') acc.debit += num;
    else acc.credit += num;
  }
  for (const key in result) {
    const acc = result[key];
    acc.debit = Number(acc.debit.toFixed(2));
    acc.credit = Number(acc.credit.toFixed(2));
    acc.balance = Number((acc.debit - acc.credit).toFixed(2));
  }
  return result;
}'''

    inventory_before, inventory_after = _guarded("inventory_reservation", inventory)
    assert inventory_before["passed"] is False, inventory_before
    assert inventory_after["passed"] is True, inventory_after

    tier_before, tier_after = _guarded("progressive_tier_pricing", progressive)
    assert tier_before["passed"] is False, tier_before
    assert tier_after["passed"] is True, tier_after

    ledger_before, ledger_after = _guarded("ledger_currency_summary", ledger)
    assert ledger_before["passed"] is False, ledger_before
    assert ledger_after["passed"] is True, ledger_after

    print("AVANTIQO_CODE_INVENTORY_EXACT_REGRESSION=PASS")
    print("AVANTIQO_CODE_PROGRESSIVE_TIER_EXACT_REGRESSION=PASS")
    print("AVANTIQO_CODE_LEDGER_RAW_BALANCE_EXACT_REGRESSION=PASS")
    print("AVANTIQO_CODE_PUBLIC_CONTRACT_GUARDS_ZERO_COST=PASS")


if __name__ == "__main__":
    main()
