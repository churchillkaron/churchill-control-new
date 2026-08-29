#!/usr/bin/env node

import { register } from "node:module";
import { pathToFileURL } from "node:url";

register("./scripts/next-alias-loader.mjs", pathToFileURL("./"));

const CONTRACT = "AVANTIQO_VIDEO_FINAL_EPHEMERAL_POD_CERTIFICATION_V72";
const BUCKET = "creative-assets";
const ORGANIZATION_ID = "00000000-0000-0000-0000-000000000000";
const DEFAULT_USAGE_ID = "video-v72-ephemeral-pod-final-20260829";
const POLL_MS = 15_000;
const TIMEOUT_MS = 30 * 60 * 1000;
const POD_LEASE_PREFIX = "pod-fallback:";
const HISTORICAL_V72_GENERATION_IMAGE = "ghcr.io/churchillkaron/avantiqo-video-worker-32gb-candidate@sha256:44ef09f27a402b2890007a3620b772240913e68fa6ceafcc06436af2c1023adc";
const ACTIVE_GPU_ONLY_IMAGE = "ghcr.io/churchillkaron/avantiqo-video-worker-gpu-only@sha256:2f477f95fcc46fdcb7aff1dda03944ad282eb3a7d33c95098bd13d00a76c3425";
const CERTIFIED_PRIMARY_GPU_POOL = Object.freeze([
  "NVIDIA RTX PRO 4500 Blackwell",
  "NVIDIA B200",
  "NVIDIA RTX PRO 6000 Blackwell Server Edition",
  "NVIDIA A100 80GB PCIe",
]);
const CERTIFIED_PLACEMENT_DCS = new Set(["EU-RO-1", "US-NC-2"]);
const CERTIFIED_VOLUME_BY_DC = Object.freeze({
  "EU-RO-1": "avantiqo-video-cache-eu-ro-1",
  "US-NC-2": "avantiqo-shared-image-video-cache",
});

function text(value) { return String(value ?? "").trim(); }
function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function approved(name) {
  if (text(process.env[name]).toUpperCase() !== "YES") throw new Error(`${name}=YES_REQUIRED`);
}
function safeResult(result = {}) {
  return {
    provider_job_id: result?.provider_job_id || result?.output?.provider_job_id || null,
    status: result?.status || result?.output?.status || null,
    stage: result?.stage || result?.output?.stage || null,
    route: result?.route || result?.output?.route || null,
    route_reason: result?.route_reason || result?.output?.route_reason || null,
    generation_backend: result?.generation_backend || result?.output?.generation_backend || null,
    master_backend: result?.master_backend || result?.output?.master_backend || null,
    studio_compute_only_mastering: result?.studio_compute_only_mastering ?? result?.output?.studio_compute_only_mastering ?? null,
    gpu_mastering_used: result?.gpu_mastering_used ?? result?.output?.gpu_mastering_used ?? null,
    fal_contacted: result?.fal_contacted ?? result?.output?.fal_contacted ?? null,
    external_mastering_provider_contacted: result?.external_mastering_provider_contacted ?? result?.output?.external_mastering_provider_contacted ?? null,
    runpod_lease_active: result?.runpod_lease_active ?? result?.output?.runpod_lease_active ?? null,
    final_master_resolution: result?.final_master_resolution || result?.output?.final_master_resolution || null,
    storage_reference: result?.storage_reference || result?.output?.storage_reference || null,
    video_url: result?.video_url || result?.result || result?.output?.video_url || result?.output?.result || null,
    error: result?.error || result?.output?.error || null,
  };
}

approved("AVANTIQO_VIDEO_FINAL_V72_APPROVED");
const usageId = text(process.env.AVANTIQO_VIDEO_FINAL_V72_USAGE_ID) || DEFAULT_USAGE_ID;
const statePath = `${ORGANIZATION_ID}/generated/avantiqo-video/.workflow-v3/${usageId}.json`;

const [
  { AvantiqoVideoProviderV2 },
  { AVANTIQO_VIDEO_POD_IMAGE },
  { listActiveAvantiqoVideoPods, reconcileAvantiqoVideoPodLeases },
  { getServiceSupabase },
  { supabaseAdmin },
] = await Promise.all([
  import("../lib/platform/service-runtime/providers/avantiqo-video/AvantiqoVideoProviderV2.js"),
  import("../lib/platform/service-runtime/providers/avantiqo-video/AvantiqoVideoPodRunpod.js"),
  import("../lib/platform/service-runtime/providers/avantiqo-video/AvantiqoVideoPodRuntime.js"),
  import("../lib/shared/supabase/service.js"),
  import("../lib/shared/supabase/admin.js"),
]);

if (AVANTIQO_VIDEO_POD_IMAGE !== ACTIVE_GPU_ONLY_IMAGE) {
  throw new Error(`${CONTRACT}_ACTIVE_GPU_ONLY_IMAGE_DRIFT`);
}

const supabase = getServiceSupabase();
async function readState() {
  const { data, error } = await supabase.storage.from(BUCKET).download(statePath);
  if (error) {
    const status = Number(error?.statusCode ?? error?.status ?? 0);
    const message = text(error?.message).toLowerCase();
    if (status === 400 || status === 404 || message.includes("not found") || message.includes("object not found")) return null;
    throw error;
  }
  return JSON.parse(await data.text());
}

let state = await readState();
if (!state) {
  throw new Error(`${CONTRACT}_EXISTING_V72_STATE_REQUIRED_NO_NEW_GENERATION_ALLOWED`);
}

console.log(`AVANTIQO_VIDEO_V72_RESUME=${JSON.stringify({
  existing_state: true,
  stage: state.stage || null,
  status: state.status || null,
  generation_backend: state.generation_backend || null,
  pod_id: state.pod_job?.pod_id || null,
  placement_mode: state.pod_job?.placement_mode || null,
  data_center_id: state.pod_job?.data_center_id || null,
  network_volume_name: state.pod_job?.network_volume_name || null,
  historical_generation_image: state.pod_job?.immutable_image || null,
  active_future_gpu_only_image: AVANTIQO_VIDEO_POD_IMAGE,
  new_pod_preflight_skipped: true,
  new_generation_submitted: false,
  studio_mastering_required: true,
  fal_allowed: false,
})}`);

const providerJobId = `video-workflow-v3:${usageId}`;
const deadline = Date.now() + TIMEOUT_MS;
let latest = null;
let poll = 0;
while (Date.now() < deadline) {
  poll += 1;
  latest = await AvantiqoVideoProviderV2.getStatus({
    capability: "ai.video.generate",
    context: { organization_id: ORGANIZATION_ID, usage_id: usageId },
    job_id: providerJobId,
    provider_job_id: providerJobId,
  });
  const safe = safeResult(latest);
  console.log(`AVANTIQO_VIDEO_V72_PROGRESS=${JSON.stringify({
    poll,
    status: safe.status,
    stage: safe.stage,
    generation_backend: safe.generation_backend,
    master_backend: safe.master_backend,
    studio_compute_only_mastering: safe.studio_compute_only_mastering,
    gpu_mastering_used: safe.gpu_mastering_used,
    fal_contacted: safe.fal_contacted,
    runpod_lease_active: safe.runpod_lease_active,
    final_master_resolution: safe.final_master_resolution,
  })}`);
  if (safe.status === "completed") break;
  if (safe.status === "failed") throw new Error(`${CONTRACT}_WORKFLOW_FAILED:${safe.error || "UNKNOWN"}`);
  await sleep(POLL_MS);
}

const final = safeResult(latest || {});
if (final.status !== "completed" || final.stage !== "COMPLETED") throw new Error(`${CONTRACT}_TIMEOUT_OR_INCOMPLETE`);
if (final.generation_backend !== "OWNED_RUNPOD_POD_V5") throw new Error(`${CONTRACT}_HISTORICAL_GENERATION_BACKEND_DRIFT`);
if (final.final_master_resolution !== "4k") throw new Error(`${CONTRACT}_FINAL_MASTER_NOT_4K:${final.final_master_resolution}`);
if (final.studio_compute_only_mastering !== true) throw new Error(`${CONTRACT}_STUDIO_MASTERING_REQUIRED`);
if (final.gpu_mastering_used !== false) throw new Error(`${CONTRACT}_GPU_MASTERING_FORBIDDEN`);
if (final.fal_contacted !== false) throw new Error(`${CONTRACT}_FAL_CONTACT_FORBIDDEN`);
if (final.external_mastering_provider_contacted !== false) throw new Error(`${CONTRACT}_EXTERNAL_MASTERING_PROVIDER_FORBIDDEN`);
if (!text(final.master_backend).startsWith("STUDIO_")) throw new Error(`${CONTRACT}_STUDIO_MASTER_BACKEND_REQUIRED:${final.master_backend || "MISSING"}`);
if (!text(final.storage_reference).startsWith(`storage://${BUCKET}/${ORGANIZATION_ID}/generated/avantiqo-video/`)) throw new Error(`${CONTRACT}_PRIVATE_STORAGE_REFERENCE_INVALID`);
if (!/^https:\/\//i.test(text(final.video_url))) throw new Error(`${CONTRACT}_SIGNED_REVIEW_URL_REQUIRED`);

state = await readState();
if (!state) throw new Error(`${CONTRACT}_FINAL_STATE_MISSING`);
if (state.prompt_persisted !== false) throw new Error(`${CONTRACT}_PROMPT_PERSISTENCE_CONTRACT_FAILED`);
if (state.pod_lease_active === true) throw new Error(`${CONTRACT}_POD_LEASE_ACTIVE_AT_COMPLETION`);
if (state.stage !== "COMPLETED") throw new Error(`${CONTRACT}_PERSISTED_STAGE_NOT_COMPLETED`);
if (state.studio_compute_only_mastering !== true) throw new Error(`${CONTRACT}_PERSISTED_STUDIO_MASTERING_REQUIRED`);
if (state.gpu_mastering_used !== false) throw new Error(`${CONTRACT}_PERSISTED_GPU_MASTERING_FORBIDDEN`);
if (state.fal_contacted !== false) throw new Error(`${CONTRACT}_PERSISTED_FAL_CONTACT_FORBIDDEN`);
if (state.external_mastering_provider_contacted !== false) throw new Error(`${CONTRACT}_PERSISTED_EXTERNAL_MASTERING_PROVIDER_FORBIDDEN`);

const podJob = state.pod_job || {};
const selectedDc = text(podJob.data_center_id);
const selectedVolumeName = text(podJob.network_volume_name);
const selectedGpu = text(podJob.gpu_type_id) || null;
const eligibleGpuTypes = Array.isArray(podJob.eligible_gpu_type_ids) ? podJob.eligible_gpu_type_ids.map(text).filter(Boolean) : [];
const placementMode = text(podJob.placement_mode) || null;
const historicalGenerationImage = text(podJob.immutable_image);
if (historicalGenerationImage !== HISTORICAL_V72_GENERATION_IMAGE) throw new Error(`${CONTRACT}_HISTORICAL_GENERATION_IMAGE_DRIFT`);
if (!CERTIFIED_PLACEMENT_DCS.has(selectedDc)) throw new Error(`${CONTRACT}_SELECTED_DATA_CENTER_NOT_CERTIFIED:${selectedDc || "MISSING"}`);
if (selectedVolumeName !== CERTIFIED_VOLUME_BY_DC[selectedDc]) throw new Error(`${CONTRACT}_SELECTED_CACHE_VOLUME_NOT_CERTIFIED:${selectedDc}:${selectedVolumeName || "MISSING"}`);
if (podJob.gpu_type_certified !== true) throw new Error(`${CONTRACT}_SELECTED_GPU_NOT_CERTIFIED`);

await reconcileAvantiqoVideoPodLeases({ limit: 25 });
const { data: activePodLeases, error: leaseError } = await supabaseAdmin
  .from("avantiqo_video_runpod_leases")
  .select("id,endpoint_id,state")
  .eq("state", "ACTIVE")
  .like("endpoint_id", `${POD_LEASE_PREFIX}%`);
if (leaseError) throw leaseError;
if (Array.isArray(activePodLeases) && activePodLeases.length) throw new Error(`${CONTRACT}_ACTIVE_POD_LEASE_REMAINS:${activePodLeases.length}`);
const activeVideoPods = await listActiveAvantiqoVideoPods();
if (activeVideoPods.length) throw new Error(`${CONTRACT}_ACTIVE_VIDEO_POD_REMAINS:${activeVideoPods.length}`);

console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  route: "OWNED_POD_FALLBACK",
  historical_generation_backend: "OWNED_RUNPOD_POD_V5",
  resumed_existing_state: true,
  new_generation_submitted: false,
  selected_gpu_type_id: selectedGpu,
  eligible_gpu_type_ids: eligibleGpuTypes,
  selected_data_center_id: selectedDc,
  selected_cache_volume: selectedVolumeName,
  placement_mode: placementMode,
  primary_gpu_type_pool: CERTIFIED_PRIMARY_GPU_POOL,
  historical_generation_immutable_image: historicalGenerationImage,
  active_future_gpu_only_image: AVANTIQO_VIDEO_POD_IMAGE,
  internal_generation_resolution: "720p",
  cinema_quality_profile_preserved: true,
  final_master_resolution: "4k",
  master_backend: final.master_backend,
  studio_compute_only_mastering: true,
  gpu_mastering_used: false,
  fal_contacted: false,
  external_mastering_provider_contacted: false,
  storage_reference: final.storage_reference,
  review_url: final.video_url,
  prompt_persisted: false,
  pod_lease_active_after: false,
  active_pod_leases_after: 0,
  active_video_pods_after: 0,
  serverless_mutation_performed: false,
  image_endpoint_mutated: false,
  production_deploy_performed: false,
  secrets_printed: false,
}, null, 2));
console.log(`${CONTRACT}=PASS`);
