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

test("Studio readiness holds new native generation while the owned lane is busy", () => {
  assert.match(readinessProbe, /const busy = backlog > 0 \|\| running > 0/);
  assert.match(readinessProbe, /ready:\s*!busy/);
  assert.match(readinessProbe, /status:\s*busy \? "BUSY" : "READY"/);
  assert.match(readinessRuntime, /status === "BUSY"/);
  assert.match(readinessRuntime, /Studio will not pile another native generation onto the active lane/);
});

test("server production boundary proves Video readiness before dispatch", () => {
  assert.match(productionRuntime, /CreativeVideoProductionReadinessRuntime\.inspect/);
  assert.match(productionRuntime, /CREATIVE_VIDEO_RUNTIME_BUSY/);
  assert.match(productionRuntime, /CREATIVE_VIDEO_RUNTIME_NOT_READY/);
  const readinessIndex = productionRuntime.indexOf("CreativeVideoProductionReadinessRuntime.inspect");
  const dispatchIndex = productionRuntime.indexOf("ProductionQueueRuntime.dispatchAll");
  assert.ok(readinessIndex >= 0 && dispatchIndex >= 0 && readinessIndex < dispatchIndex);
});

test("Studio queue API exposes readiness and preserves conflict status", () => {
  assert.match(queueRoute, /readiness = await CreativeVideoProductionReadinessRuntime\.inspect/);
  assert.match(queueRoute, /readiness,/);
  assert.match(queueRoute, /status:\s*errorStatus\(error\)/);
  assert.match(queueRoute, /error\?\.readiness/);
});

test("visible Run production control performs preflight and fails closed", () => {
  assert.match(studioControl, /method:\s*"GET"/);
  assert.match(studioControl, /cache:\s*"no-store"/);
  assert.match(studioControl, /blockedByReadiness/);
  assert.match(studioControl, /Cinema busy/);
  assert.match(studioControl, /Cinema unavailable/);
  assert.match(studioControl, /no generation started by preflight/);
  const preflightIndex = studioControl.indexOf("await inspectReadiness({ quiet: true })");
  const postIndex = studioControl.indexOf('method: "POST"');
  assert.ok(preflightIndex >= 0 && postIndex >= 0 && preflightIndex < postIndex);
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
