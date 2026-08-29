import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const certPath = "scripts/certify-code-ai-employee-fast-start-live.mjs";
const usagePath = "lib/platform/service-runtime/usage/UsageRuntime.js";
const [cert, usage] = await Promise.all([
  readFile(certPath, "utf8"),
  readFile(usagePath, "utf8"),
]);

assert.match(usage, /async provider\(\{/);
assert.doesNotMatch(usage, /async list\(/);
assert.match(cert, /UsageRuntime\.provider\(\{/);
assert.doesNotMatch(cert, /UsageRuntime\.list\(/);
assert.match(cert, /createdAtMs >= startedAt/);
assert.match(cert, /text\(entry\?\.capability\) === SERVICE_ID/);
assert.match(cert, /text\(entry\?\.status\)\.toUpperCase\(\) === "SUCCESS"/);

console.log(JSON.stringify({
  success: true,
  contract: "AVANTIQO_CODE_AI_EMPLOYEE_CERTIFICATION_USAGE_AUDIT_V1",
  verified: {
    usage_runtime_provider_api_exists: true,
    nonexistent_usage_runtime_list_api_not_used: true,
    successful_owned_code_usage_required: true,
    usage_must_be_created_during_current_certification: true,
    provider_execution_submitted: false,
    reasoning_calls_consumed: false,
    wallet_mutation_performed: false,
    runpod_mutation_performed: false,
    production_deploy_performed: false,
    secrets_printed: false,
  },
}, null, 2));
