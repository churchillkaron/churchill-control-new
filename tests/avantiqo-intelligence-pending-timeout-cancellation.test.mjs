import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const reasoning = fs.readFileSync("lib/intelligence/runtime/AvantiqoIntelligenceReasoningRuntime.js", "utf8");
const service = fs.readFileSync("lib/platform/service-runtime/execution/ServiceExecutionRuntime.js", "utf8");
const provider = fs.readFileSync("lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceModalDirectRuntime.js", "utf8");
const executor = fs.readFileSync("lib/platform/service-runtime/providers/ProviderExecutorCore.js", "utf8");

test("owned Intelligence settlement has real lane-specific wall-clock deadlines", () => {
  assert.match(reasoning, /FAST_PENDING_SETTLEMENT_DEADLINE_MS\s*=\s*210_000/);
  assert.match(reasoning, /DEEP_PENDING_SETTLEMENT_DEADLINE_MS\s*=\s*300_000/);
  assert.match(reasoning, /const deadlineAt = startedAt \+ deadlineMs/);
  assert.match(reasoning, /Math\.min\(remainingMs, SETTLEMENT_CALL_MAX_MS\)/);
});

test("timed out reasoning cancels only its exact provider job", () => {
  assert.match(reasoning, /ServiceExecutionRuntime\.cancelPending\(\{/);
  assert.match(reasoning, /provider_job_id: providerJobId/);
  assert.match(reasoning, /usage_id: usageId/);
  assert.match(reasoning, /exact_provider_job_cleanup: true/);
  assert.match(executor, /const cancelFunction = runtime\.cancel \|\| runtime\.cancelJob \|\| runtime\.cancelExecution/);
});

test("Modal Intelligence cancellation never terminates the shared worker container", () => {
  assert.match(provider, /call\.cancel\(\{ terminateContainers: false \}\)/);
  assert.match(provider, /exact_job_only: true/);
  assert.match(provider, /terminate_containers: false/);
});

test("Service cancellation fails only the bound usage and releases its reservation", () => {
  assert.match(service, /export async function cancelPendingService/);
  assert.match(service, /usage\.organization_id !== organization_id/);
  assert.match(service, /usage\.provider && usage\.provider !== provider/);
  assert.match(service, /UsageRuntime\.fail\(\{/);
  assert.match(service, /WalletRuntime\.release\(\{/);
  assert.match(service, /reference: usage_id/);
});
