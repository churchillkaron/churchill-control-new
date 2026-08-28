#!/usr/bin/env node

const CONTRACT = "AVANTIQO_VIDEO_FIRST_ROUTED_PRODUCTION_V63";
const WORKFLOW_JOB_PREFIX = "video-workflow:";
const BUCKET = "creative-assets";
const ORGANIZATION_ID = "00000000-0000-0000-0000-000000000000";
const USAGE_ID = "video-v63-managed-fallback-4k-certification-20260828";
const STATE_PATH = `${ORGANIZATION_ID}/generated/avantiqo-video/.workflow/${USAGE_ID}.json`;
const POLL_MS = 10_000;
const TIMEOUT_MS = 45 * 60 * 1000;

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
    runpod_lease_active: result?.runpod_lease_active ?? result?.output?.runpod_lease_active ?? null,
    internal_generation_resolution: result?.internal_generation_resolution || result?.output?.internal_generation_resolution || null,
    final_master_resolution: result?.final_master_resolution || result?.output?.final_master_resolution || null,
    customer_visible_provider: result?.customer_visible_provider || result?.output?.customer_visible_provider || null,
    storage_reference: result?.storage_reference || null,
    video_url: result?.video_url || result?.result || null,
    error: result?.error || null,
  };
}

approved("AVANTIQO_VIDEO_V63_PAID_FALLBACK_APPROVED");

const [
  { AvantiqoVideoProviderV2 },
  { resolveAvantiqoVideoRoute },
  { getServiceSupabase },
] = await Promise.all([
  import("../lib/platform/service-runtime/providers/avantiqo-video/AvantiqoVideoProviderV2.js"),
  import("../lib/platform/service-runtime/providers/avantiqo-video/AvantiqoVideoCapacityRouter.js"),
  import("../lib/shared/supabase/service.js"),
]);

const route = await resolveAvantiqoVideoRoute({ capability: "ai.video.generate", forceRefresh: true });
console.log(`AVANTIQO_VIDEO_V63_ROUTE_PREFLIGHT=${JSON.stringify({
  route: route.route,
  reason: route.reason,
  fallback_ready: route.fallback_ready === true,
  best_stock: route.capacity?.best_stock || null,
  workers_min: route.capacity?.workers_min ?? null,
  workers_max: route.capacity?.workers_max ?? null,
  active_management_workers: route.capacity?.active_management_workers ?? null,
})}`);

if (route.route !== "MANAGED_FALLBACK" || route.fallback_ready !== true) {
  throw new Error(`${CONTRACT}_MANAGED_FALLBACK_REQUIRED:${route.route}:${route.reason}`);
}
if ((route.capacity?.workers_min ?? 0) !== 0 || (route.capacity?.workers_max ?? 0) !== 0) {
  throw new Error(`${CONTRACT}_RUNPOD_MUST_REMAIN_PARKED_0_0`);
}

const supabase = getServiceSupabase();

async function readExistingState() {
  const { data, error } = await supabase.storage.from(BUCKET).download(STATE_PATH);
  if (error) {
    const status = Number(error?.statusCode ?? error?.status ?? 0);
    const message = text(error?.message).toLowerCase();
    if (status === 400 || status === 404 || message.includes("not found") || message.includes("object not found")) return null;
    throw error;
  }
  const state = JSON.parse(await data.text());
  if (state?.usage_id !== USAGE_ID || state?.organization_id !== ORGANIZATION_ID) {
    throw new Error(`${CONTRACT}_EXISTING_STATE_IDENTITY_MISMATCH`);
  }
  return state;
}

let existingState = await readExistingState();
let executeResult = null;
let submittedNow = false;

if (!existingState) {
  executeResult = await AvantiqoVideoProviderV2.execute({
    capability: "ai.video.generate",
    context: {
      organization_id: ORGANIZATION_ID,
      usage_id: USAGE_ID,
    },
    duration_seconds: 2,
    aspect_ratio: "16:9",
    delivery_resolution: "4k",
    seed: 630063,
    provider_prompt:
      "Premium cinematic sunrise over a calm tropical bay, elegant slow forward camera movement, realistic water reflections, natural warm light, highly detailed coastline, restrained luxury travel-film composition, photorealistic, stable geometry, no people, no text, no logos.",
    negative_constraints: [
      "flicker",
      "warped geometry",
      "oversaturated colors",
      "neon lighting",
      "text",
      "logo",
      "watermark",
      "compression artifacts",
      "unstable horizon",
    ],
  });
  submittedNow = true;
  console.log(`AVANTIQO_VIDEO_V63_EXECUTE=${JSON.stringify(safeResult(executeResult))}`);

  if (executeResult?.output?.route !== "MANAGED_FALLBACK") {
    throw new Error(`${CONTRACT}_EXECUTE_ROUTE_DRIFT:${executeResult?.output?.route || "UNKNOWN"}`);
  }
  if (executeResult?.output?.generation_backend !== "MANAGED_FAL_WAN22") {
    throw new Error(`${CONTRACT}_FALLBACK_BACKEND_REQUIRED:${executeResult?.output?.generation_backend || "UNKNOWN"}`);
  }
  if (executeResult?.output?.runpod_lease_active === true) {
    throw new Error(`${CONTRACT}_RUNPOD_LEASE_MUST_REMAIN_INACTIVE`);
  }
} else {
  console.log(`AVANTIQO_VIDEO_V63_RESUME_EXISTING_STATE=${JSON.stringify({
    stage: existingState.stage || null,
    route: existingState.route || null,
    generation_backend: existingState.generation_backend || null,
    master_resolution: existingState.master_resolution || null,
    runpod_lease_active: existingState.runpod_lease_active === true,
    prompt_persisted: existingState.prompt_persisted === true,
  })}`);
  if (existingState.route !== "MANAGED_FALLBACK" || existingState.generation_backend !== "MANAGED_FAL_WAN22") {
    throw new Error(`${CONTRACT}_EXISTING_STATE_NOT_MANAGED_FALLBACK`);
  }
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
  console.log(`AVANTIQO_VIDEO_V63_PROGRESS=${JSON.stringify({
    poll,
    status: safe.status,
    stage: safe.stage,
    generation_backend: safe.generation_backend,
    final_master_resolution: safe.final_master_resolution,
    runpod_lease_active: safe.runpod_lease_active,
  })}`);

  if (safe.status === "completed") break;
  if (safe.status === "failed") {
    throw new Error(`${CONTRACT}_WORKFLOW_FAILED:${safe.error || "UNKNOWN"}`);
  }
  await sleep(POLL_MS);
}

if (!latest || safeResult(latest).status !== "completed") {
  throw new Error(`${CONTRACT}_TIMEOUT`);
}

const final = safeResult(latest);
if (final.stage !== "COMPLETED") throw new Error(`${CONTRACT}_FINAL_STAGE_INVALID:${final.stage}`);
if (final.final_master_resolution !== "4k") throw new Error(`${CONTRACT}_FINAL_MASTER_NOT_4K:${final.final_master_resolution}`);
if (!text(final.storage_reference).startsWith(`storage://${BUCKET}/${ORGANIZATION_ID}/generated/avantiqo-video/`)) {
  throw new Error(`${CONTRACT}_PRIVATE_STORAGE_REFERENCE_INVALID`);
}
if (!/^https:\/\//i.test(text(final.video_url))) throw new Error(`${CONTRACT}_SIGNED_REVIEW_URL_REQUIRED`);

existingState = await readExistingState();
if (!existingState) throw new Error(`${CONTRACT}_FINAL_STATE_MISSING`);
if (existingState.prompt_persisted !== false) throw new Error(`${CONTRACT}_PROMPT_PERSISTENCE_CONTRACT_FAILED`);
if (existingState.stage !== "COMPLETED") throw new Error(`${CONTRACT}_PERSISTED_STAGE_NOT_COMPLETED`);
if (existingState.master_resolution !== "4k") throw new Error(`${CONTRACT}_PERSISTED_MASTER_NOT_4K`);
if (existingState.runpod_lease_active === true) throw new Error(`${CONTRACT}_RUNPOD_LEASE_ACTIVE_AT_COMPLETION`);

const routeAfter = await resolveAvantiqoVideoRoute({ capability: "ai.video.generate", forceRefresh: true });
if ((routeAfter.capacity?.workers_min ?? 0) !== 0 || (routeAfter.capacity?.workers_max ?? 0) !== 0) {
  throw new Error(`${CONTRACT}_RUNPOD_NOT_PARKED_AFTER_FALLBACK`);
}

console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  provider: "avantiqo-video",
  customer_visible_provider: final.customer_visible_provider || "avantiqo-video",
  route: "MANAGED_FALLBACK",
  route_reason: route.reason,
  generation_backend: "MANAGED_FAL_WAN22",
  internal_generation_resolution: "720p",
  mastering_backend: "fal-ai/bytedance-upscaler/upscale/video",
  final_master_resolution: "4k",
  storage_reference: final.storage_reference,
  review_url: final.video_url,
  submitted_now: submittedNow,
  resumable_usage_id: USAGE_ID,
  prompt_persisted: false,
  runpod_lease_used: false,
  runpod_workers_min_after: routeAfter.capacity?.workers_min ?? null,
  runpod_workers_max_after: routeAfter.capacity?.workers_max ?? null,
  runpod_active_management_workers_after: routeAfter.capacity?.active_management_workers ?? null,
  paid_fal_generation_performed: true,
  paid_fal_mastering_performed: true,
  image_endpoint_mutated: false,
  secrets_printed: false,
}, null, 2));
console.log(`${CONTRACT}=PASS`);
