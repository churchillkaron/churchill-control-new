import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const readinessProbe=fs.readFileSync("lib/platform/service-runtime/providers/avantiqo-video/AvantiqoVideoReadinessRuntime.js","utf8");
const readinessRuntime=fs.readFileSync("lib/creative/video/runtime/CreativeVideoProductionReadinessRuntime.js","utf8");
const productionRuntime=fs.readFileSync("lib/creative/production/runtime/ProductionRuntime.js","utf8");
const taskRuntime=fs.readFileSync("lib/operations/tasks/runtime/ProductionTaskRuntime.js","utf8");
const taskRepository=fs.readFileSync("lib/operations/tasks/repositories/ProductionTaskRepository.js","utf8");
const queueRoute=fs.readFileSync("app/api/creative/production/queue/route.js","utf8");
const studioControl=fs.readFileSync("components/creative/ProductionStudio/actions/RunProductionButton.jsx","utf8");
const registration=fs.readFileSync("lib/platform/service-runtime/providers/avantiqo-video/AvantiqoVideoProviderRegistration.js","utf8");

test("Studio readiness probes Node01 availability without spawning generation",()=>{
  assert.match(readinessProbe,/AVANTIQO_VIDEO_LOCAL_READINESS_V2/);
  assert.match(readinessProbe,/AvantiqoVideoLocalQueueProvider\.available\(\)/);
  assert.match(readinessProbe,/generation_spawned: false/);
  assert.match(readinessProbe,/paid_inference_performed: false/);
  assert.match(readinessProbe,/local_video_worker_implemented: true/);
  assert.doesNotMatch(readinessProbe,/\.execute\(/);
});

test("Studio readiness reports real local node availability and remains fail closed",()=>{
  assert.match(readinessProbe,/local_video_node_available: localNodeAvailable/);
  assert.match(readinessProbe,/status: ready[\s\S]*"READY"[\s\S]*"LOCAL_VIDEO_NODE_UNAVAILABLE"/);
  assert.match(readinessProbe,/AVANTIQO_VIDEO_LOCAL_NODE_UNAVAILABLE/);
  assert.match(readinessRuntime,/running_task_count/);
  assert.match(readinessRuntime,/pending_task_count/);
  assert.match(readinessRuntime,/readiness could not be proven without starting generation/);
});

test("provider-backed production uses database task leases before dispatch and settlement",()=>{
  assert.match(taskRepository,/claim_creative_production_task/);
  assert.match(taskRepository,/lease_running_creative_production_task/);
  assert.match(taskRepository,/release_creative_production_task_lease/);
  assert.match(taskRuntime,/Repository\.claimForExecution/);
  assert.match(taskRuntime,/Repository\.leaseRunning/);
  assert.match(taskRuntime,/Repository\.releaseLease/);
  assert.ok(taskRuntime.indexOf("Repository.claimForExecution") < taskRuntime.indexOf("runAIService.execute"));
  assert.ok(taskRuntime.indexOf("Repository.leaseRunning") < taskRuntime.indexOf("ServiceExecutionRuntime.settle"));
});

test("server production boundary polls active Video work before another dispatch",()=>{
  assert.match(productionRuntime,/CreativeVideoProductionReadinessRuntime\.inspect/);
  assert.match(productionRuntime,/ProductionQueueRuntime\.pollRunning/);
  assert.match(productionRuntime,/CREATIVE_VIDEO_RUNTIME_NOT_READY/);
  const poll=productionRuntime.indexOf("ProductionQueueRuntime.pollRunning");
  const gate=productionRuntime.indexOf("if (videoReadiness.required && !videoReadiness.ready)");
  const dispatch=productionRuntime.indexOf("ProductionQueueRuntime.dispatchAll");
  assert.ok(poll >= 0 && gate > poll && dispatch > gate);
});

test("poll-only production settles provider state without dispatching generation",()=>{
  const start=productionRuntime.indexOf("async pollProduction");
  const end=productionRuntime.indexOf("async runProduction");
  const body=productionRuntime.slice(start,end);
  assert.match(body,/ProductionQueueRuntime\.pollRunning/);
  assert.doesNotMatch(body,/ProductionQueueRuntime\.dispatchAll/);
});

test("Studio queue API exposes readiness and poll-only PATCH",()=>{
  assert.match(queueRoute,/CreativeVideoProductionReadinessRuntime\.inspect/);
  assert.match(queueRoute,/export async function PATCH/);
  assert.match(queueRoute,/ProductionRuntime\.pollProduction/);
  assert.match(queueRoute,/status:\s*errorStatus\(error\)/);
});

test("visible production control preflights and auto-polls active work",()=>{
  assert.match(studioControl,/method:\s*"GET"/);
  assert.match(studioControl,/method:\s*"PATCH"/);
  assert.match(studioControl,/method:\s*"POST"/);
  assert.match(studioControl,/ACTIVE_POLL_MS = 5000/);
  assert.match(studioControl,/window\.setInterval/);
  assert.match(studioControl,/dispatchProduction\(\{ automatic: true \}\)/);
  assert.match(studioControl,/no generation started by preflight/);
});

test("provider registry advertises only current Node01 generation characteristics",()=>{
  assert.match(registration,/local_only_execution: true/);
  assert.match(registration,/modal_fallback_allowed: false/);
  assert.match(registration,/PRODUCTION_GPU = "NODE01_LOCAL_GPU_6GB_CPU_OFFLOAD"/);
  assert.match(registration,/LOCAL_DEFAULT_RESOLUTION = "608x352"/);
  assert.match(registration,/allowed_duration_seconds: \[1, 8\]/);
  assert.match(registration,/supported_generation_resolutions: LOCAL_SUPPORTED_RESOLUTIONS/);
  assert.match(registration,/delivery_upscale_engine: null/);
});
