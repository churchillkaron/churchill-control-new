import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { parse } from "@babel/parser";

function source(path) {
  return fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

test("Business Partner lightweight conversation explicitly uses the front lane", () => {
  const fast = source("lib/operator/runtime/OperatorFastConversationRuntime.js");
  assert.match(fast, /runOperatorFrontCognition/);
  assert.match(fast, /front_task_mode: "conversation"/);
  assert.match(fast, /FAST_PROJECT_CONVERSATION_ESCALATION|FAST_CONVERSATION_ESCALATION/);
});

test("front lane is explicit-only and cannot replace global text generation", () => {
  const direct = source("lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceModalDirectRuntime.js");
  assert.match(direct, /LANES = new Set\(\["front", "fast", "deep"\]\)/);
  assert.match(direct, /"ai\.text\.generate": "fast"/);
  assert.match(direct, /AVANTIQO_INTELLIGENCE_FRONT_TOOLS_FORBIDDEN/);
  assert.match(direct, /FRONT_MODEL = "Qwen\/Qwen3-1\.7B-GGUF:Q8_0"/);
  assert.match(direct, /FRONT_RUNTIME_CONTRACT = "AVANTIQO_INTELLIGENCE_FRONT_CPU_WARM_V2"/);
});

test("owned front worker stays warm on CPU and has no tool authority", () => {
  const worker = source("services/avantiqo-intelligence-modal/modal_front_app.py");
  assert.match(worker, /min_containers=1/);
  assert.match(worker, /max_containers=2/);
  assert.match(worker, /SCALEDOWN_WINDOW_SECONDS = 120/);
  assert.match(worker, /enable_memory_snapshot=False/);
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
  assert.match(route, /min_containers: Number\(/);
  assert.match(ui, /fetch\("\/api\/operator\/intelligence\/prewarm"/);
  assert.match(ui, /AVANTIQO_INTELLIGENCE_FRONT_PREWARM_ADVISORY_FAILURE/);
});


test("front cognition records zero-price governed CPU usage instead of wallet settlement", () => {
  const runtime = source("lib/operator/runtime/OperatorFrontCognitionRuntime.js");
  assert.match(runtime, /OrganizationServiceRuntime\.get/);
  assert.match(runtime, /UsageRuntime\.record/);
  assert.match(runtime, /zero_price_owned_cpu_lane: true/);
  assert.match(runtime, /wallet_reservation_required: false/);
  assert.match(runtime, /billing_required: false/);
});

test("pending-action semantic interpretation is CPU-only and cannot silently escalate", () => {
  const pending = source("lib/operator/runtime/OperatorPendingActionSemanticInterpreter.js");
  const worker = source("services/avantiqo-intelligence-modal/modal_front_app.py");
  assert.match(pending, /front_task_mode: "pending_action_relation"/);
  assert.match(pending, /front_task_mode: "pending_action_presentation"/);
  assert.match(pending, /allow_fast_escalation: false/);
  assert.match(worker, /pending_action_relation/);
  assert.match(worker, /pending_action_presentation/);
  assert.match(worker, /presentation ::= "preview" \| "pdf" \| "download" \| "none"/);
  assert.match(worker, /request_body\["grammar"\]/);
});
