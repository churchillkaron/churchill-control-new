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
  assert.equal(result.obligation_count, 1);
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
