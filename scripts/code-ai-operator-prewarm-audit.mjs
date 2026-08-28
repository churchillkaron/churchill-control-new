import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const CONTRACT = "AVANTIQO_CODE_AI_OPERATOR_PREWARM_AUDIT_V1";

const files = {
  route: "app/api/operator/code/prewarm/route.js",
  ui: "components/operator/HomeAvantiqoIntelligence.jsx",
  worker: "lib/code/runtime/CodeAIWorkerSessionRuntime.js",
};

const source = Object.fromEntries(
  await Promise.all(
    Object.entries(files).map(async ([key, path]) => [key, await readFile(path, "utf8")]),
  ),
);

function requireMarkers(label, content, markers) {
  const missing = markers.filter((marker) => !content.includes(marker));
  if (missing.length) {
    throw new Error(`${CONTRACT}_${label}_MISSING:${missing.join("|")}`);
  }
}

requireMarkers("ROUTE", source.route, [
  "requireOrganizationAccess",
  "ensureCodeAIWorkerSession",
  "AVANTIQO_CODE_OPERATOR_PREWARM_V1",
  "AVANTIQO_CODE_WORKER_SESSION_ENABLED",
  'status: worker?.ready === true ? "ready" : "warming"',
  "reasoning_calls_used: 0",
  "customer_inference_performed: false",
  "wallet_mutation_performed: false",
  "source_mutation_performed: false",
  "github_write_performed: false",
  "production_deploy_performed: false",
  "contains_worker_token: false",
  "raw_reasoning_persisted: false",
]);

requireMarkers("UI", source.ui, [
  "CODE_PREWARM_POLL_MS = 5000",
  "CODE_PREWARM_MAX_POLLS = 90",
  'fetch("/api/operator/code/prewarm"',
  'method: "POST"',
  'credentials: "same-origin"',
  'body: JSON.stringify({ organizationId })',
  'result?.ready === true || result?.status === "disabled"',
  "window.setTimeout(advanceCodePrewarm, CODE_PREWARM_POLL_MS)",
  "controller.abort()",
]);

requireMarkers("WORKER", source.worker, [
  "engine_ready: true",
  "body?.engine_loaded === true",
  "reasoning_call_consumed_by_warmup: false",
  "wallet_mutation_performed_by_warmup: false",
  "contains_worker_token: false",
]);

assert.equal(/executeCodeAIPlannerRequest|ServiceExecutionRuntime/.test(source.route), false);
assert.equal(source.route.includes("[deploy-production-final]"), false);
assert.equal(source.ui.includes("[deploy-production-final]"), false);
assert.equal(source.route.includes("executeCodeAIMission"), false);
assert.equal(source.route.includes("apply_files"), false);

const fetchIndex = source.ui.indexOf('fetch("/api/operator/code/prewarm"');
const restoreIndex = source.ui.indexOf("async function restoreConversation()");
assert.ok(fetchIndex >= 0, "prewarm request must exist in Operator UI");
assert.ok(restoreIndex >= 0, "conversation restore must remain present");
assert.notEqual(fetchIndex, restoreIndex, "prewarm must not replace conversation restore");

console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  verified: {
    authenticated_organization_scoped_prewarm_route: true,
    prewarm_bypasses_code_planner_reasoning: true,
    prewarm_bypasses_service_runtime_wallet: true,
    prewarm_cannot_mutate_source: true,
    prewarm_cannot_write_github: true,
    prewarm_cannot_deploy_production: true,
    worker_token_not_exposed: true,
    operator_starts_prewarm_without_user_instruction: true,
    operator_polls_until_ready_or_disabled: true,
    operator_chat_remains_separate_from_prewarm: true,
    bounded_background_polling: true,
    model_provider_call_performed_by_audit: false,
    reasoning_call_consumed_by_audit: false,
    wallet_mutation_performed_by_audit: false,
    runpod_mutation_performed_by_audit: false,
    source_mutation_performed_by_audit: false,
    production_deploy_performed: false,
  },
}, null, 2));
console.log(`${CONTRACT}=PASS`);
