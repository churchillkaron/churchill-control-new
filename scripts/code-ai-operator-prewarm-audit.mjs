import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const CONTRACT = "AVANTIQO_CODE_AI_OPERATOR_LOCAL_READINESS_AUDIT_V2";
const route = await readFile("app/api/operator/code/prewarm/route.js", "utf8");
const ui = await readFile("components/operator/HomeAvantiqoIntelligence.jsx", "utf8");
const worker = await readFile("lib/code/runtime/CodeAIWorkerSessionRuntime.js", "utf8");

for (const marker of [
  "requireOrganizationAccess",
  "AVANTIQO_CODE_OPERATOR_LOCAL_READINESS_V4",
  "AvantiqoCodeLocalQueueProvider.available()",
  'status: localReady ? "local_ready" : "local_unavailable"',
  "warming: false",
  'execution_transport_mode: "AVANTIQO_LOCAL_NODE_V1"',
  "local_only: true",
  "external_compute_available: false",
  "external_compute_checked: false",
  "external_worker_started: false",
  "worker_session_created: false",
  "reasoning_calls_used: 0",
  "customer_inference_performed: false",
  "wallet_mutation_performed: false",
  "source_mutation_performed: false",
  "github_write_performed: false",
  "production_deploy_performed: false",
  "raw_reasoning_persisted: false",
]) assert.ok(route.includes(marker), `route marker missing: ${marker}`);

assert.doesNotMatch(route, /Modal|modal|RunPod|runpod|ensureCodeAIWorkerSession|ServiceExecutionRuntime|executeCodeAIPlannerRequest|executeCodeAIMission|apply_files/);
assert.doesNotMatch(ui, /\/api\/operator\/code\/prewarm|CODE_PREWARM_MAX_POLLS|CODE_PREWARM_POLL_MS|advanceCodePrewarm/);
for (const marker of [
  "AVANTIQO_CODE_AI_WORKER_SESSION_V4_LOCAL",
  'execution_transport_mode:"LOCAL_DURABLE_QUEUE"',
  "warming:false",
  "worker_started:false",
  "worker_session_created:false",
]) assert.ok(worker.includes(marker), `worker marker missing: ${marker}`);

console.log(JSON.stringify({ success:true, contract:CONTRACT, verified:{ authenticated_organization_scoped_readiness:true, local_durable_queue_only:true, no_external_worker_start:true, no_background_code_prewarm_polling:true, reasoning_calls_used:0, wallet_mutation_performed:false, source_mutation_performed:false, production_deploy_performed:false } }, null, 2));
console.log(`${CONTRACT}=PASS`);
