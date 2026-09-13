import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const worker = await readFile(new URL("../services/avantiqo-intelligence-modal/modal_app.py", import.meta.url), "utf8");
const direct = await readFile(new URL("../lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceModalDirectRuntime.js", import.meta.url), "utf8");
const reasoning = await readFile(new URL("../lib/intelligence/runtime/AvantiqoIntelligenceReasoningRuntime.js", import.meta.url), "utf8");
const synthetic = await readFile(new URL("../lib/operator/runtime/SyntheticIntelligenceTurnRuntime.js", import.meta.url), "utf8");

test("owned vLLM enables real automatic prefix caching", () => {
  assert.match(worker, /"enable_prefix_caching": True/);
  assert.match(worker, /num_cached_tokens/);
  assert.match(worker, /"prefix_cache_enabled": True/);
  assert.match(worker, /"prefix_cache_hit": cached_input_tokens > 0/);
});

test("cache identity crosses reasoning and Modal without raw content", () => {
  assert.match(reasoning, /AVANTIQO_INTELLIGENCE_PREFIX_CACHE_CONTEXT_V1/);
  assert.match(reasoning, /raw_content_included: false/);
  assert.match(direct, /cache_context: input\.cache_context \|\| input\.cacheContext/);
  assert.match(direct, /cached_input_tokens/);
  assert.match(worker, /engine_prepare_ms/);
  assert.match(worker, /generation_ms/);
  assert.match(worker, /structured_finalization_ms/);
  assert.match(worker, /compute_ms/);
  assert.match(direct, /generation_ms/);
  assert.match(direct, /compute_ms/);
});

test("Business Partner serializes stable context before volatile user text", () => {
  const start = synthetic.indexOf("const request = {");
  const section = synthetic.slice(start, start + 900);
  assert.ok(section.indexOf("project_state") < section.indexOf("user_message"));
  assert.ok(section.indexOf("business_context") < section.indexOf("user_message"));
  assert.ok(section.indexOf("organization_id") < section.indexOf("user_message"));
});
