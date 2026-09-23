import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const reasoning = await readFile(new URL("../lib/intelligence/runtime/AvantiqoIntelligenceReasoningRuntime.js", import.meta.url), "utf8");
const synthetic = await readFile(new URL("../lib/operator/runtime/SyntheticIntelligenceTurnRuntime.js", import.meta.url), "utf8");
const modal = await readFile(new URL("../lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceModalDirectRuntime.js", import.meta.url), "utf8");

test("owned Intelligence cache identity excludes raw content", () => {
  assert.match(reasoning, /AVANTIQO_INTELLIGENCE_PREFIX_CACHE_CONTEXT_V1/);
  assert.match(reasoning, /raw_content_included: false/);
  assert.match(reasoning, /cache_context: cacheContext/);
});

test("approved Modal overflow preserves cache/usage telemetry but is not automatic", () => {
  assert.match(modal, /cached_input_tokens/);
  assert.match(modal, /generation_ms/);
  assert.match(modal, /compute_ms/);
  assert.match(modal, /claimIntelligenceModalOverflowExecution/);
  assert.match(modal, /automatic_fallback_allowed: false/);
});

test("Business Partner serializes stable context before volatile user text", () => {
  const start = synthetic.indexOf("const request = {");
  const section = synthetic.slice(start, start + 900);
  assert.ok(section.indexOf("business_context") < section.indexOf("project_state"));
  assert.ok(section.indexOf("organization_id") < section.indexOf("project_state"));
  assert.ok(section.indexOf("project_state") < section.indexOf("user_message"));
});
