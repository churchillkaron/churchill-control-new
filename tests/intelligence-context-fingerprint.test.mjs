import test from "node:test";
import assert from "node:assert/strict";
import { intelligenceContextFingerprint } from "../lib/operator/runtime/IntelligenceContextFingerprintPolicy.js";
import { buildIntelligenceContextBudget } from "../lib/operator/runtime/IntelligenceContextBudgetRuntime.js";

test("context fingerprint is stable across object key order", () => {
  const left = intelligenceContextFingerprint({ projectCheckpoint: { b: 2, a: 1 } });
  const right = intelligenceContextFingerprint({ projectCheckpoint: { a: 1, b: 2 } });
  assert.equal(left.static_context_fingerprint, right.static_context_fingerprint);
  assert.equal(left.raw_content_returned, false);
});

test("volatile turns do not change static context fingerprint", () => {
  const base = { projectCheckpoint: { objective: "Grow" }, durableMemory: [{ type: "decision", content: "Keep costs bounded" }] };
  const first = intelligenceContextFingerprint({ ...base, recentConversation: [{ role: "user", content: "hello" }] });
  const second = intelligenceContextFingerprint({ ...base, recentConversation: [{ role: "user", content: "different" }] });
  assert.equal(first.static_context_fingerprint, second.static_context_fingerprint);
  assert.equal(Object.hasOwn(first, "volatile_context_fingerprint"), false);
  assert.equal(Object.hasOwn(second, "volatile_context_fingerprint"), false);
  assert.notEqual(first.volatile_chars, second.volatile_chars);
});

test("static cache identity is isolated by organization scope", () => {
  const stable = { projectCheckpoint: { objective: "Operate safely" }, durableMemory: [{ type: "decision", content: "Bound context" }] };
  const first = intelligenceContextFingerprint({ ...stable, scope: { organization_id: "org-a", entity_id: "entity-1" } });
  const same = intelligenceContextFingerprint({ ...stable, scope: { entity_id: "entity-1", organization_id: "org-a" } });
  const otherOrg = intelligenceContextFingerprint({ ...stable, scope: { organization_id: "org-b", entity_id: "entity-1" } });
  assert.equal(first.contract, "AVANTIQO_INTELLIGENCE_CONTEXT_FINGERPRINT_V2");
  assert.equal(first.static_context_fingerprint, same.static_context_fingerprint);
  assert.notEqual(first.static_context_fingerprint, otherOrg.static_context_fingerprint);
});

test("archived history growth does not change bounded static fingerprint", () => {
  const recent = Array.from({ length: 8 }, (_, index) => ({ role: index % 2 ? "assistant" : "user", content: `recent-${index}` }));
  const old = Array.from({ length: 5000 }, (_, index) => ({ role: index % 2 ? "assistant" : "user", content: `old-${index}` }));
  const state = { objective: "Keep Intelligence bounded", decisions: ["Use compact state"] };
  const memories = [{ type: "decision", content: "Store a lot, read very little" }];
  const short = buildIntelligenceContextBudget({ conversation: recent, projectState: state, longTermMemory: memories, lane: "fast" });
  const long = buildIntelligenceContextBudget({ conversation: [...old, ...recent], projectState: state, longTermMemory: memories, lane: "fast" });
  assert.equal(short.context_fingerprint.static_context_fingerprint, long.context_fingerprint.static_context_fingerprint);
  assert.equal(short.context_fingerprint.cacheable_static_chars, long.context_fingerprint.cacheable_static_chars);
});

test("tool descriptor fingerprint changes only when bounded tool envelope changes", () => {
  const one = intelligenceContextFingerprint({ toolDescriptors: [{ type: "function", function: { name: "read_a" } }] });
  const same = intelligenceContextFingerprint({ toolDescriptors: [{ function: { name: "read_a" }, type: "function" }] });
  const other = intelligenceContextFingerprint({ toolDescriptors: [{ type: "function", function: { name: "read_b" } }] });
  assert.equal(one.tool_descriptor_fingerprint, same.tool_descriptor_fingerprint);
  assert.notEqual(one.tool_descriptor_fingerprint, other.tool_descriptor_fingerprint);
  assert.equal(one.cacheable, true);
});

test("Business Partner persists bounded fingerprint as reasoning metadata", async () => {
  const { readFile } = await import("node:fs/promises");
  const route = await readFile(new URL("../app/api/operator/turn/route.js", import.meta.url), "utf8");
  const runtime = await readFile(new URL("../lib/operator/runtime/SyntheticIntelligenceTurnRuntime.js", import.meta.url), "utf8");
  assert.match(route, /contextFingerprint:\s*contextBudget\.context_fingerprint/);
  assert.match(runtime, /intelligence_operator_context_fingerprint:\s*object\(options\.contextFingerprint\)/);
});
