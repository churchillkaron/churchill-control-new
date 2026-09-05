import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const readinessProbe = fs.readFileSync(
  "lib/platform/service-runtime/providers/avantiqo-video/AvantiqoVideoReadinessRuntime.js",
  "utf8",
);
const readinessRuntime = fs.readFileSync(
  "lib/creative/video/runtime/CreativeVideoProductionReadinessRuntime.js",
  "utf8",
);
const productionRuntime = fs.readFileSync(
  "lib/creative/production/runtime/ProductionRuntime.js",
  "utf8",
);
const taskRuntime = fs.readFileSync(
  "lib/operations/tasks/runtime/ProductionTaskRuntime.js",
  "utf8",
);
const taskRepository = fs.readFileSync(
  "lib/operations/tasks/repositories/ProductionTaskRepository.js",
  "utf8",
);
const queueRoute = fs.readFileSync(
  "app/api/creative/production/queue/route.js",
  "utf8",
);
const studioControl = fs.readFileSync(
  "components/creative/ProductionStudio/actions/RunProductionButton.jsx",
  "utf8",
);
const registration = fs.readFileSync(
  "lib/platform/service-runtime/providers/avantiqo-video/AvantiqoVideoProviderRegistration.js",
  "utf8",
);

test("Studio readiness checks deployed Modal control plane without spawning generation", () => {
  assert.match(readinessProbe, /functions\.fromName\(APP_NAME, FUNCTION_NAME/);
  assert.match(readinessProbe, /getCurrentStats\(\)/);
  assert.match(readinessProbe, /generation_spawned:\s*false/);
  assert.match(readinessProbe, /paid_inference_performed:\s*false/);
  assert.equal(readinessProbe.includes(".spawn("), false);
  assert.equal(readinessProbe.includes(".remote("), false);
});

test("Studio readiness serializes owned native generation without freezing active work", () => {
  assert.match(readinessProbe, /const busy = backlog > 0 \|\| running > 0/);
  assert.match(readinessProbe, /ready:\s*!busy/);
  assert.match(readinessProbe, /status:\s*busy \? "BUSY" : "READY"/);
  assert.match(readinessRuntime, /running_task_count/);
  assert.match(readinessRuntime, /pending_task_count/);
  assert.match(readinessRuntime, /This project has native Video work in flight/);
  assert.match(readinessRuntime, /occupied by other work/);
});

test("provider-backed production uses database task leases before dispatch and settlement", () => {
  assert.match(taskRepository, /claim_creative_production_task/);
  assert.match(taskRepository, /lease_running_creative_production_task/);
  assert.match(taskRepository, /release_creative_production_task_lease/);
  assert.match(taskRuntime, /Repository\.claimForExecution/);
  assert.match(taskRuntime, /Repository\.leaseRunning/);
  assert.match(taskRuntime, /Repository\.releaseLease/);
  const claimIndex = taskRuntime.indexOf("Repository.claimForExecution");
  const executeIndex = taskRuntime.indexOf("runAIService.execute");
  assert.ok(claimIndex >= 0 && executeIndex >= 0 && claimIndex < executeIndex);
  const leaseIndex = taskRuntime.indexOf("Repository.leaseRunning");
  const settleIndex = taskRuntime.indexOf("ServiceExecutionRuntime.settle");
  assert.ok(leaseIndex >= 0 && settleIndex >= 0 && leaseIndex < settleIndex);
});

test("server production boundary polls active Video work before gating another generation", () => {
  assert.match(productionRuntime, /CreativeVideoProductionReadinessRuntime\.inspect/);
  assert.match(productionRuntime, /ProductionQueueRuntime\.pollRunning/);
  assert.match(productionRuntime, /CREATIVE_VIDEO_RUNTIME_BUSY/);
  assert.match(productionRuntime, /CREATIVE_VIDEO_RUNTIME_NOT_READY/);
  const pollIndex = productionRuntime.indexOf("ProductionQueueRuntime.pollRunning");
  const gateIndex = productionRuntime.indexOf("if (videoReadiness.required && !videoReadiness.ready)");
  const dispatchIndex = productionRuntime.indexOf("ProductionQueueRuntime.dispatchAll");
  assert.ok(pollIndex >= 0 && gateIndex >= 0 && dispatchIndex >= 0);
  assert.ok(pollIndex < gateIndex && gateIndex < dispatchIndex);
});

test("poll-only production boundary can settle provider state without dispatching generation", () => {
  assert.match(productionRuntime, /async pollProduction/);
  assert.match(productionRuntime, /mode:\s*"POLL_ONLY"/);
  const pollStart = productionRuntime.indexOf("async pollProduction");
  const runStart = productionRuntime.indexOf("async runProduction");
  const pollBody = productionRuntime.slice(pollStart, runStart);
  assert.match(pollBody, /ProductionQueueRuntime\.pollRunning/);
  assert.equal(pollBody.includes("ProductionQueueRuntime.dispatchAll"), false);
});

test("Studio queue API exposes readiness, poll-only PATCH, and preserves conflict status", () => {
  assert.match(queueRoute, /readiness = await CreativeVideoProductionReadinessRuntime\.inspect/);
  assert.match(queueRoute, /export async function PATCH/);
  assert.match(queueRoute, /ProductionRuntime\.pollProduction/);
  assert.match(queueRoute, /readiness,/);
  assert.match(queueRoute, /status:\s*errorStatus\(error\)/);
  assert.match(queueRoute, /error\?\.readiness/);
});

test("visible production control preflights, auto-polls active work, and continues the authorized graph when Video settles", () => {
  assert.match(studioControl, /method:\s*"GET"/);
  assert.match(studioControl, /method:\s*"PATCH"/);
  assert.match(studioControl, /method:\s*"POST"/);
  assert.match(studioControl, /ACTIVE_POLL_MS = 5000/);
  assert.match(studioControl, /window\.setInterval/);
  assert.match(studioControl, /pollingRef/);
  assert.match(studioControl, /continuationRef/);
  assert.match(studioControl, /shouldContinue/);
  assert.match(studioControl, /dispatchProduction\(\{ automatic: true \}\)/);
  assert.match(studioControl, /Continuing production/);
  assert.match(studioControl, /blockedByReadiness/);
  assert.match(studioControl, /Cinema producing/);
  assert.match(studioControl, /Cinema busy/);
  assert.match(studioControl, /Cinema unavailable/);
  assert.match(studioControl, /no generation started by preflight/);
  assert.match(studioControl, /activeProjectVideo/);

  const patchIndex = studioControl.indexOf('method: "PATCH"');
  const automaticIndex = studioControl.indexOf("dispatchProduction({ automatic: true })");
  assert.ok(patchIndex >= 0 && automaticIndex >= 0 && patchIndex < automaticIndex);
});

test("provider registry matches the native Studio B200 master path", () => {
  assert.match(registration, /MODAL_FUNCTION_NAME = "generate_native_job"/);
  assert.match(registration, /NATIVE_MASTER_MODEL = "avantiqo-ltx-2\.5"/);
  assert.match(registration, /NATIVE_MASTER_RESOLUTION = "3840x2176"/);
  assert.match(registration, /NATIVE_MASTER_FPS = 24/);
  assert.match(registration, /NATIVE_MASTER_STEPS = 30/);
  assert.match(registration, /NATIVE_MASTER_GPU = "B200"/);
  assert.match(registration, /supported_resolutions:\s*\["2160p"\]/);
  assert.match(registration, /transport_adapter_max_containers:\s*4/);
  assert.match(registration, /max_gpu_containers:\s*1/);
});
