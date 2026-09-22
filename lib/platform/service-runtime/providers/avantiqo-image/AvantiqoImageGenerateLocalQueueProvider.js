import { resolveCreativeProviderAssetUrl } from "@/lib/creative/assets/storage/resolveCreativeProviderAssetUrl";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { getServiceSupabase } from "@/lib/shared/supabase/service";

const CAPABILITY = "ai.image.generate";
const MODEL = "z-image-turbo-q3-k";
const FOUNDATION_MODEL = "Tongyi-MAI/Z-Image-Turbo";
const INFRASTRUCTURE = "AVANTIQO_LOCAL_NODE_V1";
const JOB_PREFIX = "local-image-generate:";
const OUTPUT_BUCKET = "creative-assets";

function text(value) { return String(value ?? "").trim(); }
function enabled(value) { return ["1", "true", "yes", "on"].includes(text(value).toLowerCase()); }
function object(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function boundedInt(value, fallback, minimum, maximum) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(minimum, Math.min(maximum, Math.round(number)));
}
function boundedFloat(value, fallback, minimum, maximum) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(minimum, Math.min(maximum, number));
}
function generationPrompt(input = {}) {
  return text(input.prompt || input.instruction || input.instructions || input.instructions_text || input.text);
}
async function onlineNodeAvailable() {
  if (!enabled(process.env.AVANTIQO_LOCAL_COMPUTE_QUEUE_ENABLED)) return false;
  if (text(process.env.AVANTIQO_LOCAL_IMAGE_GENERATION_ENABLED) && !enabled(process.env.AVANTIQO_LOCAL_IMAGE_GENERATION_ENABLED)) return false;
  const result = await supabaseAdmin.from("avantiqo_local_compute_nodes")
    .select("id,last_seen_at,enabled,capabilities")
    .eq("enabled", true)
    .contains("capabilities", [CAPABILITY])
    .order("last_seen_at", { ascending: false })
    .limit(4);
  if (result.error) throw result.error;
  const now = Date.now();
  return (result.data || []).some((node) => {
    const seen = new Date(node.last_seen_at || 0).getTime();
    return Number.isFinite(seen) && now - seen <= 90000;
  });
}
async function outputTarget(organizationId, usageId) {
  const safeUsage = text(usageId).replace(/[^A-Za-z0-9_-]/g, "");
  if (!organizationId || !safeUsage) throw new Error("AVANTIQO_LOCAL_IMAGE_GENERATE_STORAGE_SCOPE_REQUIRED");
  const path = `${organizationId}/generated/avantiqo-image/${safeUsage}.png`;
  const storage = getServiceSupabase();
  const upload = await storage.storage.from(OUTPUT_BUCKET).createSignedUploadUrl(path, { upsert: false });
  if (upload.error || !upload.data?.signedUrl) throw upload.error || new Error("AVANTIQO_LOCAL_IMAGE_GENERATE_UPLOAD_REQUIRED");
  return { signed_url: upload.data.signedUrl, storage_reference: `storage://${OUTPUT_BUCKET}/${path}` };
}
function rawJobId(value) {
  const id = text(value);
  if (!id.startsWith(JOB_PREFIX)) throw new Error("AVANTIQO_LOCAL_IMAGE_GENERATE_JOB_REQUIRED");
  return id.slice(JOB_PREFIX.length);
}
export function isImageGenerateLocalJob(value) { return text(value).startsWith(JOB_PREFIX); }

export const AvantiqoImageGenerateLocalQueueProvider = {
  id: "avantiqo-image",
  available: onlineNodeAvailable,
  async execute(input = {}) {
    const organizationId = text(input.context?.organization_id);
    const usageId = text(input.context?.usage_id);
    if (!organizationId || !usageId) throw new Error("AVANTIQO_LOCAL_IMAGE_GENERATE_GOVERNED_CONTEXT_REQUIRED");
    if (!(await onlineNodeAvailable())) throw new Error("AVANTIQO_LOCAL_IMAGE_GENERATE_NODE_UNAVAILABLE");
    const prompt = generationPrompt(input);
    if (!prompt) throw new Error("AVANTIQO_LOCAL_IMAGE_GENERATE_PROMPT_REQUIRED");

    const width = boundedInt(input.width || input.size?.width, 768, 256, 1024);
    const height = boundedInt(input.height || input.size?.height, 768, 256, 1024);
    if (width * height > 1_048_576) throw new Error("AVANTIQO_LOCAL_IMAGE_GENERATE_PIXEL_BUDGET_EXCEEDED");

    const storageUpload = await outputTarget(organizationId, usageId);
    const payload = {
      prompt,
      negative_prompt: text(input.negative_prompt || input.negativePrompt),
      width,
      height,
      steps: boundedInt(input.steps, 8, 1, 12),
      cfg_scale: boundedFloat(input.cfg_scale || input.guidance_scale, 1.0, 0.1, 4.0),
      seed: Number.isFinite(Number(input.seed)) ? Math.trunc(Number(input.seed)) : -1,
      storage_upload: storageUpload,
      runtime_contract: "AVANTIQO_NODE01_Z_IMAGE_TURBO_GGUF_V1",
      foundation_model: FOUNDATION_MODEL,
      quantization: "Q3_K",
      low_vram: true,
    };
    const inserted = await supabaseAdmin.from("avantiqo_local_compute_jobs").insert({
      organization_id: organizationId,
      usage_id: usageId,
      capability: CAPABILITY,
      lane: "gpu",
      workload: "image_generate",
      model: MODEL,
      payload,
      priority: 68,
      max_attempts: 2,
    }).select("id").single();
    if (inserted.error || !inserted.data?.id) throw inserted.error || new Error("AVANTIQO_LOCAL_IMAGE_GENERATE_QUEUE_INSERT_FAILED");
    return {
      success: true,
      provider: "avantiqo-image",
      model: "avantiqo-image-v1",
      output: {
        provider_job_id: `${JOB_PREFIX}${inserted.data.id}`,
        status: "queued",
        capability: CAPABILITY,
        foundation_model: FOUNDATION_MODEL,
        quantization: "Q3_K",
        storage_reference: storageUpload.storage_reference,
        infrastructure_provider: INFRASTRUCTURE,
        local_node: true,
        raw_reasoning_persisted: false,
      },
    };
  },
  async cancel(input = {}) {
    const jobId = text(input.job_id || input.jobId || input.provider_job_id);
    const organizationId = text(input.context?.organization_id);
    if (!organizationId) throw new Error("AVANTIQO_LOCAL_IMAGE_GENERATE_CANCEL_SCOPE_REQUIRED");
    const id = rawJobId(jobId);
    const result = await supabaseAdmin.from("avantiqo_local_compute_jobs")
      .update({
        status: "CANCELLED",
        payload: {},
        leased_until: null,
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        error_code: "CANCELLED_BY_CALLER",
      })
      .eq("id", id)
      .eq("organization_id", organizationId)
      .in("status", ["QUEUED", "RUNNING"])
      .select("id,status,node_id")
      .maybeSingle();
    if (result.error) throw result.error;
    return {
      success: true,
      cancelled: Boolean(result.data),
      provider_job_id: jobId,
      node_id: result.data?.node_id || null,
      exact_job_only: true,
    };
  },
  async getStatus(input = {}) {
    const jobId = text(input.job_id || input.jobId || input.provider_job_id);
    const organizationId = text(input.context?.organization_id);
    if (!organizationId) throw new Error("AVANTIQO_LOCAL_IMAGE_GENERATE_STATUS_SCOPE_REQUIRED");
    const result = await supabaseAdmin.from("avantiqo_local_compute_jobs")
      .select("status,result,metrics,error_code,node_id,model")
      .eq("id", rawJobId(jobId))
      .eq("organization_id", organizationId)
      .maybeSingle();
    if (result.error) throw result.error;
    const row = result.data;
    if (!row) return { status: "failed", provider_job_id: jobId, error: "AVANTIQO_LOCAL_IMAGE_GENERATE_JOB_NOT_FOUND" };
    const status = text(row.status).toUpperCase();
    if (status === "COMPLETED") {
      const output = object(row.result);
      const storageReference = text(output.storage_reference);
      const organizationId = text(input.context?.organization_id);
      const assetUrl = organizationId && storageReference
        ? await resolveCreativeProviderAssetUrl({ organization_id: organizationId, value: storageReference })
        : null;
      return {
        status: "completed",
        provider_job_id: jobId,
        infrastructure_provider: INFRASTRUCTURE,
        output: {
          ...output,
          ...(assetUrl ? { asset_url: assetUrl } : {}),
          node_id: row.node_id,
          metrics: object(row.metrics),
          raw_reasoning_persisted: false,
        },
      };
    }
    if (status === "CANCELLED") {
      return {
        status: "cancelled",
        provider_job_id: jobId,
        error: text(row.error_code) || "CANCELLED_BY_CALLER",
        node_id: row.node_id || null,
      };
    }
    if (status === "FAILED") {
      return { status: "failed", provider_job_id: jobId, error: text(row.error_code) || "AVANTIQO_LOCAL_IMAGE_GENERATE_FAILED" };
    }
    return {
      status: status === "RUNNING" ? "processing" : "queued",
      provider_job_id: jobId,
      infrastructure_provider: INFRASTRUCTURE,
      local_node: true,
      node_id: row.node_id || null,
      metrics: object(row.metrics),
    };
  },
};

export const AVANTIQO_IMAGE_GENERATE_LOCAL_JOB_PREFIX = JOB_PREFIX;
