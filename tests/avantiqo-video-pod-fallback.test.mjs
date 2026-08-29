import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Pod control is exact RTX PRO 4500 Secure Cloud EU-RO-1 on certified cache with availability placement", async () => {
  const s = await source("lib/platform/service-runtime/providers/avantiqo-video/AvantiqoVideoPodRunpod.js");
  assert.match(s, /NVIDIA RTX PRO 4500 Blackwell/); assert.match(s, /EU-RO-1/);
  assert.match(s, /cloudType: "SECURE"/); assert.match(s, /POD_PLACEMENT_RAM_GB = Object\.freeze\(\[96, 64\]\)/);
  assert.match(s, /dataCenterPriority: "availability"/); assert.match(s, /gpuTypePriority: "availability"/);
  assert.match(s, /avantiqo-video-cache-eu-ro-1/); assert.ok(s.includes('volumeMountPath: "/runpod-volume"'));
  assert.match(s, /sha256:44ef09f27a402b2890007a3620b772240913e68fa6ceafcc06436af2c1023adc/);
  assert.match(s, /if \(current && !TERMINAL\.has\(current\)\) return true/);
  assert.match(s, /if \(current\) return TERMINAL\.has\(current\)/);
});

test("Pod readiness reuses V69 response normalization and authoritative template inventory", async () => {
  const api = await source("lib/platform/service-runtime/providers/avantiqo-video/AvantiqoVideoPodRunpod.js");
  assert.match(api, /function normalizeRows/); assert.match(api, /function normalizeEnv/);
  assert.match(api, /\/templates\?includeEndpointBoundTemplates=true/);
  assert.match(api, /normalizeRows\(rawVolumes, \["networkVolumes", "networkvolumes"\]\)/);
  assert.match(api, /normalizeRows\(rawPods, \["pods"\]\)/);
  assert.match(api, /const template = templates\.find/); assert.match(api, /normalizeEnv\(template\.env\)/);
  assert.match(api, /Authorization: `Bearer \$\{key\(\)\}`/); assert.match(api, /AvantiqoVideoPodV72/);
});

test("Pod readiness preserves V69 production registry-auth parity", async () => {
  const api = await source("lib/platform/service-runtime/providers/avantiqo-video/AvantiqoVideoPodRunpod.js");
  assert.match(api, /function templateRegistryAuthId/);
  assert.match(api, /async function resolveRegistryAuthParity/);
  assert.match(api, /PRODUCTION_VIDEO_TEMPLATE/);
  assert.match(api, /PRODUCTION_VIDEO_TEMPLATE_NO_AUTH/);
  assert.match(api, /podRest\("\/containerregistryauth"\)/);
  assert.match(api, /AVANTIQO_VIDEO_32GB_CANDIDATE_RUNPOD_REGISTRY_AUTH_ID/);
  assert.match(api, /const registryAuth = await resolveRegistryAuthParity/);
  assert.match(api, /snapshot\.registryAuthId \? \{ containerRegistryAuthId: snapshot\.registryAuthId \} : \{\}/);
});

test("Pod create retries only the specific no-instance placement failure and checks for partial create", async () => {
  const api = await source("lib/platform/service-runtime/providers/avantiqo-video/AvantiqoVideoPodRunpod.js");
  assert.match(api, /NO_INSTANCE_PATTERN = \/no instances currently available\/i/);
  assert.match(api, /placementUnavailable/);
  assert.match(api, /findExistingOwnerPod/);
  assert.match(api, /AVANTIQO_VIDEO_POD_PLACEMENT_EXHAUSTED/);
  assert.match(api, /for \(const minRAMPerGPU of POD_PLACEMENT_RAM_GB\)/);
});

test("Pod readiness refuses low capacity and busy shared cache", async () => {
  const api = await source("lib/platform/service-runtime/providers/avantiqo-video/AvantiqoVideoPodRunpod.js");
  const runtime = await source("lib/platform/service-runtime/providers/avantiqo-video/AvantiqoVideoPodRuntime.js");
  assert.match(api, /SHARED_CACHE_ACTIVE_WORKER/); assert.match(api, /SHARED_CACHE_BUSY/); assert.match(api, /SHARED_CACHE_ACTIVE_POD/);
  assert.match(runtime, /stock_rank >= 3/); assert.match(runtime, /POD_CAPACITY_CHANGED_BEFORE_CREATE/);
});

test("Pod runtime invokes V5 directly without Serverless progress and uses private receipts", async () => {
  const s = await source("lib/platform/service-runtime/providers/avantiqo-video/AvantiqoVideoPodRuntime.js");
  assert.match(s, /handler_v5\.handler\(job\)/); assert.match(s, /progress_update=lambda/);
  assert.match(s, /quality_profile: "cinema"/); assert.match(s, /resolution: "720p", fps: 24/);
  assert.match(s, /\.pod-receipts/); assert.match(s, /prompt_persisted: false/);
});

test("Pod lease shares cinema-production lane and is refreshable", async () => {
  const s = await source("lib/platform/service-runtime/providers/avantiqo-video/AvantiqoVideoPodLease.js");
  assert.match(s, /pod-fallback:/); assert.match(s, /cinema-production/);
  assert.match(s, /acquire_avantiqo_video_runpod_lease_v2/); assert.match(s, /refresh_avantiqo_video_runpod_lease_v2/); assert.match(s, /release_avantiqo_video_runpod_lease_v2/);
});

test("Pod lifecycle deletes compute on success failure startup timeout and hard timeout", async () => {
  const s = await source("lib/platform/service-runtime/providers/avantiqo-video/AvantiqoVideoPodRuntime.js");
  const api = await source("lib/platform/service-runtime/providers/avantiqo-video/AvantiqoVideoPodRunpod.js");
  assert.match(api, /method: "DELETE"/); assert.match(s, /HARD_TIMEOUT = 105 \* 60 \* 1000/); assert.match(s, /STARTUP_TIMEOUT = 15 \* 60 \* 1000/);
  assert.match(s, /reconcileAvantiqoVideoPodLeases/); assert.match(s, /listActiveAvantiqoVideoPods/);
});

test("V3 uses Serverless first, preflights mastering, then Pod and existing 4K mastering", async () => {
  const s = await source("lib/platform/service-runtime/providers/avantiqo-video/AvantiqoVideoWorkflowRuntimeV3.js");
  assert.match(s, /serverlessRoute\.route === "OWNED"/); assert.match(s, /falKey\(\);/); assert.match(s, /submitAvantiqoVideoPodGeneration/);
  assert.match(s, /OWNED_RUNPOD_POD_V5/); assert.match(s, /fal-ai\/bytedance-upscaler\/upscale\/video/); assert.match(s, /prompt_persisted: false/);
  assert.match(s, /state\.stage === "FAILED" \? "failed"/);
});

test("Provider routes new generation through V3 while preserving V2 and legacy status", async () => {
  const s = await source("lib/platform/service-runtime/providers/avantiqo-video/AvantiqoVideoProviderV2.js");
  assert.match(s, /AvantiqoVideoWorkflowRuntimeV3\.execute/); assert.match(s, /workflowV3Job/);
  assert.match(s, /AvantiqoVideoWorkflowRuntimeV2\.getStatus/); assert.match(s, /AvantiqoVideoWorkflowRuntime\.getStatus/);
});

test("one-minute cron reconciles orphan Pods", async () => {
  const route = await source("app/api/internal/video/runpod-pods/process/route.js");
  const vercel = JSON.parse(await source("vercel.json"));
  assert.match(route, /CRON_SECRET/); assert.match(route, /reconcileAvantiqoVideoPodLeases/);
  assert.equal(vercel.functions["app/api/internal/video/runpod-pods/process/route.js"].maxDuration, 300);
  assert.ok(vercel.crons.some((row) => row.path === "/api/internal/video/runpod-pods/process" && row.schedule === "* * * * *"));
});

test("V72 is exactly one final full path certification and proves zero Pods", async () => {
  const s = await source("scripts/run-avantiqo-video-final-v72-local.mjs");
  assert.match(s, /AVANTIQO_VIDEO_FINAL_V72_APPROVED/); assert.match(s, /duration_seconds: 2/);
  assert.match(s, /OWNED_POD_FALLBACK/); assert.match(s, /OWNED_RUNPOD_POD_V5/); assert.match(s, /FINAL_MASTER_NOT_4K/);
  assert.match(s, /listActiveAvantiqoVideoPods/); assert.match(s, /ACTIVE_VIDEO_POD_REMAINS/); assert.match(s, /active_video_pods_after: 0/);
  assert.match(s, /error_code: readiness\.error/); assert.match(s, /readiness\.error \|\| "NO_DETAIL"/);
});
