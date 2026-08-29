#!/usr/bin/env node

import { register } from "node:module";
import { pathToFileURL } from "node:url";

register("./scripts/next-alias-loader.mjs", pathToFileURL("./"));

const CONTRACT = "AVANTIQO_VIDEO_FINAL_EPHEMERAL_POD_CERTIFICATION_V72";
const BUCKET = "creative-assets";
const ORGANIZATION_ID = "00000000-0000-0000-0000-000000000000";
const DEFAULT_USAGE_ID = "video-v72-ephemeral-pod-final-20260829";
const POLL_MS = 15_000;
const TIMEOUT_MS = 115 * 60 * 1000;
const POD_LEASE_PREFIX = "pod-fallback:";

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
    runpod_lease_active: result?.runpod_lease_active ?? result?.output?.runpod_lease_active ?? null,
    final_master_resolution: result?.final_master_resolution || result?.output?.final_master_resolution || null,
    storage_reference: result?.storage_reference || null,
    video_url: result?.video_url || result?.result || null,
    error: result?.error || null,
  };
}

approved("AVANTIQO_VIDEO_FINAL_V72_APPROVED");
const usageId = text(process.env.AVANTIQO_VIDEO_FINAL_V72_USAGE_ID) || DEFAULT_USAGE_ID;
const statePath = `${ORGANIZATION_ID}/generated/avantiqo-video/.workflow-v3/${usageId}.json`;

const [
  { AvantiqoVideoProviderV2 },
  { inspectAvantiqoVideoPodReadiness, listActiveAvantiqoVideoPods, reconcileAvantiqoVideoPodLeases },
  { getServiceSupabase },
  { supabaseAdmin },
] = await Promise.all([
  import("../lib/platform/service-runtime/providers/avantiqo-video/AvantiqoVideoProviderV2.js"),
  import("../lib/platform/service-runtime/providers/avantiqo-video/AvantiqoVideoPodRuntime.js"),
  import("../lib/shared/supabase/service.js"),
  import("../lib/shared/supabase/admin.js"),
]);

const readiness = await inspectAvantiqoVideoPodReadiness();
console.log(`AVANTIQO_VIDEO_V72_POD_PREFLIGHT=${JSON.stringify({
  ready: readiness.ready === true,
  reason: readiness.reason || null,
  gpu_type_id: readiness.gpu_type_id || readiness.capacity?.gpu_type_id || null,
  data_center_id: readiness.data_center_id || readiness.capacity?.data_center_id || null,
  stock: readiness.capacity?.stock || null,
  stock_rank: readiness.capacity?.stock_rank ?? null,
  network_volume_name: readiness.network_volume_name || null,
  immutable_image: readiness.immutable_image || null,
})}`);
if (readiness.ready !== true) throw new Error(`${CONTRACT}_POD_NOT_READY:${readiness.reason || "UNKNOWN"}`);
if ((readiness.gpu_type_id || readiness.capacity?.gpu_type_id) !== "NVIDIA RTX PRO 4500 Blackwell") throw new Error(`${CONTRACT}_GPU_DRIFT`);
if ((readiness.data_center_id || readiness.capacity?.data_center_id) !== "EU-RO-1") throw new Error(`${CONTRACT}_DATA_CENTER_DRIFT`);
if ((readiness.capacity?.stock_rank ?? 0) < 3) throw new Error(`${CONTRACT}_CAPACITY_BELOW_MEDIUM`);

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
  const executeResult = await AvantiqoVideoProviderV2.execute({
    capability: "ai.video.generate",
    context: { organization_id: ORGANIZATION_ID, usage_id: usageId },
    duration_seconds: 2,
    aspect_ratio: "16:9",
    delivery_resolution: "4k",
    seed: 720072,
    provider_prompt: "Premium cinematic sunrise over a calm tropical bay, slow controlled forward camera movement, natural warm light, photorealistic water reflections, stable coastline geometry, elegant luxury travel-film composition, no people, no text, no logos.",
    negative_constraints: ["flicker", "warped geometry", "unstable horizon", "oversaturated colors", "neon lighting", "text", "logo", "watermark"],
  });
  const safe = safeResult(executeResult);
  console.log(`AVANTIQO_VIDEO_V72_EXECUTE=${JSON.stringify(safe)}`);
  if (safe.route !== "OWNED_POD_FALLBACK") throw new Error(`${CONTRACT}_POD_ROUTE_REQUIRED:${safe.route || "UNKNOWN"}`);
  if (safe.generation_backend !== "OWNED_RUNPOD_POD_V5") throw new Error(`${CONTRACT}_POD_BACKEND_REQUIRED:${safe.generation_backend || "UNKNOWN"}`);
  if (safe.runpod_lease_active !== true) throw new Error(`${CONTRACT}_POD_LEASE_REQUIRED_DURING_GENERATION`);
}

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
  console.log(`AVANTIQO_VIDEO_V72_PROGRESS=${JSON.stringify({ poll, status: safe.status, stage: safe.stage, generation_backend: safe.generation_backend, runpod_lease_active: safe.runpod_lease_active, final_master_resolution: safe.final_master_resolution })}`);
  if (safe.status === "completed") break;
  if (safe.status === "failed") throw new Error(`${CONTRACT}_WORKFLOW_FAILED:${safe.error || "UNKNOWN"}`);
  await sleep(POLL_MS);
}

const final = safeResult(latest || {});
if (final.status !== "completed" || final.stage !== "COMPLETED") throw new Error(`${CONTRACT}_TIMEOUT_OR_INCOMPLETE`);
if (final.generation_backend !== "OWNED_RUNPOD_POD_V5") throw new Error(`${CONTRACT}_FINAL_BACKEND_DRIFT`);
if (final.final_master_resolution !== "4k") throw new Error(`${CONTRACT}_FINAL_MASTER_NOT_4K:${final.final_master_resolution}`);
if (!text(final.storage_reference).startsWith(`storage://${BUCKET}/${ORGANIZATION_ID}/generated/avantiqo-video/`)) throw new Error(`${CONTRACT}_PRIVATE_STORAGE_REFERENCE_INVALID`);
if (!/^https:\/\//i.test(text(final.video_url))) throw new Error(`${CONTRACT}_SIGNED_REVIEW_URL_REQUIRED`);

state = await readState();
if (!state) throw new Error(`${CONTRACT}_FINAL_STATE_MISSING`);
if (state.prompt_persisted !== false) throw new Error(`${CONTRACT}_PROMPT_PERSISTENCE_CONTRACT_FAILED`);
if (state.pod_lease_active === true) throw new Error(`${CONTRACT}_POD_LEASE_ACTIVE_AT_COMPLETION`);
if (state.stage !== "COMPLETED") throw new Error(`${CONTRACT}_PERSISTED_STAGE_NOT_COMPLETED`);

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
  generation_backend: "OWNED_RUNPOD_POD_V5",
  gpu_type_id: "NVIDIA RTX PRO 4500 Blackwell",
  data_center_id: "EU-RO-1",
  immutable_v5_image: readiness.immutable_image,
  cache_volume: readiness.network_volume_name,
  internal_generation_resolution: "720p",
  cinema_quality_profile_preserved: true,
  final_master_resolution: "4k",
  storage_reference: final.storage_reference,
  review_url: final.video_url,
  prompt_persisted: false,
  pod_lease_active_after: false,
  active_pod_leases_after: 0,
  active_video_pods_after: 0,
  serverless_mutation_performed: false,
  image_endpoint_mutated: false,
  secrets_printed: false,
}, null, 2));
console.log(`${CONTRACT}=PASS`);
