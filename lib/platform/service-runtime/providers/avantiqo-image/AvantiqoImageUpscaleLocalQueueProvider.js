import { resolveFirstCreativeProviderAssetUrl, resolveCreativeProviderAssetUrl } from "@/lib/creative/assets/storage/resolveCreativeProviderAssetUrl";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { getServiceSupabase } from "@/lib/shared/supabase/service";
import { enqueueLocalComputeJob } from "../AvantiqoLocalComputeEnqueueRuntime.js";

const CAPABILITY = "ai.image.upscale";
const MODEL = "caidas/swin2SR-realworld-sr-x4-64-bsrgan-psnr";
const INFRASTRUCTURE = "AVANTIQO_LOCAL_NODE_V1";
const JOB_PREFIX = "local-image-upscale:";
const OUTPUT_BUCKET = "creative-assets";

function text(value) { return String(value ?? "").trim(); }
function enabled(value) { return ["1", "true", "yes", "on"].includes(text(value).toLowerCase()); }
function object(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function sourceCandidates(input = {}) { return [input.source_image, input.sourceImage, input.image, input.source, input.source_assets, input.sourceAssets, input.assets].flat(Infinity).filter(Boolean); }

async function onlineNodeAvailable() {
  if (!enabled(process.env.AVANTIQO_LOCAL_COMPUTE_QUEUE_ENABLED)) return false;
  if (text(process.env.AVANTIQO_LOCAL_IMAGE_UPSCALE_ENABLED) && !enabled(process.env.AVANTIQO_LOCAL_IMAGE_UPSCALE_ENABLED)) return false;
  const result = await supabaseAdmin.from("avantiqo_local_compute_nodes").select("id,last_seen_at,enabled,capabilities").eq("enabled", true).contains("capabilities", [CAPABILITY]).order("last_seen_at", { ascending: false }).limit(4);
  if (result.error) throw result.error;
  const now = Date.now();
  return (result.data || []).some((node) => {
    const seen = new Date(node.last_seen_at || 0).getTime();
    return Number.isFinite(seen) && now - seen <= 90000;
  });
}

async function outputTarget(organizationId, usageId) {
  const safeUsage = text(usageId).replace(/[^A-Za-z0-9_-]/g, "");
  if (!organizationId || !safeUsage) throw new Error("AVANTIQO_LOCAL_IMAGE_UPSCALE_STORAGE_SCOPE_REQUIRED");
  const path = `${organizationId}/generated/avantiqo-image/${safeUsage}.png`;
  const storage = getServiceSupabase();
  const upload = await storage.storage.from(OUTPUT_BUCKET).createSignedUploadUrl(path, { upsert: false });
  if (upload.error || !upload.data?.signedUrl) throw upload.error || new Error("AVANTIQO_LOCAL_IMAGE_UPSCALE_UPLOAD_REQUIRED");
  return { signed_url: upload.data.signedUrl, storage_reference: `storage://${OUTPUT_BUCKET}/${path}` };
}

function rawJobId(value) {
  const id = text(value);
  if (!id.startsWith(JOB_PREFIX)) throw new Error("AVANTIQO_LOCAL_IMAGE_UPSCALE_JOB_REQUIRED");
  return id.slice(JOB_PREFIX.length);
}

export function isImageUpscaleLocalJob(value) { return text(value).startsWith(JOB_PREFIX); }

export const AvantiqoImageUpscaleLocalQueueProvider = {
  id: "avantiqo-image",
  available: onlineNodeAvailable,
  async execute(input = {}) {
    const organizationId = text(input.context?.organization_id);
    const usageId = text(input.context?.usage_id);
    if (!organizationId || !usageId) throw new Error("AVANTIQO_LOCAL_IMAGE_UPSCALE_GOVERNED_CONTEXT_REQUIRED");
    if (!(await onlineNodeAvailable())) throw new Error("AVANTIQO_LOCAL_IMAGE_UPSCALE_NODE_UNAVAILABLE");
    const sourceUrl = await resolveFirstCreativeProviderAssetUrl({ organization_id: organizationId, values: sourceCandidates(input) });
    if (!sourceUrl) throw new Error("AVANTIQO_LOCAL_IMAGE_UPSCALE_SOURCE_REQUIRED");
    const storageUpload = await outputTarget(organizationId, usageId);
    const inserted = await enqueueLocalComputeJob({ organization_id: organizationId, usage_id: usageId, capability: CAPABILITY, lane: "gpu", workload: "image_upscale", model: MODEL, payload: { source_url: sourceUrl, storage_upload: storageUpload }, priority: 70, max_attempts: 2, input });
    return { success: true, provider: "avantiqo-image", model: "avantiqo-image-v1", output: { provider_job_id: `${JOB_PREFIX}${inserted.id}`, status: "queued", capability: CAPABILITY, storage_reference: storageUpload.storage_reference, infrastructure_provider: INFRASTRUCTURE, local_node: true, raw_reasoning_persisted: false } };
  },
  async getStatus(input = {}) {
    const jobId = text(input.job_id || input.jobId || input.provider_job_id);
    const result = await supabaseAdmin.from("avantiqo_local_compute_jobs").select("status,result,metrics,error_code,node_id,model").eq("id", rawJobId(jobId)).maybeSingle();
    if (result.error) throw result.error;
    const row = result.data;
    if (!row) return { status: "failed", provider_job_id: jobId, error: "AVANTIQO_LOCAL_IMAGE_UPSCALE_JOB_NOT_FOUND" };
    const status = text(row.status).toUpperCase();
    if (status === "COMPLETED") {
      const output = object(row.result); const storageReference = text(output.storage_reference);
      const organizationId = text(input.context?.organization_id);
      const assetUrl = organizationId && storageReference ? await resolveCreativeProviderAssetUrl({ organization_id: organizationId, value: storageReference }) : null;
      return { status: "completed", provider_job_id: jobId, infrastructure_provider: INFRASTRUCTURE, output: { ...output, ...(assetUrl ? { asset_url: assetUrl } : {}), node_id: row.node_id, metrics: object(row.metrics), raw_reasoning_persisted: false } };
    }
    if (["FAILED", "CANCELLED"].includes(status)) return { status: "failed", provider_job_id: jobId, error: text(row.error_code) || `AVANTIQO_LOCAL_IMAGE_UPSCALE_${status}` };
    return { status: status === "RUNNING" ? "processing" : "queued", provider_job_id: jobId, infrastructure_provider: INFRASTRUCTURE };
  },
};

export const AVANTIQO_IMAGE_UPSCALE_LOCAL_JOB_PREFIX = JOB_PREFIX;
