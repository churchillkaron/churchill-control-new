import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { parse } from "@babel/parser";

function source(path) {
  return fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

test("Business Partner lightweight conversation explicitly uses the front lane", () => {
  const fast = source("lib/operator/runtime/OperatorFastConversationRuntime.js");
  assert.match(fast, /input:\s*\{[\s\S]{0,180}execution_lane: "front"/);
  assert.match(fast, /execution_lane: "front"[\s\S]{0,180}FRONT_CONVERSATION_SETTLEMENT/);
  assert.match(fast, /FAST_EVIDENCE_CONVERSATION[\s\S]{0,1000}execution_lane: "fast"/);
});

test("front lane is explicit-only and cannot replace global text generation", () => {
  const direct = source("lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceModalDirectRuntime.js");
  assert.match(direct, /LANES = new Set\(\["front", "fast", "deep"\]\)/);
  assert.match(direct, /"ai\.text\.generate": "fast"/);
  assert.match(direct, /AVANTIQO_INTELLIGENCE_FRONT_TOOLS_FORBIDDEN/);
  assert.match(direct, /FRONT_MODEL = "Qwen\/Qwen3-1\.7B-GGUF:Q8_0"/);
  assert.match(direct, /FRONT_RUNTIME_CONTRACT = "AVANTIQO_INTELLIGENCE_FRONT_CPU_SNAPSHOT_V1"/);
});

test("owned front worker scales fully to zero and has no tool authority", () => {
  const worker = source("services/avantiqo-intelligence-modal/modal_front_app.py");
  assert.match(worker, /min_containers=0/);
  assert.match(worker, /max_containers=1/);
  assert.match(worker, /SCALEDOWN_WINDOW_SECONDS = 120/);
  assert.match(worker, /enable_memory_snapshot=True/);
  assert.match(worker, /AVANTIQO_INTELLIGENCE_FRONT_TOOLS_FORBIDDEN/);
  assert.match(worker, /"mutation_authority": False/);
  assert.match(worker, /"customer_inference_performed": False/);
});

test("Business Partner page wakes the front lane without persisting a turn", () => {
  const route = source("app/api/operator/intelligence/prewarm/route.js");
  const ui = source("components/operator/HomeAvantiqoIntelligence.jsx");
  parse(ui, { sourceType: "module", plugins: ["jsx"] });
  assert.match(route, /prewarmIntelligenceModalFront/);
  assert.match(route, /customer_inference_performed: false/);
  assert.match(route, /wallet_mutation_performed: false/);
  assert.match(route, /min_containers: 0/);
  assert.match(ui, /fetch\("\/api\/operator\/intelligence\/prewarm"/);
  assert.match(ui, /AVANTIQO_INTELLIGENCE_FRONT_PREWARM_ADVISORY_FAILURE/);
});
