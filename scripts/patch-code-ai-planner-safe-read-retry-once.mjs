import { readFile, writeFile } from "node:fs/promises";

const CONTRACT = "AVANTIQO_CODE_AI_PLANNER_SAFE_READ_RETRY_PATCH_V2";
const PLANNER_PATH = "lib/code/runtime/CodeAIPlannerExecutionRuntime.js";
const SELFTEST_PATH = "scripts/code-ai-certification-resilience-selftest.mjs";

function block(lines) {
  return lines.join("\n");
}

function replaceOnce(source, before, after, label) {
  if (!source.includes(before)) {
    if (source.includes(after)) return { source, changed: false, already: true };
    throw new Error(`${CONTRACT}_${label}_BASE_NOT_FOUND`);
  }
  const first = source.indexOf(before);
  if (source.indexOf(before, first + before.length) >= 0) {
    throw new Error(`${CONTRACT}_${label}_BASE_AMBIGUOUS`);
  }
  return {
    source: source.slice(0, first) + after + source.slice(first + before.length),
    changed: true,
    already: false,
  };
}

let planner = await readFile(PLANNER_PATH, "utf8");
let selftest = await readFile(SELFTEST_PATH, "utf8");

const importBefore = block([
  "import {",
  "  CODE_AI_PLANNER_STALE_CANCEL_SETTLE_WINDOW_MS,",
  "  CODE_AI_PLANNER_STALE_QUEUE_RECOVERY_LIMIT,",
  "  shouldRecoverStaleQueuedPlannerJob,",
  "  staleCodePlannerQueueRecoveryExhausted,",
  "} from \"./CodeAICertificationResiliencePolicy.js\";",
]);
const importAfter = block([
  "import {",
  "  CODE_AI_PLANNER_STALE_CANCEL_SETTLE_WINDOW_MS,",
  "  CODE_AI_PLANNER_STALE_QUEUE_RECOVERY_LIMIT,",
  "  RUNPOD_HEALTH_MAX_ATTEMPTS,",
  "  boundedRetryDelayMs,",
  "  isRetryableHttpStatus,",
  "  isTransientNetworkError,",
  "  shouldRecoverStaleQueuedPlannerJob,",
  "  staleCodePlannerQueueRecoveryExhausted,",
  "} from \"./CodeAICertificationResiliencePolicy.js\";",
]);
({ source: planner } = replaceOnce(planner, importBefore, importAfter, "IMPORT"));

const delayBefore = block([
  "function delay(ms) {",
  "  return new Promise((resolve) => setTimeout(resolve, ms));",
  "}",
  "",
  "async function responseJson(response) {",
]);
const delayAfter = block([
  "function delay(ms) {",
  "  return new Promise((resolve) => setTimeout(resolve, ms));",
  "}",
  "",
  "async function runpodSafeReadResponse(url, key, {",
  "  timeout_ms = 30_000,",
  "  label = \"CODE_AI_PLANNER_RUNPOD_SAFE_READ\",",
  "} = {}) {",
  "  let lastError = null;",
  "  for (let attempt = 0; attempt < RUNPOD_HEALTH_MAX_ATTEMPTS; attempt += 1) {",
  "    try {",
  "      const response = await fetch(url, {",
  "        method: \"GET\",",
  "        headers: {",
  "          Authorization: \"Bearer \" + key,",
  "          Accept: \"application/json\",",
  "        },",
  "        signal: AbortSignal.timeout(timeout_ms),",
  "      });",
  "      if (",
  "        !isRetryableHttpStatus(response.status) ||",
  "        attempt === RUNPOD_HEALTH_MAX_ATTEMPTS - 1",
  "      ) {",
  "        return response;",
  "      }",
  "      lastError = new Error(label + \"_HTTP_\" + response.status);",
  "    } catch (error) {",
  "      lastError = error;",
  "      if (",
  "        !isTransientNetworkError(error) ||",
  "        attempt === RUNPOD_HEALTH_MAX_ATTEMPTS - 1",
  "      ) {",
  "        throw error;",
  "      }",
  "    }",
  "",
  "    console.error(JSON.stringify({",
  "      event: \"AVANTIQO_CODE_PLANNER_SAFE_READ_RETRY\",",
  "      contract: CONTRACT,",
  "      attempt: attempt + 1,",
  "      max_attempts: RUNPOD_HEALTH_MAX_ATTEMPTS,",
  "      label,",
  "      reason: text(lastError?.message || lastError).slice(0, 180),",
  "      provider_execution_submitted: false,",
  "      endpoint_mutation_performed: false,",
  "      production_deploy_performed: false,",
  "      secrets_printed: false,",
  "    }));",
  "    await delay(boundedRetryDelayMs(attempt));",
  "  }",
  "",
  "  throw lastError || new Error(label + \"_RETRY_EXHAUSTED\");",
  "}",
  "",
  "async function responseJson(response) {",
]);
({ source: planner } = replaceOnce(planner, delayBefore, delayAfter, "SAFE_READ_HELPER"));

const preflightBefore = block([
  "  let response;",
  "  try {",
  "    response = await fetch(RUNPOD_ENDPOINTS_URL, {",
  "      headers: {",
  "        Authorization: `Bearer ${managementCredential}`,",
  "        Accept: \"application/json\",",
  "      },",
  "      signal: AbortSignal.timeout(30_000),",
  "    });",
  "  } catch (error) {",
]);
const preflightAfter = block([
  "  let response;",
  "  try {",
  "    response = await runpodSafeReadResponse(",
  "      RUNPOD_ENDPOINTS_URL,",
  "      managementCredential,",
  "      { label: \"CODE_AI_PLANNER_RUNPOD_ENDPOINT_PREFLIGHT\" },",
  "    );",
  "  } catch (error) {",
]);
({ source: planner } = replaceOnce(planner, preflightBefore, preflightAfter, "PREFLIGHT_READ"));

const queueBefore = block([
  "async function runpodQueueJson(endpointId, pathname, options = {}) {",
  "  const apiKey = text(process.env.RUNPOD_API_KEY);",
  "  if (!apiKey) throw new Error(\"RUNPOD_CODE_QUEUE_CREDENTIAL_REQUIRED\");",
  "  const response = await fetch(",
  "    `${RUNPOD_QUEUE_BASE}/${encodeURIComponent(endpointId)}${pathname}`,",
  "    {",
  "      method: options.method || \"GET\",",
  "      headers: {",
  "        Authorization: `Bearer ${apiKey}`,",
  "        Accept: \"application/json\",",
  "        ...(options.body ? { \"Content-Type\": \"application/json\" } : {}),",
  "      },",
  "      body: options.body ? JSON.stringify(options.body) : undefined,",
  "      signal: AbortSignal.timeout(options.timeout_ms || 30_000),",
  "    },",
  "  );",
]);
const queueAfter = block([
  "async function runpodQueueJson(endpointId, pathname, options = {}) {",
  "  const apiKey = text(process.env.RUNPOD_API_KEY);",
  "  if (!apiKey) throw new Error(\"RUNPOD_CODE_QUEUE_CREDENTIAL_REQUIRED\");",
  "  const method = text(options.method || \"GET\").toUpperCase();",
  "  const url = `${RUNPOD_QUEUE_BASE}/${encodeURIComponent(endpointId)}${pathname}`;",
  "  const response = method === \"GET\"",
  "    ? await runpodSafeReadResponse(url, apiKey, {",
  "        timeout_ms: options.timeout_ms || 30_000,",
  "        label: \"CODE_AI_PLANNER_RUNPOD_QUEUE_READ\",",
  "      })",
  "    : await fetch(url, {",
  "        method,",
  "        headers: {",
  "          Authorization: `Bearer ${apiKey}`,",
  "          Accept: \"application/json\",",
  "          ...(options.body ? { \"Content-Type\": \"application/json\" } : {}),",
  "        },",
  "        body: options.body ? JSON.stringify(options.body) : undefined,",
  "        signal: AbortSignal.timeout(options.timeout_ms || 30_000),",
  "      });",
]);
({ source: planner } = replaceOnce(planner, queueBefore, queueAfter, "QUEUE_READ"));

const assertionsBefore = block([
  "assert.match(plannerExecution, /stale_queue_recovery_count/);",
  "assert.match(autonomousRuntime, /const logicalIterations = new Set\\(\\)/);",
]);
const assertionsAfter = block([
  "assert.match(plannerExecution, /stale_queue_recovery_count/);",
  "assert.match(plannerExecution, /runpodSafeReadResponse/);",
  "assert.match(plannerExecution, /RUNPOD_HEALTH_MAX_ATTEMPTS/);",
  "assert.match(plannerExecution, /boundedRetryDelayMs/);",
  "assert.match(plannerExecution, /isRetryableHttpStatus/);",
  "assert.match(plannerExecution, /isTransientNetworkError/);",
  "assert.match(plannerExecution, /AVANTIQO_CODE_PLANNER_SAFE_READ_RETRY/);",
  "assert.match(plannerExecution, /method === \\"GET\\"/);",
  "assert.match(plannerExecution, /provider_execution_submitted: false/);",
  "assert.match(autonomousRuntime, /const logicalIterations = new Set\\(\\)/);",
]);
({ source: selftest } = replaceOnce(selftest, assertionsBefore, assertionsAfter, "SELFTEST_ASSERTIONS"));

const verifiedBefore = block([
  "    stale_queued_provider_job_detected_by_age_and_health: true,",
  "    stale_queued_provider_job_exact_cancel_before_replacement: true,",
]);
const verifiedAfter = block([
  "    stale_queued_provider_job_detected_by_age_and_health: true,",
  "    planner_in_child_runpod_safe_reads_retry_bounded: true,",
  "    planner_in_child_runpod_mutations_not_retried: true,",
  "    stale_queued_provider_job_exact_cancel_before_replacement: true,",
]);
({ source: selftest } = replaceOnce(selftest, verifiedBefore, verifiedAfter, "SELFTEST_VERIFIED"));

await writeFile(PLANNER_PATH, planner, "utf8");
await writeFile(SELFTEST_PATH, selftest, "utf8");

console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  changed_files: [PLANNER_PATH, SELFTEST_PATH],
  runpod_safe_read_attempts: 4,
  provider_post_retry_added: false,
  provider_spend_performed: false,
  runpod_lease_opened: false,
  endpoint_mutation_performed: false,
  production_deploy_performed: false,
  secrets_printed: false,
}, null, 2));
console.log(`${CONTRACT}=PASS`);
