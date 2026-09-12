import assert from "node:assert/strict";
import test from "node:test";
import { assessCodeAIObservedContractCompatibility } from "../lib/code/runtime/CodeAIObservedContractGuardRuntime.js";

function read(path, content) { return { kind: "operation", action: "read", status: "completed", result: { file_path: path, content } }; }

test("guard rejects removing an exported symbol used by an observed caller", () => {
  const state = { evidence: [
    read("lib/orders/runtime.js", "export function settleOrder(){ return true; }"),
    read("lib/orders/service.js", 'import { settleOrder } from "./runtime.js"; export function settle(){ return settleOrder(); }'),
  ] };
  const result = assessCodeAIObservedContractCompatibility({ state, writes: [{ path: "lib/orders/runtime.js", content: "export function settleOrderV2(){ return true; }" }] });
  assert.equal(result.compatible, false);
  assert.equal(result.violations[0].symbol, "settleOrder");
});

test("guard accepts implementation changes that preserve observed exported contracts", () => {
  const state = { evidence: [
    read("lib/orders/runtime.js", "export function settleOrder(){ return true; }"),
    read("lib/orders/service.js", 'import { settleOrder } from "./runtime.js"; export function settle(){ return settleOrder(); }'),
  ] };
  const result = assessCodeAIObservedContractCompatibility({ state, writes: [{ path: "lib/orders/runtime.js", content: "export function settleOrder(){ return { ok: true }; }" }] });
  assert.equal(result.compatible, true);
  assert.ok(result.obligations.some((item) => item.kind === "OBSERVED_IMPORTED_SYMBOL" && item.symbol === "settleOrder"));
  assert.ok(result.obligations.some((item) => item.kind === "OBSERVED_CALL_ARITY" && item.symbol === "settleOrder"));
});

test("Next.js route handler method exports are preserved when current route source is observed", () => {
  const state = { evidence: [read("app/api/orders/route.js", "export async function GET(){ return Response.json({ok:true}); } export async function POST(){ return Response.json({ok:true}); }")] };
  const result = assessCodeAIObservedContractCompatibility({ state, writes: [{ path: "app/api/orders/route.js", content: "export async function GET(){ return Response.json({ok:true}); }" }] });
  assert.equal(result.compatible, false);
  assert.ok(result.violations.some((item) => item.kind === "NEXT_ROUTE_HANDLER_METHOD_REMOVED" && item.symbol === "POST"));
});

test("absence of observed contract evidence never invents an obligation", () => {
  const result = assessCodeAIObservedContractCompatibility({ state: {}, writes: [{ path: "lib/new.js", content: "export const value = 1;" }] });
  assert.equal(result.compatible, true);
  assert.equal(result.required, false);
  assert.equal(result.incomplete_evidence_is_not_compatibility_proof, true);
});

import { readFile } from "node:fs/promises";

test("mission runtime enforces observed contracts before workspace mutation", async () => {
  const source = await readFile("lib/code/runtime/CodeAIMissionRuntime.js", "utf8");
  const guard = source.indexOf("assertCodeAIObservedContractCompatibility({ state, writes: classified.writes })");
  const mutation = source.indexOf("workspace.applyFiles(classified.writes)");
  assert.ok(guard >= 0);
  assert.ok(mutation > guard);
});

test("guard rejects arity changes incompatible with an observed caller", () => {
  const state = { evidence: [
    read("lib/orders/runtime.js", "export function settleOrder(order, context){ return { id: order.id }; }"),
    read("lib/orders/service.js", 'import { settleOrder } from "./runtime.js"; export function settle(order, ctx){ return settleOrder(order, ctx); }'),
  ] };
  const result = assessCodeAIObservedContractCompatibility({ state, writes: [{ path: "lib/orders/runtime.js", content: "export function settleOrder(order, context, requiredThird){ return { id: order.id }; }" }] });
  assert.equal(result.compatible, false);
  assert.ok(result.violations.some((item) => item.kind === "OBSERVED_CALL_ARITY_INCOMPATIBLE"));
});

test("guard rejects removal of statically returned fields consumed by callers", () => {
  const state = { evidence: [
    read("lib/orders/runtime.js", "export function settleOrder(){ return { invoice_id: 'x', ok: true }; }"),
    read("lib/orders/service.js", 'import { settleOrder } from "./runtime.js"; export function settle(){ const result = settleOrder(); return result.invoice_id; }'),
  ] };
  const result = assessCodeAIObservedContractCompatibility({ state, writes: [{ path: "lib/orders/runtime.js", content: "export function settleOrder(){ return { ok: true }; }" }] });
  assert.equal(result.compatible, false);
  assert.ok(result.violations.some((item) => item.kind === "OBSERVED_RETURN_FIELD_REMOVED" && item.field === "invoice_id"));
});

test("guard preserves observed business context invariants", () => {
  const state = { evidence: [read("lib/orders/runtime.js", "export function settleOrder(context){ if (!context.organization_id) throw new Error('missing'); return { ok: true }; }")] };
  const result = assessCodeAIObservedContractCompatibility({ state, writes: [{ path: "lib/orders/runtime.js", content: "export function settleOrder(context){ return { ok: true }; }" }] });
  assert.equal(result.compatible, false);
  assert.ok(result.violations.some((item) => item.kind === "BUSINESS_CONTEXT_INVARIANT_REMOVED" && item.key === "organization_id"));
});


test("guard preserves observed Supabase selected columns", () => {
  const state = { evidence: [read("lib/orders/repository.js", 'export async function load(db){ return db.from("orders").select("id,organization_id,total"); }')] };
  const result = assessCodeAIObservedContractCompatibility({ state, writes: [{ path: "lib/orders/repository.js", content: 'export async function load(db){ return db.from("orders").select("id,total"); }' }] });
  assert.equal(result.compatible, false);
  assert.ok(result.violations.some((item) => item.kind === "SUPABASE_SELECTED_COLUMN_REMOVED" && item.column === "organization_id"));
});

test("guard accepts coherent same-package exported symbol migration", () => {
  const state = { evidence: [
    read("lib/orders/runtime.js", "export function settleOrder(){ return true; }"),
    read("lib/orders/service.js", 'import { settleOrder } from "./runtime.js"; export function settle(){ return settleOrder(); }'),
  ] };
  const result = assessCodeAIObservedContractCompatibility({ state, writes: [
    { path: "lib/orders/runtime.js", content: "export function settleOrderV2(){ return true; }" },
    { path: "lib/orders/service.js", content: 'import { settleOrderV2 } from "./runtime.js"; export function settle(){ return settleOrderV2(); }' },
  ] });
  assert.equal(result.compatible, true);
  assert.equal(result.requires_verification, true);
  assert.ok(result.coherent_contract_migrations.some((item) => item.kind === "COHERENT_IMPORTED_SYMBOL_MIGRATION" && item.from_symbol === "settleOrder" && item.to_symbol === "settleOrderV2"));
});

test("guard rejects partial symbol migration when one observed caller is unchanged", () => {
  const state = { evidence: [
    read("lib/orders/runtime.js", "export function settleOrder(){ return true; }"),
    read("lib/orders/service-a.js", 'import { settleOrder } from "./runtime.js"; export function settleA(){ return settleOrder(); }'),
    read("lib/orders/service-b.js", 'import { settleOrder } from "./runtime.js"; export function settleB(){ return settleOrder(); }'),
  ] };
  const result = assessCodeAIObservedContractCompatibility({ state, writes: [
    { path: "lib/orders/runtime.js", content: "export function settleOrderV2(){ return true; }" },
    { path: "lib/orders/service-a.js", content: 'import { settleOrderV2 } from "./runtime.js"; export function settleA(){ return settleOrderV2(); }' },
  ] });
  assert.equal(result.compatible, false);
  assert.ok(result.violations.some((item) => item.kind === "OBSERVED_IMPORTED_SYMBOL_REMOVED"));
});

test("guard accepts coherent same-package arity migration", () => {
  const state = { evidence: [
    read("lib/orders/runtime.js", "export function settleOrder(order){ return order.id; }"),
    read("lib/orders/service.js", 'import { settleOrder } from "./runtime.js"; export function settle(order){ return settleOrder(order); }'),
  ] };
  const result = assessCodeAIObservedContractCompatibility({ state, writes: [
    { path: "lib/orders/runtime.js", content: "export function settleOrder(order, context){ return order.id; }" },
    { path: "lib/orders/service.js", content: 'import { settleOrder } from "./runtime.js"; export function settle(order, context){ return settleOrder(order, context); }' },
  ] });
  assert.equal(result.compatible, true);
  assert.ok(result.coherent_contract_migrations.some((item) => item.kind === "COHERENT_CALL_ARITY_MIGRATION" && item.from_argument_count === 1 && item.to_argument_count === 2));
});

test("guard accepts coherent same-package returned-field migration", () => {
  const state = { evidence: [
    read("lib/orders/runtime.js", "export function settleOrder(){ return { invoice_id: 'x' }; }"),
    read("lib/orders/service.js", 'import { settleOrder } from "./runtime.js"; export function settle(){ const result = settleOrder(); return result.invoice_id; }'),
  ] };
  const result = assessCodeAIObservedContractCompatibility({ state, writes: [
    { path: "lib/orders/runtime.js", content: "export function settleOrder(){ return { receipt_id: 'x' }; }" },
    { path: "lib/orders/service.js", content: 'import { settleOrder } from "./runtime.js"; export function settle(){ const result = settleOrder(); return result.receipt_id; }' },
  ] });
  assert.equal(result.compatible, true);
  assert.ok(result.coherent_contract_migrations.some((item) => item.kind === "COHERENT_RETURN_FIELD_MIGRATION" && item.from_field === "invoice_id" && item.to_field === "receipt_id"));
});

test("guard preserves statically observed Next route response fields", () => {
  const state = { evidence: [read("app/api/orders/route.ts", "export async function GET(){ return Response.json({ ok: true, invoice_id: 'x' }); }")] };
  const result = assessCodeAIObservedContractCompatibility({ state, writes: [{ path: "app/api/orders/route.ts", content: "export async function GET(){ return Response.json({ ok: true }); }" }] });
  assert.equal(result.compatible, false);
  assert.ok(result.violations.some((item) => item.kind === "NEXT_ROUTE_RESPONSE_FIELD_REMOVED" && item.field === "invoice_id"));
});

test("guard preserves observed Supabase tenant filter keys", () => {
  const state = { evidence: [read("lib/orders/repository.js", "export async function load(db, organization_id){ return db.from('orders').select('id,total').eq('organization_id', organization_id); }")] };
  const result = assessCodeAIObservedContractCompatibility({ state, writes: [{ path: "lib/orders/repository.js", content: "export async function load(db){ return db.from('orders').select('id,total'); }" }] });
  assert.equal(result.compatible, false);
  assert.ok(result.violations.some((item) => item.kind === "SUPABASE_FILTER_KEY_REMOVED" && item.key === "organization_id"));
});

test("guard preserves observed Supabase mutation payload fields", () => {
  const state = { evidence: [read("lib/orders/repository.js", "export async function save(db, order){ return db.from('orders').update({ total: order.total, organization_id: order.organization_id }).eq('id', order.id); }")] };
  const result = assessCodeAIObservedContractCompatibility({ state, writes: [{ path: "lib/orders/repository.js", content: "export async function save(db, order){ return db.from('orders').update({ total: order.total }).eq('id', order.id); }" }] });
  assert.equal(result.compatible, false);
  assert.ok(result.violations.some((item) => item.kind === "SUPABASE_MUTATION_FIELD_REMOVED" && item.field === "organization_id"));
});

test("guard preserves observed Supabase RPC argument keys", () => {
  const state = { evidence: [read("lib/orders/repository.js", "export async function post(db, order){ return db.rpc('post_order', { order_id: order.id, organization_id: order.organization_id }); }")] };
  const result = assessCodeAIObservedContractCompatibility({ state, writes: [{ path: "lib/orders/repository.js", content: "export async function post(db, order){ return db.rpc('post_order', { order_id: order.id }); }" }] });
  assert.equal(result.compatible, false);
  assert.ok(result.violations.some((item) => item.kind === "SUPABASE_RPC_ARGUMENT_KEY_REMOVED" && item.key === "organization_id"));
});

test("guard respects TypeScript optional parameters when checking observed call arity", () => {
  const state = { evidence: [
    read("lib/orders/runtime.ts", "export function settleOrder(order: unknown, context?: unknown){ return { ok: true }; }"),
    read("lib/orders/service.ts", 'import { settleOrder } from "./runtime"; export function settle(order: unknown){ return settleOrder(order); }'),
  ] };
  const result = assessCodeAIObservedContractCompatibility({ state, writes: [{ path: "lib/orders/runtime.ts", content: "export function settleOrder(order: unknown, context?: unknown){ return { ok: true }; }" }] });
  assert.equal(result.compatible, true);
  assert.ok(result.obligations.some((item) => item.kind === "OBSERVED_CALL_ARITY" && item.observed_argument_count === 1));
});
