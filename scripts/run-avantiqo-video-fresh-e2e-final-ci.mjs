#!/usr/bin/env node

import { register } from "node:module";
import { pathToFileURL } from "node:url";
import fs from "node:fs/promises";

register("./scripts/next-alias-loader.mjs", pathToFileURL("./"));

const CONTRACT = "AVANTIQO_VIDEO_FRESH_E2E_FINAL_V1";
const BUCKET = "creative-assets";
const DEFAULT_ORGANIZATION_ID = "00000000-0000-0000-0000-000000000000";
const POLL_MS = 15_000;
const TIMEOUT_MS = 150 * 60 * 1000;
const EXPECTED_GENERATION_BACKEND = "OWNED_RUNPOD_POD_V6";
const EXPECTED_MASTER_BACKEND = "OWNED_GPU_FLASHVSR_V1_1_STUDIO_4K";
const EXPECTED_GENERATION_IMAGE = "ghcr.io/churchillkaron/avantiqo-video-worker-gpu-only@sha256:2f477f95fcc46fdcb7aff1dda03944ad282eb3a7d33c95098bd13d00a76c3425";
const EXPECTED_FLASHVSR_IMAGE = "ghcr.io/churchillkaron/avantiqo-video-flashvsr-v11@sha256:78db7a82d489731be6dd4c5e8b1e933535f909e0feaab797da44c00068a643da";
const EXPECTED_FLASHVSR_MODEL = "JunhaoZhuang/FlashVSR-v1.1";
const EXPECTED_FLASHVSR_MODEL_REVISION = "a258bf2d58ac5a7d7193fb6ce4326aaff98ea6cb";
const EXPECTED_FLASHVSR_GPU = "NVIDIA A100 80GB PCIe";
const EXPECTED_GENERATION_DC = "EU-RO-1";
const EXPECTED_GENERATION_CACHE = "avantiqo-video-cache-eu-ro-1";
const EXPECTED_GENERATION_GPU_POOL = Object.freeze([
  "NVIDIA RTX PRO 4500 Blackwell",
  "NVIDIA B200",
  "NVIDIA RTX PRO 6000 Blackwell Server Edition",
  "NVIDIA A100 80GB PCIe",
]);

const text = (value) => String(value ?? "").trim();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const approved = (name) => {
  if (text(process.env[name]).toUpperCase() !== "YES") throw new Error(`${name}=YES_REQUIRED`);
};
const sameList = (left, right) => JSON.stringify(Array.from(left || [])) === JSON.stringify(Array.from(right || []));
const safe = (result = {}) => ({
  provider_job_id: result?.provider_job_id || result?.output?.provider_job_id || null,
  status: result?.status || result?.output?.status || null,
  stage: result?.stage || result?.output?.stage || null,
  generation_backend: result?.generation_backend || result?.output?.generation_backend || null,
  master_backend: result?.master_backend || result?.output?.master_backend || null,
  final_master_resolution: result?.final_master_resolution || result?.output?.final_master_resolution || null,
  runpod_lease_active: result?.runpod_lease_active ?? result?.output?.runpod_lease_active ?? null,
  fal_contacted: result?.fal_contacted ?? result?.output?.fal_contacted ?? null,
  storage_reference: result?.storage_reference || result?.output?.storage_reference || null,
  video_url: result?.video_url || result?.result || result?.output?.video_url || result?.output?.result || null,
  error: result?.error || result?.output?.error || null,
});

approved("AVANTIQO_VIDEO_FRESH_E2E_APPROVED");
const organizationId = text(process.env.AVANTIQO_VIDEO_FRESH_E2E_ORGANIZATION_ID) || DEFAULT_ORGANIZATION_ID;
const usageId = text(process.env.AVANTIQO_VIDEO_FRESH_E2E_USAGE_ID);
if (!usageId || !/^video-fresh-e2e-[A-Za-z0-9_-]+$/.test(usageId)) throw new Error(`${CONTRACT}_USAGE_ID_INVALID`);

// Certification routing: external paid fallbacks are forbidden, production Serverless is not used,
// and Workflow V3 must select the owned ephemeral Pod fallback after its own live readiness checks.
process.env.AVANTIQO_VIDEO_EXTERNAL_PAID_FALLBACK_APPROVED = "NO";
process.env.AVANTIQO_VIDEO_MANAGED_FALLBACK_ENABLED = "NO";
process.env.AVANTIQO_VIDEO_POD_FALLBACK_ENABLED = "YES";
process.env.AVANTIQO_VIDEO_MASTER_RESOLUTION = "4k";
process.env.RUNPOD_AVANTIQO_VIDEO_PRODUCTION_ENDPOINT_ID = "";

const [
  { AvantiqoVideoProviderV2 },
  { resolveAvantiqoVideoRoute },
  { inspectAvantiqoVideoPodReadiness, listActiveAvantiqoVideoPods, reconcileAvantiqoVideoPodLeases },
  { activeVideoPodLeases },
  {
    AVANTIQO_VIDEO_POD_CACHE_VOLUME,
    AVANTIQO_VIDEO_POD_DC,
    AVANTIQO_VIDEO_POD_GPU_POOL,
    AVANTIQO_VIDEO_POD_IMAGE,
  },
  { AVANTIQO_VIDEO_FLASHVSR_GPU_TYPE, AVANTIQO_VIDEO_FLASHVSR_IMAGE },
  { AVANTIQO_VIDEO_FLASHVSR_MODEL, AVANTIQO_VIDEO_FLASHVSR_MODEL_REVISION },
  { getServiceSupabase },
] = await Promise.all([
  import("../lib/platform/service-runtime/providers/avantiqo-video/AvantiqoVideoProviderV2.js"),
  import("../lib/platform/service-runtime/providers/avantiqo-video/AvantiqoVideoCapacityRouter.js"),
  import("../lib/platform/service-runtime/providers/avantiqo-video/AvantiqoVideoPodRuntime.js"),
  import("../lib/platform/service-runtime/providers/avantiqo-video/AvantiqoVideoPodLease.js"),
  import("../lib/platform/service-runtime/providers/avantiqo-video/AvantiqoVideoPodRunpod.js"),
  import("../lib/platform/service-runtime/providers/avantiqo-video/AvantiqoVideoFlashVsrPodRuntime.js"),
  import("../lib/creative/video/runtime/CreativeVideoStudioFlashVsrRuntime.js"),
  import("../lib/shared/supabase/service.js"),
]);

if (AVANTIQO_VIDEO_POD_IMAGE !== EXPECTED_GENERATION_IMAGE) throw new Error(`${CONTRACT}_GENERATION_IMAGE_DRIFT`);
if (AVANTIQO_VIDEO_POD_DC !== EXPECTED_GENERATION_DC) throw new Error(`${CONTRACT}_GENERATION_DC_DRIFT:${AVANTIQO_VIDEO_POD_DC}`);
if (AVANTIQO_VIDEO_POD_CACHE_VOLUME !== EXPECTED_GENERATION_CACHE) throw new Error(`${CONTRACT}_GENERATION_CACHE_DRIFT:${AVANTIQO_VIDEO_POD_CACHE_VOLUME}`);
if (!sameList(AVANTIQO_VIDEO_POD_GPU_POOL, EXPECTED_GENERATION_GPU_POOL)) throw new Error(`${CONTRACT}_GENERATION_GPU_POOL_DRIFT`);
if (AVANTIQO_VIDEO_FLASHVSR_IMAGE !== EXPECTED_FLASHVSR_IMAGE) throw new Error(`${CONTRACT}_FLASHVSR_IMAGE_DRIFT`);
if (AVANTIQO_VIDEO_FLASHVSR_GPU_TYPE !== EXPECTED_FLASHVSR_GPU) throw new Error(`${CONTRACT}_FLASHVSR_GPU_DRIFT:${AVANTIQO_VIDEO_FLASHVSR_GPU_TYPE}`);
if (AVANTIQO_VIDEO_FLASHVSR_MODEL !== EXPECTED_FLASHVSR_MODEL) throw new Error(`${CONTRACT}_FLASHVSR_MODEL_DRIFT:${AVANTIQO_VIDEO_FLASHVSR_MODEL}`);
if (AVANTIQO_VIDEO_FLASHVSR_MODEL_REVISION !== EXPECTED_FLASHVSR_MODEL_REVISION) throw new Error(`${CONTRACT}_FLASHVSR_MODEL_REVISION_DRIFT`);

const supabase = getServiceSupabase();
const statePath = `${organizationId}/generated/avantiqo-video/.workflow-v3/${usageId}.json`;
async function readState() {
  const { data, error } = await supabase.storage.from(BUCKET).download(statePath);
  if (error) {
    const status = Number(error?.statusCode ?? error?.status ?? 0);
    const message = text(error?.message).toLowerCase();
    if ([400, 404].includes(status) || message.includes("not found") || message.includes("object not found")) return null;
    throw error;
  }
  return JSON.parse(await data.text());
}

let state = await readState();
let submittedFreshGeneration = false;
let providerJobId = `video-workflow-v3:${usageId}`;

if (!state) {
  const [activePodsBefore, leasesBefore, route, readiness] = await Promise.all([
    listActiveAvantiqoVideoPods(),
    activeVideoPodLeases({ limit: 25 }),
    resolveAvantiqoVideoRoute({ capability: "ai.video.generate", forceRefresh: true }),
    inspectAvantiqoVideoPodReadiness(),
  ]);

  if (activePodsBefore.length || leasesBefore.length) {
    throw new Error(`${CONTRACT}_VIDEO_BUSY_REFUSE_NEW_SPEND:${activePodsBefore.length}:${leasesBefore.length}`);
  }
  if (route.route !== "UNAVAILABLE" || route.fallback_ready === true) {
    throw new Error(`${CONTRACT}_OWNED_POD_ROUTE_NOT_ISOLATED:${route.route}:${route.reason || "UNKNOWN"}`);
  }
  if (readiness.ready !== true) {
    throw new Error(`${CONTRACT}_POD_READINESS_FAILED:${readiness.reason || readiness.error || "UNKNOWN"}`);
  }
  if (readiness.immutable_image !== EXPECTED_GENERATION_IMAGE) throw new Error(`${CONTRACT}_READINESS_IMAGE_INVALID`);
  if (readiness.data_center_id !== EXPECTED_GENERATION_DC) throw new Error(`${CONTRACT}_READINESS_DC_INVALID:${readiness.data_center_id || "MISSING"}`);
  if (readiness.network_volume_name !== EXPECTED_GENERATION_CACHE) throw new Error(`${CONTRACT}_READINESS_CACHE_INVALID:${readiness.network_volume_name || "MISSING"}`);

  const submission = await AvantiqoVideoProviderV2.execute({
    capability: "ai.video.generate",
    prompt: "Cinematic premium nighttime coastal hospitality exterior, warm architectural lighting, slow controlled dolly movement, realistic materials, natural motion, no text, no logos, no people facing camera.",
    duration_seconds: 4,
    aspect_ratio: "16:9",
    delivery_resolution: "4k",
    generation: {
      duration_seconds: 4,
      aspect_ratio: "16:9",
      resolution: "720p",
    },
    context: {
      organization_id: organizationId,
      usage_id: usageId,
    },
  });
  const submitted = safe(submission);
  providerJobId = submitted.provider_job_id || providerJobId;
  if (!text(providerJobId).startsWith("video-workflow-v3:")) throw new Error(`${CONTRACT}_WORKFLOW_V3_REQUIRED`);
  if (submitted.generation_backend !== EXPECTED_GENERATION_BACKEND) {
    throw new Error(`${CONTRACT}_GENERATION_BACKEND_INVALID:${submitted.generation_backend || "MISSING"}`);
  }
  submittedFreshGeneration = true;
  state = await readState();
  if (!state) throw new Error(`${CONTRACT}_STATE_NOT_PERSISTED_AFTER_SUBMIT`);
}

const deadline = Date.now() + TIMEOUT_MS;
let latest = null;
let poll = 0;
while (Date.now() < deadline) {
  poll += 1;
  latest = await AvantiqoVideoProviderV2.getStatus({
    capability: "ai.video.generate",
    context: { organization_id: organizationId, usage_id: usageId },
    job_id: providerJobId,
    provider_job_id: providerJobId,
  });
  const current = safe(latest);
  console.log(`AVANTIQO_VIDEO_FRESH_E2E_PROGRESS=${JSON.stringify({
    poll,
    status: current.status,
    stage: current.stage,
    generation_backend: current.generation_backend,
    master_backend: current.master_backend,
    final_master_resolution: current.final_master_resolution,
    runpod_lease_active: current.runpod_lease_active,
    fal_contacted: current.fal_contacted,
  })}`);
  if (current.status === "completed") break;
  if (current.status === "failed") throw new Error(`${CONTRACT}_WORKFLOW_FAILED:${current.error || "UNKNOWN"}`);
  await sleep(POLL_MS);
}

const final = safe(latest || {});
if (final.status !== "completed" || final.stage !== "COMPLETED") throw new Error(`${CONTRACT}_TIMEOUT_OR_INCOMPLETE`);
state = await readState();
if (!state) throw new Error(`${CONTRACT}_FINAL_STATE_MISSING`);
if (state.stage !== "COMPLETED") throw new Error(`${CONTRACT}_FINAL_STATE_NOT_COMPLETED:${state.stage || "MISSING"}`);
if (state.generation_backend !== EXPECTED_GENERATION_BACKEND) throw new Error(`${CONTRACT}_GENERATION_BACKEND_DRIFT:${state.generation_backend || "MISSING"}`);
if (state.pod_job?.immutable_image !== EXPECTED_GENERATION_IMAGE) throw new Error(`${CONTRACT}_GENERATION_IMAGE_NOT_PROVEN`);
if (state.pod_job?.gpu_type_certified !== true) throw new Error(`${CONTRACT}_GENERATION_GPU_NOT_CERTIFIED`);
if (!EXPECTED_GENERATION_GPU_POOL.includes(text(state.pod_job?.gpu_type_id))) throw new Error(`${CONTRACT}_GENERATION_GPU_OUTSIDE_CERTIFIED_POOL:${state.pod_job?.gpu_type_id || "MISSING"}`);
if (state.pod_job?.data_center_id !== EXPECTED_GENERATION_DC) throw new Error(`${CONTRACT}_GENERATION_DC_INVALID:${state.pod_job?.data_center_id || "MISSING"}`);
if (state.pod_job?.network_volume_name !== EXPECTED_GENERATION_CACHE) throw new Error(`${CONTRACT}_GENERATION_CACHE_INVALID:${state.pod_job?.network_volume_name || "MISSING"}`);
if (state.master_job?.immutable_image !== EXPECTED_FLASHVSR_IMAGE) throw new Error(`${CONTRACT}_FLASHVSR_IMAGE_NOT_PROVEN`);
if (state.master_job?.gpu_type_id !== EXPECTED_FLASHVSR_GPU) throw new Error(`${CONTRACT}_FLASHVSR_GPU_NOT_PROVEN:${state.master_job?.gpu_type_id || "MISSING"}`);
if (state.master_job?.model !== EXPECTED_FLASHVSR_MODEL) throw new Error(`${CONTRACT}_FLASHVSR_MODEL_NOT_PROVEN:${state.master_job?.model || "MISSING"}`);
if (state.master_job?.model_revision !== EXPECTED_FLASHVSR_MODEL_REVISION) throw new Error(`${CONTRACT}_FLASHVSR_REVISION_NOT_PROVEN`);
if (state.master_job?.upload_bridge_deleted_before_gpu !== true) throw new Error(`${CONTRACT}_UPLOAD_BRIDGE_DELETE_BEFORE_GPU_NOT_PROVEN`);
if (state.master_job?.concurrent_volume_writers !== false) throw new Error(`${CONTRACT}_CONCURRENT_VOLUME_WRITER_FORBIDDEN`);
if (state.master_job?.s3_credentials_required !== false) throw new Error(`${CONTRACT}_S3_CREDENTIAL_BOUNDARY_INVALID`);
if (state.master_backend !== EXPECTED_MASTER_BACKEND) throw new Error(`${CONTRACT}_MASTER_BACKEND_INVALID:${state.master_backend || "MISSING"}`);
if (state.master_resolution !== "4k") throw new Error(`${CONTRACT}_MASTER_RESOLUTION_INVALID:${state.master_resolution || "MISSING"}`);
if (state.learned_super_resolution_used !== true || state.gpu_mastering_used !== true) throw new Error(`${CONTRACT}_LEARNED_GPU_SUPER_RESOLUTION_REQUIRED`);
if (state.studio_final_encoding !== true) throw new Error(`${CONTRACT}_STUDIO_FINAL_ENCODING_REQUIRED`);
if (state.gpu_deleted_before_studio_encode !== true) throw new Error(`${CONTRACT}_GPU_DELETE_BEFORE_STUDIO_NOT_PROVEN`);
if (state.pod_lease_active === true) throw new Error(`${CONTRACT}_LEASE_STILL_ACTIVE_IN_FINAL_STATE`);
if (state.fal_contacted !== false || state.external_mastering_provider_contacted !== false) throw new Error(`${CONTRACT}_EXTERNAL_MASTERING_CONTACT_FORBIDDEN`);
if (state.prompt_persisted !== false) throw new Error(`${CONTRACT}_PROMPT_PERSISTENCE_FORBIDDEN`);
if (Number(state.master_output_probe?.width) !== 3840 || Number(state.master_output_probe?.height) !== 2160) {
  throw new Error(`${CONTRACT}_FINAL_DIMENSIONS_INVALID:${state.master_output_probe?.width || 0}x${state.master_output_probe?.height || 0}`);
}
if (!text(state.final_storage_reference).startsWith(`storage://${BUCKET}/${organizationId}/generated/avantiqo-video/`)) throw new Error(`${CONTRACT}_PRIVATE_STORAGE_REFERENCE_INVALID`);
if (!/^https:\/\//i.test(text(state.final_video_url))) throw new Error(`${CONTRACT}_SIGNED_REVIEW_URL_REQUIRED`);

await reconcileAvantiqoVideoPodLeases({ limit: 25 });
const [activePodsAfter, leasesAfter] = await Promise.all([
  listActiveAvantiqoVideoPods(),
  activeVideoPodLeases({ limit: 25 }),
]);
if (activePodsAfter.length) throw new Error(`${CONTRACT}_ACTIVE_VIDEO_PODS_REMAIN:${activePodsAfter.length}`);
if (leasesAfter.length) throw new Error(`${CONTRACT}_ACTIVE_VIDEO_LEASES_REMAIN:${leasesAfter.length}`);

const report = {
  success: true,
  contract: CONTRACT,
  organization_id: organizationId,
  usage_id: usageId,
  submitted_fresh_generation: submittedFreshGeneration,
  provider_entry: "AvantiqoVideoProviderV2",
  workflow_contract: state.contract,
  generation_backend: state.generation_backend,
  generation_immutable_image: state.pod_job.immutable_image,
  generation_gpu_type_id: state.pod_job.gpu_type_id,
  generation_gpu_type_certified: true,
  generation_data_center_id: state.pod_job.data_center_id,
  generation_cache_volume: state.pod_job.network_volume_name,
  internal_generation_resolution: "720p",
  flashvsr_immutable_image: state.master_job.immutable_image,
  flashvsr_gpu_type_id: state.master_job.gpu_type_id,
  flashvsr_model: state.master_job.model,
  flashvsr_model_revision: state.master_job.model_revision,
  upload_bridge_deleted_before_gpu: true,
  concurrent_volume_writers: false,
  final_master_resolution: state.master_resolution,
  final_width: state.master_output_probe.width,
  final_height: state.master_output_probe.height,
  master_backend: state.master_backend,
  learned_super_resolution_used: true,
  gpu_mastering_used: true,
  gpu_deleted_before_studio_encode: true,
  studio_final_encoding: true,
  fal_contacted: false,
  external_mastering_provider_contacted: false,
  prompt_persisted: false,
  storage_reference: state.final_storage_reference,
  review_url: state.final_video_url,
  active_video_pods_after: 0,
  active_video_leases_after: 0,
  production_deploy_performed: false,
  secrets_printed: false,
};

const reportPath = text(process.env.AVANTIQO_VIDEO_FRESH_E2E_REPORT);
if (reportPath) await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
console.log(`${CONTRACT}=PASS`);
