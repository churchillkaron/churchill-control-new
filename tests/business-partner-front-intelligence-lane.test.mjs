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
  assert.match(fast, /external_compute_started: false/);
  assert.match(fast, /local_timeout: true/);
  assert.doesNotMatch(fast, /FAST_PROJECT_CONVERSATION_ESCALATION|FAST_CONVERSATION_ESCALATION/);
});

test("front lane is explicit-only and cannot replace global text generation", () => {
  const local = source("lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceLocalRuntime.js");
  const queue = source("lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceLocalQueueRuntime.js");
  assert.match(local, /LANES = new Set\(\["front", "fast"\]\)/);
  assert.match(local, /const lane = text\(input\.execution_lane \|\| input\.executionLane\)\.toLowerCase\(\) \|\| "fast"/);
  assert.match(queue, /LANES = new Set\(\["front", "fast", "deep"\]\)/);
  assert.match(local, /FRONT_FOUNDATION_MODEL = "Qwen\/Qwen3-4B-GGUF:Q4_K_M"/);
  assert.match(local, /FRONT_RUNTIME_CONTRACT = "AVANTIQO_INTELLIGENCE_FRONT_CPU_WARM_V2"/);
});

test("owned front lane is local CPU and has no mutation authority", () => {
  const local = source("lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceLocalRuntime.js");
  const queue = source("lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceLocalQueueRuntime.js");
  assert.match(local, /INFRASTRUCTURE_PROVIDER = "AVANTIQO_LOCAL_NODE_V1"/);
  assert.match(local, /TRANSPORT = "ollama-http-lan-v1"/);
  assert.match(queue, /INFRASTRUCTURE_PROVIDER = "AVANTIQO_LOCAL_NODE_V1"/);
  assert.match(queue, /TRANSPORT = "supabase-pull-queue-v1"/);
  assert.match(queue, /mutation_authority: false/);
  assert.match(queue, /tools_allowed: false/);
});

test("Business Partner page checks owned local readiness without waking Modal or persisting a turn", () => {
  const route = source("app/api/operator/intelligence/prewarm/route.js");
  const ui = source("components/operator/HomeAvantiqoIntelligence.jsx");
  parse(ui, { sourceType: "module", plugins: ["jsx"] });
  assert.match(route, /getIntelligenceLocalQueueHealth/);
  assert.match(route, /infrastructure_policy: "local_only"/);
  assert.match(route, /local_only_preflight: true/);
  assert.match(route, /external_compute_available: false/);
  assert.match(route, /external_compute_started: false/);
  assert.match(route, /inference_requests_performed: 0/);
  assert.match(route, /customer_inference_performed: false/);
  assert.match(route, /wallet_mutation_performed: false/);
  assert.doesNotMatch(route, /prewarmIntelligenceModalFront/);
  assert.match(ui, /fetch\("\/api\/operator\/intelligence\/prewarm"/);
  assert.match(ui, /AVANTIQO_INTELLIGENCE_FRONT_PREWARM_ADVISORY_FAILURE/);
});


test("front cognition is owned-local only and cannot directly fall through to Modal", () => {
  const runtime = source("lib/operator/runtime/OperatorFrontCognitionRuntime.js");
  const queue = runtime.indexOf("executeIntelligenceLocalQueueAndWait(executionInput");
  const directLocal = runtime.indexOf("executeIntelligenceLocal(executionInput)");
  assert.ok(queue >= 0);
  assert.ok(directLocal > queue);
  assert.doesNotMatch(runtime, /executeIntelligenceModalDirect/);
  assert.doesNotMatch(runtime, /ModalDirectRuntime/);
  assert.match(runtime, /OPERATOR_FRONT_COGNITION_LOCAL_RUNTIME_REQUIRED/);
  assert.match(runtime, /OPERATOR_FRONT_COGNITION_LOCAL_RUNTIME_UNAVAILABLE/);
  assert.match(runtime, /allow_fast_escalation = false/);
  assert.match(runtime, /AvantiqoIntelligenceReasoningRuntime\.run/);
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
  assert.match(pending, /front_task_mode: "pending_action_relation"/);
  assert.match(pending, /front_task_mode: "pending_action_presentation"/);
  assert.match(pending, /allow_fast_escalation: false/);
  assert.match(pending, /authorization_effect: "NONE"/);
  assert.match(pending, /\["preview", "pdf", "download", "none"\]\.includes\(presentation\)/);
});
