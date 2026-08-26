import process from "node:process";
import {
  CODE_AI_CERTIFICATION_RESILIENCE_CONTRACT,
  RUNPOD_HEALTH_MAX_ATTEMPTS,
  boundedRetryDelayMs,
  isRetryableHttpStatus,
  isRunpodHealthRequest,
  isTransientNetworkError,
} from "../lib/code/runtime/CodeAICertificationResiliencePolicy.js";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const originalFetch = globalThis.fetch;
if (typeof originalFetch !== "function") {
  throw new Error("CODE_AI_CERTIFICATION_FETCH_REQUIRED");
}

globalThis.fetch = async function codeCertificationResilientFetch(input, init = {}) {
  if (!isRunpodHealthRequest(input, init)) {
    return originalFetch(input, init);
  }

  let lastError = null;
  for (let attempt = 0; attempt < RUNPOD_HEALTH_MAX_ATTEMPTS; attempt += 1) {
    try {
      const response = await originalFetch(input, init);
      if (!isRetryableHttpStatus(response.status) || attempt === RUNPOD_HEALTH_MAX_ATTEMPTS - 1) {
        return response;
      }
      lastError = new Error(`RUNPOD_HEALTH_HTTP_${response.status}`);
    } catch (error) {
      lastError = error;
      if (!isTransientNetworkError(error) || attempt === RUNPOD_HEALTH_MAX_ATTEMPTS - 1) {
        throw error;
      }
    }

    console.log(JSON.stringify({
      event: "AVANTIQO_CODE_SAFE_LEASE_HEALTH_RETRY",
      contract: CODE_AI_CERTIFICATION_RESILIENCE_CONTRACT,
      attempt: attempt + 1,
      max_attempts: RUNPOD_HEALTH_MAX_ATTEMPTS,
      reason: String(lastError?.message || lastError).slice(0, 180),
      provider_execution_submitted: false,
      endpoint_mutation_performed: false,
      production_deploy_performed: false,
      secrets_printed: false,
    }));
    await sleep(boundedRetryDelayMs(attempt));
  }

  throw lastError || new Error("CODE_AI_RUNPOD_HEALTH_RETRY_EXHAUSTED");
};

const split = process.argv.indexOf("--");
if (split < 0 || process.argv.length <= split + 1) {
  throw new Error("CODE_AI_CERTIFICATION_COMMAND_REQUIRED_AFTER_DOUBLE_DASH");
}

const control = process.argv.slice(2, split);
const command = process.argv.slice(split + 1);
process.argv = [
  process.argv[0],
  process.argv[1],
  ...control,
  "--",
  process.execPath,
  "scripts/run-code-ai-safe-lease-child-guard-local.mjs",
  "--",
  ...command,
];

console.log(JSON.stringify({
  event: "AVANTIQO_CODE_SAFE_LEASE_RESILIENCE_ACTIVE",
  contract: CODE_AI_CERTIFICATION_RESILIENCE_CONTRACT,
  runpod_health_max_attempts: RUNPOD_HEALTH_MAX_ATTEMPTS,
  child_guard_enabled: true,
  shared_safe_lease_source_modified: false,
  production_deploy_performed: false,
  secrets_printed: false,
}));

await import("./run-avantiqo-runpod-safe-lease-v2-local.mjs");
