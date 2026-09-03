import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const modalWorker = fs.readFileSync(
  "lib/platform/service-runtime/providers/avantiqo-owned/AvantiqoOwnedModalWorker.js",
  "utf8",
);
const videoProvider = fs.readFileSync(
  "lib/platform/service-runtime/providers/avantiqo-video/AvantiqoVideoProviderV2.js",
  "utf8",
);
const productionQueueRuntime = fs.readFileSync(
  "lib/creative/production/queue/runtime/ProductionQueueRuntime.js",
  "utf8",
);
const productionTaskRuntime = fs.readFileSync(
  "lib/operations/tasks/runtime/ProductionTaskRuntime.js",
  "utf8",
);
const serviceExecutionRuntime = fs.readFileSync(
  "lib/platform/service-runtime/execution/ServiceExecutionRuntime.js",
  "utf8",
);
const providerExecutorCore = fs.readFileSync(
  "lib/platform/service-runtime/providers/ProviderExecutorCore.js",
  "utf8",
);

function section(source, startMarker, endMarker = null) {
  const start = source.indexOf(startMarker);
  assert.ok(start >= 0, `missing source marker: ${startMarker}`);
  if (!endMarker) return source.slice(start);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.ok(end > start, `missing source marker: ${endMarker}`);
  return source.slice(start, end);
}

test("Video direct Modal execution creates exactly one durable FunctionCall", () => {
  assert.equal(
    (modalWorker.match(/\.spawn\(/g) || []).length,
    1,
    "shared direct Modal transport must expose one submission primitive only",
  );
  assert.match(modalWorker, /const call = await worker\.spawn\(\[payload\]\)/);
  assert.match(modalWorker, /const rawJobId = text\(call\.functionCallId\)/);
  assert.match(
    modalWorker,
    /provider_job_id:\s*`\$\{jobPrefix\}\$\{rawJobId\}`/,
  );
  assert.match(modalWorker, /status:\s*"queued"/);
});

test("Video polling resumes the exact Modal FunctionCall and cannot submit a second render", () => {
  const getStatus = section(modalWorker, "async getStatus(input = {})");
  assert.match(getStatus, /const rawJobId = jobId\.slice\(jobPrefix\.length\)/);
  assert.match(getStatus, /const call = await client\.functionCalls\.fromId\(rawJobId\)/);
  assert.match(getStatus, /const result = await call\.get\(\{ timeoutMs: 0 \}\)/);
  assert.doesNotMatch(
    getStatus,
    /\.spawn\(/,
    "polling must never create another Modal FunctionCall",
  );

  const lookupIndex = getStatus.indexOf("client.functionCalls.fromId(rawJobId)");
  const pollIndex = getStatus.indexOf("call.get({ timeoutMs: 0 })");
  assert.ok(lookupIndex >= 0 && pollIndex > lookupIndex);
});

test("Studio queue advances running Video tasks through settlement, not provider re-execution", () => {
  assert.match(
    productionQueueRuntime,
    /async pollRunning\(input,[\s\S]*ProductionTaskRuntime\.poll\(task\.id\)/,
  );
  assert.match(
    productionQueueRuntime,
    /if \(pollRunning\)[\s\S]*this\.pollRunning\(input/,
  );

  const poll = section(
    productionTaskRuntime,
    "async poll(id)",
    "async dispatch(id)",
  );
  assert.match(poll, /ServiceExecutionRuntime\.settle\(\{/);
  assert.match(poll, /provider_job_id:\s*pending\.provider_job_id/);
  assert.doesNotMatch(
    poll,
    /runAIService\.execute\(/,
    "RUNNING task polling must not execute the Video service again",
  );
  assert.match(poll, /return this\.complete\(id, \{/);
});

test("Service settlement preserves the same provider job identity into Video getStatus", () => {
  const settlement = section(
    serviceExecutionRuntime,
    "export async function settlePendingService(input = {})",
    "export const ServiceExecutionRuntime",
  );
  assert.match(settlement, /const result = await getProviderStatus\(\{/);
  assert.match(settlement, /job_id:\s*provider_job_id/);
  assert.doesNotMatch(
    settlement,
    /executeProvider\(\{/,
    "settlement must query the existing job, never execute a replacement job",
  );

  const providerStatus = section(
    providerExecutorCore,
    "export async function getProviderStatus({ provider, job_id, input = {}, context = {} })",
    "export const ProviderExecutor",
  );
  assert.match(providerStatus, /const runtime = await loadProviderRuntime\(provider\)/);
  assert.match(providerStatus, /const statusFunction = runtime\.getStatus \|\| runtime\.poll \|\| runtime\.status/);
  assert.match(providerStatus, /job_id,/);
  assert.match(providerStatus, /provider_job_id:\s*job_id/);
  assert.match(providerStatus, /return statusFunction\.call\(runtime, \{/);

  assert.match(videoProvider, /if \(modalVideoJob\(suppliedJobId\)\)/);
  assert.match(videoProvider, /return modalVideoWorker\.getStatus\(\{/);
  assert.match(videoProvider, /job_id:\s*suppliedJobId/);
  assert.match(videoProvider, /provider_job_id:\s*suppliedJobId/);
});

test("completed Video polling materializes the canonical asset without another provider call", () => {
  const complete = section(
    productionTaskRuntime,
    "async complete(id, output = {})",
    "async markCompleted(id, output = {})",
  );
  assert.match(
    complete,
    /CreativeAssetGraphRuntime\.createFromProductionTask\(\{[\s\S]*task,[\s\S]*output,/,
  );
  assert.match(complete, /status:\s*PRODUCTION_TASK_STATUS\.COMPLETED/);
  assert.match(complete, /asset_node_id:\s*assetNode\?\.id \|\| null/);
  assert.doesNotMatch(
    complete,
    /runAIService\.execute\(/,
    "completion/materialization must not contact the Video provider again",
  );
});
