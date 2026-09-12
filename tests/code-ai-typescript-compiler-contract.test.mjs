import assert from "node:assert/strict";
import test from "node:test";
import { buildCodeAITypeScriptCompilerContracts } from "../lib/code/runtime/CodeAITypeScriptCompilerContractRuntime.js";
import { assessCodeAIObservedContractCompatibility } from "../lib/code/runtime/CodeAIObservedContractGuardRuntime.js";
import { deriveRecurringCodeAIContractFailureLessons } from "../lib/code/runtime/CodeAIContractFailureLearningRuntime.js";
import { deriveCodeAIContractFailurePreflight } from "../lib/code/runtime/CodeAIContractFailurePreflightRuntime.js";
import { deriveCodeAIContractAwareDiscovery } from "../lib/code/runtime/CodeAIContractAwareDiscoveryRuntime.js";

function read(path, content) {
  return { action: "read", status: "completed", result: { file_path: path, content } };
}

const typesSource = [
  "export interface Base { organization_id: string; note?: string }",
  "export interface Box<T> { value: T }",
].join("\n");
const serviceSource = [
  'import type { Base, Box } from "./types";',
  "export interface OrderInput extends Base { total: number }",
  "export function load(input: OrderInput): Box<OrderInput> { return { value: input }; }",
].join("\n");

test("compiler resolver resolves cross-file inheritance and generic instantiation", () => {
  const state = { evidence: [read("lib/types.ts", typesSource), read("lib/service.ts", serviceSource)] };
  const result = buildCodeAITypeScriptCompilerContracts({ state, writes: [{ path: "lib/types.ts", content: typesSource }] });
  assert.equal(result.active, true);
  assert.equal(result.before.clean, true);
  const order = result.before.by_path["lib/service.ts"].types.find((item) => item.name === "OrderInput");
  assert.deepEqual(order.properties.map((item) => item.name).sort(), ["note", "organization_id", "total"]);
  const load = result.before.by_path["lib/service.ts"].functions.find((item) => item.name === "load");
  assert.ok(load.signatures[0].parameters[0].properties.some((item) => item.name === "organization_id"));
  assert.ok(load.signatures[0].return_properties.some((item) => item.name === "value"));
  assert.equal(result.repository_wide_compile_performed, false);
});

test("guard catches cross-file inherited contract break in unchanged consumer", () => {
  const state = { evidence: [read("lib/types.ts", typesSource), read("lib/service.ts", serviceSource)] };
  const result = assessCodeAIObservedContractCompatibility({
    state,
    writes: [{ path: "lib/types.ts", content: "export interface Base { note?: string }\nexport interface Box<T> { value: T }" }],
  });
  assert.equal(result.typescript_compiler_enforced, true);
  assert.equal(result.compatible, false);
  assert.ok(result.violations.some((item) => item.kind === "TS_COMPILER_EXPORTED_TYPE_PROPERTY_REMOVED" && item.symbol === "OrderInput" && item.property === "organization_id"));
});

test("guard catches compiler-resolved generic arity changes", () => {
  const state = { evidence: [read("lib/types.ts", typesSource), read("lib/service.ts", serviceSource)] };
  const result = assessCodeAIObservedContractCompatibility({
    state,
    writes: [
      { path: "lib/types.ts", content: "export interface Base { organization_id: string; note?: string }\nexport interface Box<T, Meta> { value: T; meta?: Meta }" },
      { path: "lib/service.ts", content: 'import type { Base, Box } from "./types"; export interface OrderInput extends Base { total: number } export function load(input: OrderInput): Box<OrderInput, { source: string }> { return { value: input }; }' },
    ],
  });
  assert.equal(result.compatible, false);
  assert.ok(result.violations.some((item) => item.kind === "TS_COMPILER_EXPORTED_TYPE_GENERIC_ARITY_CHANGED" && item.symbol === "Box"));
});

test("unresolved observed TypeScript program stays unknown instead of inventing compiler violations", () => {
  const state = { evidence: [
    read("lib/service.ts", 'import type { Missing } from "./missing"; export function load(input: Missing){ return input; }'),
    read("lib/other.ts", 'export interface Other { id: string }'),
  ] };
  const result = assessCodeAIObservedContractCompatibility({
    state,
    writes: [{ path: "lib/service.ts", content: 'import type { Missing } from "./missing"; export function load(input: Missing){ return input; }' }],
  });
  assert.equal(result.typescript_compiler_active, true);
  assert.equal(result.typescript_compiler_enforced, false);
  assert.equal(result.typescript_compiler_enforcement_reason, "COMPILER_PROGRAM_NOT_CLEAN");
  assert.equal(result.violations.some((item) => String(item.kind).startsWith("TS_COMPILER_")), false);
});


test("compiler contract failures become recurring deterministic prevention", () => {
  const violation = { kind: "TS_COMPILER_EXPORTED_TYPE_PROPERTY_REMOVED", path: "lib/service.ts", symbol: "OrderInput", property: "organization_id" };
  const matches = [1, 2].map((id) => ({ id, failures: [{ contract_violations: [violation] }] }));
  const learning = deriveRecurringCodeAIContractFailureLessons(matches);
  assert.equal(learning.recurring, true);
  assert.ok(learning.patterns.some((item) => item.kind === violation.kind));
  const preflight = deriveCodeAIContractFailurePreflight({ learning });
  assert.ok(preflight.checks.some((item) => item.kind === violation.kind && item.check_id === "PRESERVE_COMPILER_RESOLVED_TYPESCRIPT_PROPERTIES"));
  const memory = { recurring_contract_failure_learning: learning, matches };
  const discovery = deriveCodeAIContractAwareDiscovery({ memory });
  assert.ok(discovery.priority_paths.includes("lib/service.ts"));
  assert.ok(discovery.strategic_search_terms.includes("OrderInput"));
  assert.ok(discovery.strategic_search_terms.includes("organization_id"));
});
