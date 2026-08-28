#!/usr/bin/env node

const CONTRACT = "AVANTIQO_VIDEO_FIRST_GOOGLE_NATIVE_4K_PRODUCTION_V65";
const WORKFLOW_CONTRACT = "AVANTIQO_VIDEO_RESILIENT_ROUTED_WORKFLOW_V2";
const WORKFLOW_JOB_PREFIX = "video-workflow-v2:";
const BUCKET = "creative-assets";
const ORGANIZATION_ID = "00000000-0000-0000-0000-000000000000";
const USAGE_ID = "video-v65-google-native4k-production-20260828";
const STATE_PATH = `${ORGANIZATION_ID}/generated/avantiqo-video/.workflow-v2/${USAGE_ID}.json`;
const EXPECTED_BACKEND = "MANAGED_GOOGLE_VEO_3_1_FAST_NATIVE_4K";
const EXPECTED_MASTERING = "NATIVE_GOOGLE_VEO_4K";
const POLL_MS = 10_000;
const TIMEOUT_MS = 35 * 60 * 1000;

function text(value) { return String(value ?? "").trim(); }
function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function approved(name) {
  if (text(process.env[name]).toUpperCase() !== "YES") {
    throw new Error(`${name}=YES_REQUIRED`);
  }
}
function safeResult(result = {}) {
  return {
    provider: result?.provider || null,
    provider_job_id: result?.provider_job_id || result?.output?.provider_job_id || null,
    status: result?.status || result?.output?.status || null,
    stage: result?.stage || result?.output?.stage || null,
    route: result?.route || result?.output?.route || null,
    route_reason: result?.route_reason || result?.output?.route_reason || null,
    generation_backend: result?.generation_backend || result?.output?.generation_backend || null,
    mastering_backend: result?.mastering_backend || result?.output?.mastering_backend || null,
    runpod_lease_active: result?.runpod_lease_active ?? result?.output?.runpod_lease_active ?? null,
    internal_generation_resolution:
      result?.internal_generation_resolution || result?.output?.internal_generation_resolution || null,
    final_master_resolution:
      result?.final_master_resolution || result?.output?.final_master_resolution || null,
    customer_visible_provider:
      result?.customer_visible_provider || result?.output?.customer_visible_provider || null,
    storage_reference: result?.storage_reference || result?.output?.storage_reference || null,
    video_url:
      result?.video_url || result?.result || result?.output?.video_url || result?.output?.result || null,
    error: result?.error || null,
  };
}

approved("AVANTIQO_VIDEO_V65_GOOGLE_NATIVE_4K_PAID_APPROVED");

const [
  { AvantiqoVideoProviderV2 },
  { resolveAvantiqoVideoRoute },
  { getServiceSupabase },
] = await Promise.all([
  import("../lib/platform/service-runtime/providers/avantiqo-video/AvantiqoVideoProviderV2.js"),
  import("../lib/platform/service-runtime/providers/avantiqo-video/AvantiqoVideoCapacityRouter.js"),
  import("../lib/shared/supabase/service.js"),
]);

if (
  typeof AvantiqoVideoProviderV2?.execute !== "function" ||
  typeof AvantiqoVideoProviderV2?.getStatus !== "function"
) {
  throw new Error(`${CONTRACT}_PROVIDER_V2_IMPORT_INVALID`);
}

const routeBefore = await resolveAvantiqoVideoRoute({
  capability: "ai.video.generate",
  forceRefresh: true,
});
console.log(`AVANTIQO_VIDEO_V65_ROUTE_PREFLIGHT=${JSON.stringify({
  route: routeBefore.route,
  reason: routeBefore.reason,
  fallback_ready: routeBefore.fallback_ready === true,
  best_stock: routeBefore.capacity?.best_stock || null,
  workers_min: routeBefore.capacity?.workers_min ?? null,
  workers_max: routeBefore.capacity?.workers_max ?? null,
  active_management_workers: routeBefore.capacity?.active_management_workers ?? null,
})}`);

if (routeBefore.route !== "MANAGED_FALLBACK") {
  throw new Error(`${CONTRACT}_MANAGED_FALLBACK_REQUIRED:${routeBefore.route}:${routeBefore.reason}`);
}
if ((routeBefore.capacity?.workers_min ?? 0) !== 0 || (routeBefore.capacity?.workers_max ?? 0) !== 0) {
  throw new Error(`${CONTRACT}_RUNPOD_MUST_REMAIN_PARKED_0_0`);
}

const supabase = getServiceSupabase();

async function readState() {
  const { data, error } = await supabase.storage.from(BUCKET).download(STATE_PATH);
  if (error) {
    const status = Number(error?.statusCode ?? error?.status ?? 0);
    const message = text(error?.message).toLowerCase();
    if (
      status === 400 || status === 404 ||
      message.includes("not found") || message.includes("object not found")
    ) return null;
    throw error;
  }
  const state = JSON.parse(await data.text());
  if (state?.contract !== WORKFLOW_CONTRACT) {
    throw new Error(`${CONTRACT}_EXISTING_STATE_CONTRACT_INVALID`);
  }
  if (state?.organization_id !== ORGANIZATION_ID || state?.usage_id !== USAGE_ID) {
    throw new Error(`${CONTRACT}_EXISTING_STATE_IDENTITY_MISMATCH`);
  }
  return state;
}

let state = await readState();
let submittedNow = false;
let executeResult = null;

if (!state) {
  executeResult = await AvantiqoVideoProviderV2.execute({
    capability: "ai.video.generate",
    context: {
      organization_id: ORGANIZATION_ID,
      usage_id: USAGE_ID,
    },
    duration_seconds: 8,
    aspect_ratio: "16:9",
    delivery_resolution: "4k",
    provider_prompt:
      "A world-class cinematic dawn over a calm tropical bay viewed from a refined coastal headland, realistic ocean surface with subtle reflections, elegant slow forward camera movement, natural atmospheric depth, premium luxury travel-film cinematography, restrained warm sunrise light, physically plausible coastline detail, stable horizon and geometry, photorealistic, sophisticated composition, no people, no text, no logos.",
    negative_constraints: [
      "flicker",
      "warped geometry",
      "unstable horizon",
      "oversaturated color",
      "neon lighting",
      "artificial plastic textures",
      "text",
      "logos",
      "watermarks",
      "compression artifacts",
      "abrupt camera motion",
    ],
  });
  submittedNow = true;
  const safe = safeResult(executeResult);
  console.log(`AVANTIQO_VIDEO_V65_EXECUTE=${JSON.stringify(safe)}`);

  if (safe.generation_backend !== EXPECTED_BACKEND) {
    throw new Error(`${CONTRACT}_GOOGLE_NATIVE4K_BACKEND_REQUIRED:${safe.generation_backend || "UNKNOWN"}`);
  }
  if (safe.final_master_resolution !== "4k") {
    throw new Error(`${CONTRACT}_EXECUTE_FINAL_MASTER_NOT_4K:${safe.final_master_resolution || "UNKNOWN"}`);
  }
  if (safe.internal_generation_resolution !== "4k") {
    throw new Error(`${CONTRACT}_EXECUTE_INTERNAL_NOT_NATIVE_4K:${safe.internal_generation_resolution || "UNKNOWN"}`);
  }
  if (safe.runpod_lease_active === true) {
    throw new Error(`${CONTRACT}_RUNPOD_LEASE_MUST_REMAIN_INACTIVE`);
  }
  state = await readState();
} else {
  console.log(`AVANTIQO_VIDEO_V65_RESUME_EXISTING_STATE=${JSON.stringify({
    stage: state.stage || null,
    route: state.route || null,
    generation_backend: state.generation_backend || null,
    generation_model: state.generation_model || null,
    final_master_resolution: state.final_master_resolution || null,
    runpod_lease_active: state.runpod_lease_active === true,
    prompt_persisted: state.prompt_persisted === true,
  })}`);
}

if (!state) throw new Error(`${CONTRACT}_WORKFLOW_STATE_REQUIRED`);
if (state.stage === "GOOGLE_SUBMITTING") {
  throw new Error(`${CONTRACT}_GOOGLE_SUBMISSION_RECONCILIATION_REQUIRED`);
}
if (state.generation_backend !== EXPECTED_BACKEND) {
  throw new Error(`${CONTRACT}_EXISTING_STATE_BACKEND_INVALID:${state.generation_backend || "UNKNOWN"}`);
}
if (state.prompt_persisted !== false) {
  throw new Error(`${CONTRACT}_PROMPT_PERSISTENCE_CONTRACT_FAILED`);
}
if (state.runpod_lease_active === true) {
  throw new Error(`${CONTRACT}_RUNPOD_LEASE_ACTIVE_IN_GOOGLE_WORKFLOW`);
}

const providerJobId = `${WORKFLOW_JOB_PREFIX}${USAGE_ID}`;
const deadline = Date.now() + TIMEOUT_MS;
let latest = null;
let poll = 0;

while (Date.now() < deadline) {
  poll += 1;
  latest = await AvantiqoVideoProviderV2.getStatus({
    capability: "ai.video.generate",
    context: {
      organization_id: ORGANIZATION_ID,
      usage_id: USAGE_ID,
    },
    job_id: providerJobId,
    provider_job_id: providerJobId,
  });

  const safe = safeResult(latest);
  console.log(`AVANTIQO_VIDEO_V65_PROGRESS=${JSON.stringify({
    poll,
    status: safe.status,
    stage: safe.stage,
    generation_backend: safe.generation_backend,
    mastering_backend: safe.mastering_backend,
    internal_generation_resolution: safe.internal_generation_resolution,
    final_master_resolution: safe.final_master_resolution,
    runpod_lease_active: safe.runpod_lease_active,
  })}`);

  if (safe.status === "completed") break;
  if (safe.status === "failed") {
    throw new Error(`${CONTRACT}_WORKFLOW_FAILED:${safe.error || "UNKNOWN"}`);
  }
  await sleep(POLL_MS);
}

const final = safeResult(latest || {});
if (final.status !== "completed") throw new Error(`${CONTRACT}_TIMEOUT`);
if (final.stage !== "COMPLETED") throw new Error(`${CONTRACT}_FINAL_STAGE_INVALID:${final.stage}`);
if (final.generation_backend !== EXPECTED_BACKEND) {
  throw new Error(`${CONTRACT}_FINAL_BACKEND_INVALID:${final.generation_backend || "UNKNOWN"}`);
}
if (final.mastering_backend !== EXPECTED_MASTERING) {
  throw new Error(`${CONTRACT}_FINAL_MASTERING_INVALID:${final.mastering_backend || "UNKNOWN"}`);
}
if (final.internal_generation_resolution !== "4k") {
  throw new Error(`${CONTRACT}_FINAL_INTERNAL_NOT_NATIVE_4K:${final.internal_generation_resolution || "UNKNOWN"}`);
}
if (final.final_master_resolution !== "4k") {
  throw new Error(`${CONTRACT}_FINAL_MASTER_NOT_4K:${final.final_master_resolution || "UNKNOWN"}`);
}
if (final.customer_visible_provider !== "avantiqo-video") {
  throw new Error(`${CONTRACT}_CUSTOMER_PROVIDER_INVALID:${final.customer_visible_provider || "UNKNOWN"}`);
}
if (!text(final.storage_reference).startsWith(`storage://${BUCKET}/${ORGANIZATION_ID}/generated/avantiqo-video/`)) {
  throw new Error(`${CONTRACT}_PRIVATE_STORAGE_REFERENCE_INVALID`);
}
if (!/^https:\/\//i.test(text(final.video_url))) {
  throw new Error(`${CONTRACT}_SIGNED_REVIEW_URL_REQUIRED`);
}

state = await readState();
if (!state || state.stage !== "COMPLETED") throw new Error(`${CONTRACT}_FINAL_STATE_NOT_COMPLETED`);
if (state.prompt_persisted !== false) throw new Error(`${CONTRACT}_PERSISTED_PROMPT_CONTRACT_FAILED`);
if (state.final_master_resolution !== "4k") throw new Error(`${CONTRACT}_PERSISTED_MASTER_NOT_4K`);
if (state.internal_generation_resolution !== "4k") throw new Error(`${CONTRACT}_PERSISTED_NATIVE_4K_REQUIRED`);
if (state.runpod_lease_active === true) throw new Error(`${CONTRACT}_PERSISTED_RUNPOD_LEASE_ACTIVE`);
if (state.final_storage_reference !== final.storage_reference) {
  throw new Error(`${CONTRACT}_FINAL_STORAGE_REFERENCE_DRIFT`);
}

const routeAfter = await resolveAvantiqoVideoRoute({
  capability: "ai.video.generate",
  forceRefresh: true,
});
if ((routeAfter.capacity?.workers_min ?? 0) !== 0 || (routeAfter.capacity?.workers_max ?? 0) !== 0) {
  throw new Error(`${CONTRACT}_RUNPOD_NOT_PARKED_AFTER_GOOGLE`);
}
if ((routeAfter.capacity?.active_management_workers ?? 0) !== 0) {
  throw new Error(`${CONTRACT}_RUNPOD_ACTIVE_WORKER_AFTER_GOOGLE`);
}

console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  workflow_contract: WORKFLOW_CONTRACT,
  provider: "avantiqo-video",
  customer_visible_provider: "avantiqo-video",
  route: "MANAGED_FALLBACK",
  route_reason: routeBefore.reason,
  generation_backend: EXPECTED_BACKEND,
  generation_model: state.generation_model,
  internal_generation_resolution: "4k",
  mastering_backend: EXPECTED_MASTERING,
  final_master_resolution: "4k",
  duration_seconds: 8,
  storage_reference: final.storage_reference,
  review_url: final.video_url,
  submitted_now: submittedNow,
  resumable_usage_id: USAGE_ID,
  prompt_persisted: false,
  runpod_lease_used: false,
  runpod_workers_min_after: routeAfter.capacity?.workers_min ?? null,
  runpod_workers_max_after: routeAfter.capacity?.workers_max ?? null,
  runpod_active_management_workers_after: routeAfter.capacity?.active_management_workers ?? null,
  paid_google_generation_performed: true,
  fal_generation_performed: false,
  fal_mastering_performed: false,
  image_endpoint_mutated: false,
  secrets_printed: false,
}, null, 2));

console.log(`${CONTRACT}=PASS`);
