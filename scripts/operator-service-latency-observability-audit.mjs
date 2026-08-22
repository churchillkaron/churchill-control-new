import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [recordSource, usageSource, executorSource, executorCoreSource] = await Promise.all([
  readFile("lib/platform/service-runtime/usage/documents/ServiceUsageRecord.js", "utf8"),
  readFile("lib/platform/service-runtime/usage/UsageRuntime.js", "utf8"),
  readFile("lib/platform/service-runtime/providers/ProviderExecutor.js", "utf8"),
  readFile("lib/platform/service-runtime/providers/ProviderExecutorCore.js", "utf8"),
]);

assert.match(recordSource, /data\.metadata\?\.module/);
assert.match(recordSource, /provider_model:/);
assert.match(recordSource, /data\.metadata\?\.model/);
assert.match(recordSource, /provider_latency_ms:/);

assert.match(usageSource, /function providerLatency/);
assert.match(usageSource, /__provider_latency_ms/);
assert.match(usageSource, /provider_latency_ms:\s*measuredProviderLatency/);
assert.match(usageSource, /provider_model:\s*model/);
assert.match(usageSource, /object\(metadata\)\.module/);

assert.match(executorSource, /executeProviderCore/);
assert.match(executorSource, /getProviderStatusCore/);
assert.match(executorSource, /Object\.defineProperty/);
assert.match(executorSource, /__provider_latency_ms/);
assert.match(executorSource, /enumerable:\s*false/);
assert.match(executorSource, /Date\.now\(\) - startedAt/);
assert.match(executorCoreSource, /assertProviderExecutionFunded/);
assert.match(executorCoreSource, /assertGovernedOpenAIExecution/);
assert.match(executorCoreSource, /prepareProviderInputForExecution/);

for (const source of [recordSource, usageSource, executorSource]) {
  assert.doesNotMatch(source, /console\.(?:log|info)\([^\n]*(?:prompt|transcript|message)/i);
}

console.log("OPERATOR_SERVICE_LATENCY_OBSERVABILITY_AUDIT=PASS");
console.log("SERVICE_USAGE_MODULE=TOP_LEVEL_FROM_GOVERNED_METADATA");
console.log("SERVICE_USAGE_PROVIDER_MODEL=TOP_LEVEL_SELECTED_MODEL");
console.log("SERVICE_USAGE_PROVIDER_LATENCY=PROVIDER_EXECUTOR_BOUNDARY");
console.log("SERVICE_USAGE_PROVIDER_LATENCY_PRIVATE=NON_ENUMERABLE_RUNTIME_SIGNAL");
console.log("OPERATOR_LATENCY_PRIVACY=NO_RAW_USER_CONTENT_LOGGING_ADDED");
