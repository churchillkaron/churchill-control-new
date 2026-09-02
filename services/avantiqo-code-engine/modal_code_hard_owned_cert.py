"""Harder owned-only Avantiqo Code executable certification.

This suite is deliberately more demanding than the original six-case smoke
benchmark. It exercises multi-condition ERP/business invariants while preserving
all existing certification safeguards:

- one persistent pinned Qwen3-Coder 30B FP8 model store,
- one H100 runtime session,
- deterministic visible + declared semantic machine gates,
- at most one repair call per failing case,
- sealed hidden Node tests only after machine acceptance,
- no AI judge and no production deployment.
"""

from __future__ import annotations

import json
import os
import time
import uuid
from pathlib import Path
from typing import Any

import modal_persistent_owned_cert as cert
import modal_persistent_owned_cert_repair as repair_policy  # noqa: F401 - patches repair policy

app = cert.app
base = cert.verified.base
verified = cert.verified

CONTRACT = "AVANTIQO_CODE_HARD_EXECUTABLE_GATE_CERT_V1"
OUTPUT_PATH = Path("artifacts/avantiqo-code-hard-executable-gate-cert.json")
WARM_LATENCY_TARGET_MS = 4000

HARD_TASKS: list[dict[str, str]] = [
    {
        "id": "money_line_total",
        "module": "line-total.mjs",
        "spec": "Implement lineTotal(input). Accept finite numbers or numeric strings for unitPrice, quantity, discountRate and taxRate. unitPrice and quantity must be >= 0; discountRate and taxRate must be in [0,1]. Invalid input throws TypeError. Compute unitPrice * quantity * (1-discountRate) * (1+taxRate), rounded to two decimals. Do not mutate input.",
        "source": '''export function lineTotal(input) {\n  const subtotal = input.unitPrice * input.quantity;\n  return Number((subtotal + input.discountRate + input.taxRate).toFixed(2));\n}\n''',
        "visible_test": '''import assert from "node:assert/strict";\nimport { lineTotal } from "./line-total.mjs";\nassert.equal(lineTotal({ unitPrice: 100, quantity: 2, discountRate: 0.1, taxRate: 0.07 }), 192.6);\n''',
        "hidden_test": '''import assert from "node:assert/strict";\nimport { lineTotal } from "./line-total.mjs";\nconst row = { unitPrice: "19.99", quantity: "3", discountRate: "0.05", taxRate: "0.075" };\nconst before = JSON.stringify(row);\nassert.equal(lineTotal(row), 61.26);\nassert.equal(JSON.stringify(row), before);\nassert.equal(lineTotal({ unitPrice: 0, quantity: 8, discountRate: 0.5, taxRate: 0.2 }), 0);\nassert.throws(() => lineTotal({ unitPrice: -1, quantity: 1, discountRate: 0, taxRate: 0 }), TypeError);\nassert.throws(() => lineTotal({ unitPrice: 1, quantity: 1, discountRate: 1.1, taxRate: 0 }), TypeError);\nassert.throws(() => lineTotal(null), TypeError);\n''',
    },
    {
        "id": "ledger_currency_summary",
        "module": "ledger-summary.mjs",
        "spec": "Implement summarizeLedger(entries). Return an object keyed by canonical currency (trim + uppercase). Each value is {debit, credit, balance}, where balance=debit-credit. side is case-insensitive DEBIT/CREDIT. amount may be a finite number or numeric string and must be >=0. Skip malformed entries, blank currencies, unsupported sides and non-finite/negative amounts. Round each returned number to two decimals. Never mutate input. null returns {}.",
        "source": '''export function summarizeLedger(entries) {\n  const out = {};\n  for (const e of entries) {\n    out[e.currency] ||= { debit: 0, credit: 0, balance: 0 };\n    out[e.currency][e.side] += e.amount;\n    out[e.currency].balance = out[e.currency].debit - out[e.currency].credit;\n  }\n  return out;\n}\n''',
        "visible_test": '''import assert from "node:assert/strict";\nimport { summarizeLedger } from "./ledger-summary.mjs";\nassert.deepEqual(summarizeLedger([{ currency: " thb ", side: "debit", amount: "10" }, { currency: "THB", side: "CREDIT", amount: 2.5 }]), { THB: { debit: 10, credit: 2.5, balance: 7.5 } });\n''',
        "hidden_test": '''import assert from "node:assert/strict";\nimport { summarizeLedger } from "./ledger-summary.mjs";\nconst rows = [{ currency: "usd", side: "DEBIT", amount: "4.125" }, { currency: " USD ", side: "credit", amount: "1.005" }, { currency: "", side: "debit", amount: 99 }, { currency: "USD", side: "other", amount: 7 }, { currency: "USD", side: "debit", amount: Infinity }, null];\nconst before = JSON.stringify(rows);\nassert.deepEqual(summarizeLedger(rows), { USD: { debit: 4.13, credit: 1, balance: 3.12 } });\nassert.equal(JSON.stringify(rows), before);\nassert.deepEqual(summarizeLedger(null), {});\n''',
    },
    {
        "id": "authorization_precedence",
        "module": "manage-access.mjs",
        "spec": "Implement canManage(user, resource) and always return a boolean. Missing user/resource, user.disabled===true, or resource.archived===true always denies. A non-disabled superadmin may manage any non-archived resource. An admin may manage only resources in the same organization. A member may manage only a same-organization resource whose ownerId equals user.id. All other roles deny. Deny rules override allow rules.",
        "source": '''export function canManage(user, resource) {\n  return user.role === "superadmin" || user.role === "admin" && user.organizationId === resource.organizationId || user.id === resource.ownerId && !user.disabled;\n}\n''',
        "visible_test": '''import assert from "node:assert/strict";\nimport { canManage } from "./manage-access.mjs";\nassert.equal(canManage({ id: "u1", role: "admin", organizationId: "o1", disabled: true }, { ownerId: "u1", organizationId: "o1", archived: false }), false);\nassert.equal(canManage({ id: "u1", role: "member", organizationId: "o1" }, { ownerId: "u1", organizationId: "o1", archived: false }), true);\n''',
        "hidden_test": '''import assert from "node:assert/strict";\nimport { canManage } from "./manage-access.mjs";\nassert.equal(canManage(null, {}), false);\nassert.equal(canManage({ id: "s", role: "superadmin", organizationId: "x" }, { ownerId: "z", organizationId: "y", archived: false }), true);\nassert.equal(canManage({ id: "s", role: "superadmin", disabled: false }, { archived: true }), false);\nassert.equal(canManage({ id: "a", role: "admin", organizationId: "o1" }, { ownerId: "x", organizationId: "o2", archived: false }), false);\nassert.equal(canManage({ id: "m", role: "member", organizationId: "o1" }, { ownerId: "m", organizationId: "o2", archived: false }), false);\nassert.equal(canManage({ id: "m", role: "guest", organizationId: "o1" }, { ownerId: "m", organizationId: "o1", archived: false }), false);\n''',
    },
    {
        "id": "inventory_reservation",
        "module": "reserve-inventory.mjs",
        "spec": "Implement reserveInventory(stock, requests). Canonicalize SKU by trim + uppercase. stock is an object of available quantities; merge differently formatted stock keys into one canonical SKU, accepting only finite non-negative numeric/numeric-string quantities. Process request rows in order. A request is valid only with nonblank SKU and finite quantity >0. Allocate min(requested, remaining), never below zero, and omit requests that allocate zero. Return {remaining, allocations}; allocations are {sku, requested, allocated} in request order. Never mutate stock or requests. Missing inputs behave as empty.",
        "source": '''export function reserveInventory(stock, requests) {\n  const allocations = [];\n  for (const r of requests) {\n    stock[r.sku] -= r.quantity;\n    allocations.push({ sku: r.sku, requested: r.quantity, allocated: r.quantity });\n  }\n  return { remaining: stock, allocations };\n}\n''',
        "visible_test": '''import assert from "node:assert/strict";\nimport { reserveInventory } from "./reserve-inventory.mjs";\nassert.deepEqual(reserveInventory({ " sku-1 ": 5 }, [{ sku: "SKU-1", quantity: 3 }, { sku: "sku-1", quantity: 4 }]), { remaining: { "SKU-1": 0 }, allocations: [{ sku: "SKU-1", requested: 3, allocated: 3 }, { sku: "SKU-1", requested: 4, allocated: 2 }] });\n''',
        "hidden_test": '''import assert from "node:assert/strict";\nimport { reserveInventory } from "./reserve-inventory.mjs";\nconst stock = { a: "2", " A ": 1, bad: "oops", zero: 0 };\nconst requests = [{ sku: "a", quantity: "2.5" }, { sku: " A ", quantity: 2 }, { sku: "bad", quantity: 1 }, { sku: "", quantity: 4 }, null];\nconst stockBefore = JSON.stringify(stock); const reqBefore = JSON.stringify(requests);\nassert.deepEqual(reserveInventory(stock, requests), { remaining: { A: 0, ZERO: 0 }, allocations: [{ sku: "A", requested: 2.5, allocated: 2.5 }, { sku: "A", requested: 2, allocated: 0.5 }] });\nassert.equal(JSON.stringify(stock), stockBefore);\nassert.equal(JSON.stringify(requests), reqBefore);\nassert.deepEqual(reserveInventory(null, null), { remaining: {}, allocations: [] });\n''',
    },
    {
        "id": "idempotent_event_apply",
        "module": "account-events.mjs",
        "spec": "Implement applyAccountEvents(state, events). state has balance and appliedIds. Normalize balance and amounts from finite numeric/numeric-string values; invalid state balance becomes 0. Event id is trim string and must be nonblank. Event type is case-insensitive DEPOSIT or WITHDRAWAL. Ignore malformed events and duplicate ids, including ids already applied. Deposits add positive finite amounts. Withdrawals subtract positive finite amounts only when sufficient balance exists; a rejected overdraft is NOT marked applied. Return a new {balance, appliedIds}; preserve prior appliedIds in order and append newly applied canonical ids in event order. Never mutate inputs. Round balance to two decimals.",
        "source": '''export function applyAccountEvents(state, events) {\n  for (const event of events) {\n    if (event.type === "deposit") state.balance += event.amount;\n    else state.balance -= event.amount;\n    state.appliedIds.push(event.id);\n  }\n  return state;\n}\n''',
        "visible_test": '''import assert from "node:assert/strict";\nimport { applyAccountEvents } from "./account-events.mjs";\nassert.deepEqual(applyAccountEvents({ balance: 10, appliedIds: [] }, [{ id: "e1", type: "deposit", amount: 5 }, { id: "e1", type: "deposit", amount: 5 }, { id: "e2", type: "withdrawal", amount: 20 }]), { balance: 15, appliedIds: ["e1"] });\n''',
        "hidden_test": '''import assert from "node:assert/strict";\nimport { applyAccountEvents } from "./account-events.mjs";\nconst state = { balance: "10.25", appliedIds: ["old"] };\nconst events = [{ id: " old ", type: "deposit", amount: 99 }, { id: " d1 ", type: "DEPOSIT", amount: "1.255" }, { id: "w1", type: "withdrawal", amount: "4.5" }, { id: "w2", type: "withdrawal", amount: 100 }, { id: "x", type: "other", amount: 2 }, null];\nconst sb=JSON.stringify(state), eb=JSON.stringify(events);\nassert.deepEqual(applyAccountEvents(state, events), { balance: 7.01, appliedIds: ["old", "d1", "w1"] });\nassert.equal(JSON.stringify(state), sb); assert.equal(JSON.stringify(events), eb);\nassert.deepEqual(applyAccountEvents(null, null), { balance: 0, appliedIds: [] });\n''',
    },
    {
        "id": "governed_state_transition",
        "module": "state-transition.mjs",
        "spec": "Implement canTransition(current, next, role). Normalize all strings with trim + uppercase. Unknown states/roles and same-state transitions return false. Allowed transitions: DRAFT->SUBMITTED for MEMBER or ADMIN; SUBMITTED->APPROVED or REJECTED for ADMIN only; APPROVED->POSTED for FINANCE or ADMIN; REJECTED->DRAFT for MEMBER or ADMIN. POSTED is terminal. Always return boolean.",
        "source": '''export function canTransition(current, next, role) {\n  return current !== next && role !== "guest";\n}\n''',
        "visible_test": '''import assert from "node:assert/strict";\nimport { canTransition } from "./state-transition.mjs";\nassert.equal(canTransition(" draft ", "submitted", "member"), true);\nassert.equal(canTransition("submitted", "approved", "member"), false);\nassert.equal(canTransition("posted", "draft", "admin"), false);\n''',
        "hidden_test": '''import assert from "node:assert/strict";\nimport { canTransition } from "./state-transition.mjs";\nassert.equal(canTransition("SUBMITTED", "REJECTED", "ADMIN"), true);\nassert.equal(canTransition("APPROVED", "POSTED", "finance"), true);\nassert.equal(canTransition("APPROVED", "POSTED", "member"), false);\nassert.equal(canTransition("REJECTED", "DRAFT", "member"), true);\nassert.equal(canTransition("DRAFT", "DRAFT", "admin"), false);\nassert.equal(canTransition("BOGUS", "DRAFT", "admin"), false);\nassert.equal(canTransition(null, "DRAFT", "admin"), false);\n''',
    },
    {
        "id": "one_to_one_reconciliation",
        "module": "reconcile.mjs",
        "spec": "Implement matchTransactions(bankRows, ledgerRows). A row is matchable only if id is nonblank, reference canonicalizes to nonblank trim+uppercase, and amount converts to a finite number. Compare amounts at integer cents using two-decimal rounding. Process bank rows in input order. Match each bank row to the earliest ledger row with the same canonical reference and cents amount that has not already been used. Return [{bankId, ledgerId}] and never mutate inputs. Invalid/missing arrays behave as empty.",
        "source": '''export function matchTransactions(bankRows, ledgerRows) {\n  return bankRows.map(b => {\n    const l = ledgerRows.find(x => x.reference === b.reference && x.amount === b.amount);\n    return l ? { bankId: b.id, ledgerId: l.id } : null;\n  }).filter(Boolean);\n}\n''',
        "visible_test": '''import assert from "node:assert/strict";\nimport { matchTransactions } from "./reconcile.mjs";\nassert.deepEqual(matchTransactions([{ id: "b1", reference: " inv-1 ", amount: "10" }, { id: "b2", reference: "INV-1", amount: 10 }], [{ id: "l1", reference: "inv-1", amount: 10 }]), [{ bankId: "b1", ledgerId: "l1" }]);\n''',
        "hidden_test": '''import assert from "node:assert/strict";\nimport { matchTransactions } from "./reconcile.mjs";\nconst bank=[{id:"b1",reference:"x",amount:"1.005"},{id:"b2",reference:" X ",amount:2},{id:"b3",reference:"",amount:2},null];\nconst ledger=[{id:"l1",reference:" X ",amount:1.01},{id:"l2",reference:"x",amount:"2.00"},{id:"l3",reference:"x",amount:2}];\nconst bb=JSON.stringify(bank), lb=JSON.stringify(ledger);\nassert.deepEqual(matchTransactions(bank, ledger), [{bankId:"b1",ledgerId:"l1"},{bankId:"b2",ledgerId:"l2"}]);\nassert.equal(JSON.stringify(bank),bb); assert.equal(JSON.stringify(ledger),lb);\nassert.deepEqual(matchTransactions(null, ledger), []);\n''',
    },
    {
        "id": "canonical_contact_dedupe",
        "module": "contacts.mjs",
        "spec": "Implement dedupeContacts(contacts). Valid rows require a nonblank email after trim+lowercase. Deduplicate by that canonical email. Preserve the first valid row for each email, preserving its other enumerable fields, but replace email with the canonical value. Do not mutate input rows/array. Preserve first-occurrence order. Missing input returns [].",
        "source": '''export function dedupeContacts(contacts) {\n  const seen = new Set();\n  return contacts.filter(c => {\n    if (seen.has(c.email)) return false;\n    seen.add(c.email);\n    c.email = c.email.toLowerCase();\n    return true;\n  });\n}\n''',
        "visible_test": '''import assert from "node:assert/strict";\nimport { dedupeContacts } from "./contacts.mjs";\nassert.deepEqual(dedupeContacts([{ id: 1, email: " A@B.COM " }, { id: 2, email: "a@b.com" }]), [{ id: 1, email: "a@b.com" }]);\n''',
        "hidden_test": '''import assert from "node:assert/strict";\nimport { dedupeContacts } from "./contacts.mjs";\nconst rows=[{id:1,name:"A",email:" X@Y.COM "},{id:2,email:"x@y.com"},{id:3,email:"   "},null,{id:4,email:"Z@Q.com"}];\nconst before=JSON.stringify(rows);\nassert.deepEqual(dedupeContacts(rows), [{id:1,name:"A",email:"x@y.com"},{id:4,email:"z@q.com"}]);\nassert.equal(JSON.stringify(rows),before);\nassert.deepEqual(dedupeContacts(null),[]);\n''',
    },
    {
        "id": "progressive_tier_pricing",
        "module": "tier-pricing.mjs",
        "spec": "Implement calculateCharge(units, tiers). units must convert to a finite number >=0 or throw TypeError. tiers must be a nonempty array ordered by strictly increasing finite positive upTo thresholds, followed optionally by exactly one final open-ended tier whose upTo is null. Each rate must convert to finite >=0 or throw TypeError. Pricing is progressive: each tier rate applies only to units in that tier. If units exceed the last finite tier and there is no open-ended tier, throw RangeError. Round final charge to two decimals. Never mutate tiers.",
        "source": '''export function calculateCharge(units, tiers) {\n  const tier = tiers.find(t => t.upTo == null || units <= t.upTo) || tiers.at(-1);\n  return Number((units * tier.rate).toFixed(2));\n}\n''',
        "visible_test": '''import assert from "node:assert/strict";\nimport { calculateCharge } from "./tier-pricing.mjs";\nassert.equal(calculateCharge(150, [{ upTo: 100, rate: 1 }, { upTo: null, rate: 0.8 }]), 140);\n''',
        "hidden_test": '''import assert from "node:assert/strict";\nimport { calculateCharge } from "./tier-pricing.mjs";\nconst tiers=[{upTo:100,rate:"1.2"},{upTo:200,rate:1},{upTo:null,rate:"0.5"}]; const before=JSON.stringify(tiers);\nassert.equal(calculateCharge("0",tiers),0);\nassert.equal(calculateCharge(50,tiers),60);\nassert.equal(calculateCharge(250,tiers),245);\nassert.equal(JSON.stringify(tiers),before);\nassert.throws(() => calculateCharge(-1,tiers),TypeError);\nassert.throws(() => calculateCharge(10,[{upTo:100,rate:1},{upTo:50,rate:1}]),TypeError);\nassert.throws(() => calculateCharge(150,[{upTo:100,rate:1}]),RangeError);\n''',
    },
    {
        "id": "conflict_safe_order_merge",
        "module": "merge-order-lines.mjs",
        "spec": "Implement mergeOrderLines(lines). Valid rows require a nonblank canonical SKU (trim+uppercase), quantity converting to finite >0, and unitPrice converting to finite >=0. Ignore malformed rows. Merge valid duplicate SKUs by summing quantity. All valid rows for the same canonical SKU must have the same numeric unitPrice; otherwise throw RangeError and do not mutate input. Return [{sku, quantity, unitPrice}] in first-valid-occurrence order, with quantity and unitPrice as numbers. Missing input returns [].",
        "source": '''export function mergeOrderLines(lines) {\n  const bySku = {};\n  for (const line of lines) {\n    bySku[line.sku] ||= { ...line };\n    bySku[line.sku].quantity += line.quantity;\n  }\n  return Object.values(bySku);\n}\n''',
        "visible_test": '''import assert from "node:assert/strict";\nimport { mergeOrderLines } from "./merge-order-lines.mjs";\nassert.deepEqual(mergeOrderLines([{ sku: " abc ", quantity: "2", unitPrice: "5" }, { sku: "ABC", quantity: 3, unitPrice: 5 }]), [{ sku: "ABC", quantity: 5, unitPrice: 5 }]);\n''',
        "hidden_test": '''import assert from "node:assert/strict";\nimport { mergeOrderLines } from "./merge-order-lines.mjs";\nconst rows=[{sku:"b",quantity:1,unitPrice:2},{sku:" A ",quantity:"1.5",unitPrice:"3"},{sku:"a",quantity:2.5,unitPrice:3},{sku:"",quantity:9,unitPrice:1},null,{sku:"c",quantity:0,unitPrice:1}]; const before=JSON.stringify(rows);\nassert.deepEqual(mergeOrderLines(rows),[{sku:"B",quantity:1,unitPrice:2},{sku:"A",quantity:4,unitPrice:3}]);\nassert.equal(JSON.stringify(rows),before);\nassert.deepEqual(mergeOrderLines(null),[]);\nassert.throws(() => mergeOrderLines([{sku:"x",quantity:1,unitPrice:2},{sku:" X ",quantity:1,unitPrice:3}]),RangeError);\n''',
    },
]

HARD_PROBES: dict[str, str] = {
    "money_line_total": '''import assert from "node:assert/strict";\nimport { lineTotal } from "./line-total.mjs";\nassert.equal(lineTotal({unitPrice:"12.5",quantity:"2",discountRate:"0.2",taxRate:"0.1"}),22);\nassert.throws(() => lineTotal({unitPrice:1,quantity:1,discountRate:0,taxRate:Infinity}),TypeError);\n''',
    "ledger_currency_summary": '''import assert from "node:assert/strict";\nimport { summarizeLedger } from "./ledger-summary.mjs";\nconst rows=[{currency:" thb ",side:"DEBIT",amount:"5"},{currency:"THB",side:"credit",amount:"2"},{currency:"THB",side:"debit",amount:"bad"},null]; const before=JSON.stringify(rows);\nassert.deepEqual(summarizeLedger(rows),{THB:{debit:5,credit:2,balance:3}}); assert.equal(JSON.stringify(rows),before);\n''',
    "authorization_precedence": '''import assert from "node:assert/strict";\nimport { canManage } from "./manage-access.mjs";\nassert.equal(canManage({id:"s",role:"superadmin",disabled:true},{archived:false}),false);\nassert.equal(canManage({id:"a",role:"admin",organizationId:"1"},{organizationId:"2",archived:false}),false);\nassert.equal(canManage(undefined,undefined),false);\n''',
    "inventory_reservation": '''import assert from "node:assert/strict";\nimport { reserveInventory } from "./reserve-inventory.mjs";\nconst stock={x:2," X ":1}; const req=[{sku:"x",quantity:2},{sku:"X",quantity:2}]; const sb=JSON.stringify(stock),rb=JSON.stringify(req);\nassert.deepEqual(reserveInventory(stock,req),{remaining:{X:0},allocations:[{sku:"X",requested:2,allocated:2},{sku:"X",requested:2,allocated:1}]}); assert.equal(JSON.stringify(stock),sb); assert.equal(JSON.stringify(req),rb);\n''',
    "idempotent_event_apply": '''import assert from "node:assert/strict";\nimport { applyAccountEvents } from "./account-events.mjs";\nassert.deepEqual(applyAccountEvents({balance:5,appliedIds:["a"]},[{id:" a ",type:"deposit",amount:9},{id:"b",type:"withdrawal",amount:6},{id:"c",type:"deposit",amount:"1.25"}]),{balance:6.25,appliedIds:["a","c"]});\n''',
    "governed_state_transition": '''import assert from "node:assert/strict";\nimport { canTransition } from "./state-transition.mjs";\nassert.equal(canTransition(" submitted ","APPROVED","admin"),true); assert.equal(canTransition("approved","posted","finance"),true); assert.equal(canTransition("posted","draft","admin"),false);\n''',
    "one_to_one_reconciliation": '''import assert from "node:assert/strict";\nimport { matchTransactions } from "./reconcile.mjs";\nassert.deepEqual(matchTransactions([{id:"b1",reference:" r ",amount:"2.00"},{id:"b2",reference:"R",amount:2}],[{id:"l1",reference:"r",amount:2}]),[{bankId:"b1",ledgerId:"l1"}]);\n''',
    "canonical_contact_dedupe": '''import assert from "node:assert/strict";\nimport { dedupeContacts } from "./contacts.mjs";\nconst rows=[{id:1,email:" A@B.COM "},{id:2,email:"a@b.com"},null]; const before=JSON.stringify(rows); assert.deepEqual(dedupeContacts(rows),[{id:1,email:"a@b.com"}]); assert.equal(JSON.stringify(rows),before);\n''',
    "progressive_tier_pricing": '''import assert from "node:assert/strict";\nimport { calculateCharge } from "./tier-pricing.mjs";\nassert.equal(calculateCharge(120,[{upTo:100,rate:2},{upTo:null,rate:1}]),220); assert.throws(()=>calculateCharge(101,[{upTo:100,rate:1}]),RangeError);\n''',
    "conflict_safe_order_merge": '''import assert from "node:assert/strict";\nimport { mergeOrderLines } from "./merge-order-lines.mjs";\nconst rows=[{sku:" a ",quantity:"1",unitPrice:"2"},{sku:"A",quantity:2,unitPrice:2}]; const before=JSON.stringify(rows); assert.deepEqual(mergeOrderLines(rows),[{sku:"A",quantity:3,unitPrice:2}]); assert.equal(JSON.stringify(rows),before); assert.throws(()=>mergeOrderLines([{sku:"x",quantity:1,unitPrice:1},{sku:"X",quantity:1,unitPrice:2}]),RangeError);\n''',
}


def _hard_prompt(task: dict[str, str], initial_failure: str) -> str:
    return "\n".join([
        "Repair this JavaScript module to satisfy the explicit production contract and visible test.",
        f'Return ONLY strict JSON with exactly this shape: {{"path":"{task["module"]}","content":"<complete UTF-8 source file>"}}.',
        "Do not use markdown fences or commentary outside the JSON object.",
        f'Modify only {task["module"]}. Keep all existing public export names.',
        "The module must be self-contained: no imports, environment access, filesystem, child processes, network calls, global state, or dynamic evaluation.",
        "PRODUCTION CONTRACT:", task["spec"],
        "BUGGY MODULE:", task["source"],
        "VISIBLE TEST:", task["visible_test"],
        "VISIBLE FAILURE:", initial_failure[-2500:],
    ])


def _owned_request(task: dict[str, str], prompt: str) -> dict[str, Any]:
    request = base._owned_request(task, prompt)
    request["usage_id"] = f"hard-cert-{task['id']}-{uuid.uuid4()}"
    spec = dict(request.get("structured_specification") or {})
    spec.update({
        "benchmark_contract": CONTRACT,
        "benchmark_difficulty": "advanced-erp-invariants",
        "production_contract": task["spec"],
    })
    request["structured_specification"] = spec
    return request


def _machine_gate(task: dict[str, str], raw: str) -> dict[str, Any]:
    started = time.perf_counter()
    parsed = base._parse_candidate(raw, task["module"])
    source = str(parsed.get("content") or "")
    if not parsed.get("valid") or not parsed.get("strict_json"):
        return {"passed": False, "gate_ms": round((time.perf_counter()-started)*1000), "failure": f"OUTPUT_CONTRACT_FAILED:{parsed.get('error') or 'STRICT_JSON_REQUIRED'}"}
    if not base._security_pass(source):
        return {"passed": False, "gate_ms": round((time.perf_counter()-started)*1000), "failure": "SECURITY_BOUNDARY_FAILED"}
    if source.strip() == task["source"].strip():
        return {"passed": False, "gate_ms": round((time.perf_counter()-started)*1000), "failure": "SOURCE_UNCHANGED"}
    visible = base._run_test(task["module"], source, task["visible_test"])
    if visible["exit_code"] != 0:
        failure = "VISIBLE_TEST_FAILED\n" + str(visible.get("stderr") or visible.get("stdout") or "")
        return {"passed": False, "gate_ms": round((time.perf_counter()-started)*1000), "failure": failure[-3000:]}
    probe = HARD_PROBES[task["id"]]
    contract = base._run_test(task["module"], source, probe)
    if contract["exit_code"] != 0:
        detail = str(contract.get("stderr") or contract.get("stdout") or "")
        failure = "\n".join(["SEMANTIC_CONTRACT_FAILED", "DECLARED_SEMANTIC_CONTRACT_PROBE:", probe.strip()[-1500:], "EXECUTION_FAILURE:", detail[-1300:]])
        return {"passed": False, "gate_ms": round((time.perf_counter()-started)*1000), "failure": failure[-3000:]}
    return {"passed": True, "gate_ms": round((time.perf_counter()-started)*1000), "failure": None}


def _usage_sum(*values: dict[str, Any]) -> dict[str, int]:
    return {
        "input_tokens": sum(int((value or {}).get("input_tokens") or 0) for value in values),
        "output_tokens": sum(int((value or {}).get("output_tokens") or 0) for value in values),
    }


@app.local_entrypoint(name="hard_owned_cert")
def hard_owned_cert() -> None:
    if base._text(os.environ.get("NODE_ENV")).lower() == "production":
        raise RuntimeError(f"{CONTRACT}_PRODUCTION_ENV_FORBIDDEN")
    model_storage = cert._ensure_persistent_model()
    if model_storage.get("model_storage_ready") is not True:
        raise RuntimeError(f"{CONTRACT}_PERSISTENT_MODEL_STORAGE_REQUIRED")

    prompts: list[tuple[dict[str, str], str]] = []
    for task in HARD_TASKS:
        initial = base._run_test(task["module"], task["source"], task["visible_test"])
        if initial["exit_code"] == 0:
            raise RuntimeError(f"{CONTRACT}_BROKEN_FIXTURE_MUST_FAIL:{task['id']}")
        prompts.append((task, _hard_prompt(task, f"{initial['stdout']}\n{initial['stderr']}")))

    requests = [_owned_request(task, prompt) for task, prompt in prompts]
    remote_started = time.perf_counter()
    first = cert.run_owned_cert_batch.remote(requests)
    first_remote_wall_ms = round((time.perf_counter()-remote_started)*1000)
    first_outputs = first.get("outputs") if isinstance(first, dict) else None
    if not isinstance(first_outputs, list) or len(first_outputs) != len(HARD_TASKS):
        raise RuntimeError(f"{CONTRACT}_FIRST_BATCH_OUTPUT_COUNT_INVALID")
    if first.get("production_deploy_performed") is not False or first.get("persistent_model_storage") is not True:
        raise RuntimeError(f"{CONTRACT}_RUNTIME_SAFEGUARD_FAILED")

    gates = [_machine_gate(task, base._text(output.get("result"))) for task, output in zip(HARD_TASKS, first_outputs, strict=True)]
    repair_indices = [i for i, gate in enumerate(gates) if gate.get("passed") is not True]
    repairs: dict[int, dict[str, Any]] = {}
    second: dict[str, Any] | None = None
    second_remote_wall_ms = 0

    if repair_indices:
        repair_requests = [cert._repair_request(requests[i], base._text(first_outputs[i].get("result")), str(gates[i].get("failure") or "MACHINE_GATE_FAILED")) for i in repair_indices]
        remote_started = time.perf_counter()
        second = cert.run_owned_cert_batch.remote(repair_requests)
        second_remote_wall_ms = round((time.perf_counter()-remote_started)*1000)
        second_outputs = second.get("outputs") if isinstance(second, dict) else None
        if not isinstance(second_outputs, list) or len(second_outputs) != len(repair_indices):
            raise RuntimeError(f"{CONTRACT}_REPAIR_BATCH_OUTPUT_COUNT_INVALID")
        if second.get("runtime_instance_id") != first.get("runtime_instance_id"):
            raise RuntimeError(f"{CONTRACT}_WARM_CONTAINER_REUSE_NOT_PROVEN")
        for i, output in zip(repair_indices, second_outputs, strict=True):
            repaired_gate = _machine_gate(HARD_TASKS[i], base._text(output.get("result")))
            if repaired_gate.get("passed") is not True:
                raise RuntimeError(f"{CONTRACT}_REPAIR_GATE_FAILED:{HARD_TASKS[i]['id']}:{repaired_gate.get('failure')}")
            repairs[i] = {"output": output, "gate": repaired_gate}

    results: list[dict[str, Any]] = []
    for i, (task, _prompt) in enumerate(prompts):
        draft = first_outputs[i]
        selected = repairs.get(i, {}).get("output") or draft
        cert._validate_identity(task, draft)
        if selected is not draft:
            cert._validate_identity(task, selected)
        repaired = i in repairs
        draft_usage = draft.get("usage") if isinstance(draft.get("usage"), dict) else {}
        selected_usage = selected.get("usage") if isinstance(selected.get("usage"), dict) else {}
        usage = _usage_sum(draft_usage, selected_usage) if repaired else _usage_sum(draft_usage)
        inference_ms = round(float(draft.get("case_elapsed_seconds") or 0)*1000)
        gate_ms = int(gates[i].get("gate_ms") or 0)
        if repaired:
            inference_ms += round(float(selected.get("case_elapsed_seconds") or 0)*1000)
            gate_ms += int(repairs[i]["gate"].get("gate_ms") or 0)
        scored = base._score(task, base._text(selected.get("result")), inference_ms + gate_ms, usage, None)
        scored.update({"repair_used": repaired, "machine_gate_passed": True, "machine_gate_ms": gate_ms, "inference_wall_ms": inference_ms, "initial_machine_failure": gates[i].get("failure") if repaired else None})
        results.append(scored)
        print("AVANTIQO_CODE_HARD_CASE=" + json.dumps(scored, separators=(",", ":")), flush=True)

    walls = [int(item.get("wall_ms") or 0) for item in results]
    total_gpu_seconds = float(first.get("scored_gpu_seconds") or 0) + float((second or {}).get("scored_gpu_seconds") or 0)
    owned_model_calls = int(first.get("model_calls") or 0) + int((second or {}).get("model_calls") or 0)
    warmup_model_calls = int(first.get("warmup_model_calls") or 0) + int((second or {}).get("warmup_model_calls") or 0)
    summary = base._summary(base.PRODUCT_MODEL, "avantiqo-code", results, total_gpu_seconds * base.MODAL_H100_USD_PER_SECOND)
    summary.update({
        "contract": CONTRACT,
        "difficulty": "advanced-erp-invariants",
        "repairs_used": len(repair_indices),
        "owned_model_calls": owned_model_calls,
        "warmup_model_calls": warmup_model_calls,
        "total_model_calls": owned_model_calls + warmup_model_calls,
        "owned_gpu_sessions": 1,
        "gpu_function_seconds": round(total_gpu_seconds,3),
        "first_remote_wall_ms": first_remote_wall_ms,
        "second_remote_wall_ms": second_remote_wall_ms,
        "engine_prepare_ms": int(first.get("engine_prepare_ms") or 0),
        "warm_container_reused": second is None or second.get("runtime_instance_id") == first.get("runtime_instance_id"),
        "warm_latency_target_ms": WARM_LATENCY_TARGET_MS,
        "warm_latency_passed": all(v <= WARM_LATENCY_TARGET_MS for v in walls),
        "warm_max_ms": max(walls),
        "machine_gate_passed": all(item.get("machine_gate_passed") is True for item in results),
        "hidden_tests_sealed_until_final_scoring": True,
        "max_repair_calls_per_case": 1,
        "vllm_enforce_eager": False,
        "safetensors_load_strategy": first.get("safetensors_load_strategy"),
        "persistent_model_storage": True,
        "model_volume_name": cert.MODEL_VOLUME_NAME,
        "model_revision": cert.MODEL_REVISION,
        "model_storage_ready": model_storage.get("model_storage_ready") is True,
        "model_storage_reused": model_storage.get("model_storage_reused") is True,
        "model_bootstrapped_this_run": model_storage.get("model_bootstrapped_this_run") is True,
        "vllm_cache_root": first.get("vllm_cache_root"),
        "production_deploy_performed": False,
    })
    report = {
        "contract": CONTRACT,
        "generated_at_epoch_ms": int(time.time()*1000),
        "summary": summary,
        "results": results,
        "model_storage": model_storage,
        "methodology": {
            "cases": len(HARD_TASKS),
            "difficulty": "advanced-erp-invariants",
            "explicit_production_contract_per_case": True,
            "visible_tests_executed_before_acceptance": True,
            "semantic_contract_probes_executed_before_acceptance": True,
            "repair_only_after_machine_failure": True,
            "max_repair_calls_per_case": 1,
            "hidden_tests_sealed_until_final_scoring": True,
            "ai_judge_used": False,
            "persistent_model_volume": True,
            "runtime_image_contains_model_weights": False,
            "source_mounts_copy_into_runtime_image": False,
            "production_deploy_performed": False,
        },
    }
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(json.dumps(report, indent=2)+"\n", encoding="utf-8")
    print("AVANTIQO_CODE_HARD_SUMMARY=" + json.dumps(summary, separators=(",", ":")), flush=True)
    print(f"{CONTRACT}=PASS", flush=True)
