import { resolveCreativeProviderAssetUrl } from "../../../../creative/assets/storage/resolveCreativeProviderAssetUrl.js";
import { supabaseAdmin } from "../../../../shared/supabase/admin.js";
import { getServiceSupabase } from "../../../../shared/supabase/service.js";

const CAPABILITY = "ai.video.generate";
const MODEL = "ltx-2.5-distilled-q3-k-s";
const PRODUCT_MODEL = "avantiqo-ltx-2.5";
const FOUNDATION_MODEL = "Lightricks/LTX-2.5";
const INFRASTRUCTURE = "AVANTIQO_LOCAL_NODE_V1";
const JOB_PREFIX = "local-video-ltx25:";
const OUTPUT_BUCKET = "creative-assets";

function text(value) { return String(value ?? "").trim(); }
function enabled(value) { return ["1", "true", "yes", "on"].includes(text(value).toLowerCase()); }
function object(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function boundedInt(value, fallback, minimum, maximum) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(minimum, Math.min(maximum, Math.round(number))) : fallback;
}
function rawJobId(value) {
  const id = text(value);
  if (!id.startsWith(JOB_PREFIX)) throw new Error("AVANTIQO_LOCAL_VIDEO_JOB_REQUIRED");
  return id.slice(JOB_PREFIX.length);
}
async function onlineNodeAvailable() {
  if (!enabled(process.env.AVANTIQO_LOCAL_COMPUTE_QUEUE_ENABLED)) return false;
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
  const path = `${organizationId}/generated/avantiqo-video/${safeUsage}.mp4`;
  const storage = getServiceSupabase();
  const upload = await storage.storage.from(OUTPUT_BUCKET).createSignedUploadUrl(path, { upsert: false });
  if (upload.error || !upload.data?.signedUrl) throw upload.error || new Error("AVANTIQO_LOCAL_VIDEO_UPLOAD_REQUIRED");
  return { signed_url: upload.data.signedUrl, storage_reference: `storage://${OUTPUT_BUCKET}/${path}` };
}
export function isVideoLtx25LocalJob(value) { return text(value).startsWith(JOB_PREFIX); }

export const AvantiqoVideoLocalQueueProvider = {
  id: "avantiqo-video",
  available: onlineNodeAvailable,
  async execute(input = {}) {
    if (text(input.capability).toLowerCase() !== CAPABILITY) throw new Error("AVANTIQO_VIDEO_LOCAL_CAPABILITY_NOT_SUPPORTED");
    if (!(await onlineNodeAvailable())) throw new Error("AVANTIQO_VIDEO_LOCAL_NODE_UNAVAILABLE");
    const organizationId = text(input.context?.organization_id);
    const usageId = text(input.context?.usage_id);
    if (!organizationId || !usageId) throw new Error("AVANTIQO_VIDEO_LOCAL_GOVERNED_CONTEXT_REQUIRED");
    const generation = object(input.generation);
    const prompt = text(input.prompt || input.instruction || input.instructions || input.text || generation.prompt);
    if (!prompt) throw new Error("AVANTIQO_VIDEO_LOCAL_PROMPT_REQUIRED");
    const storageUpload = await outputTarget(organizationId, usageId);
    const durationSeconds = boundedInt(input.duration_seconds || input.duration || generation.duration_seconds, 2, 1, 8);
    const fps = boundedInt(input.fps || generation.fps, 24, 8, 24);
    const aspectRatio = text(input.aspect_ratio || generation.aspect_ratio || "16:9") || "16:9";
    const seedValue = input.seed ?? generation.seed;
    const seed = Number.isFinite(Number(seedValue)) ? Math.trunc(Number(seedValue)) : -1;
    const payload = {
      prompt,
      negative_prompt: text(input.negative_prompt || input.negativePrompt || generation.negative_prompt),
      duration_seconds: durationSeconds,
      fps,
      aspect_ratio: aspectRatio,
      seed,
      storage_upload: storageUpload,
      runtime_contract: "AVANTIQO_NODE01_LTX25_GGUF_LOCAL_V1",
      foundation_model: FOUNDATION_MODEL,
      transformer_quantization: "Q3_K_S",
      execution_profile: "LOW_VRAM_6GB_CPU_OFFLOAD",
      generation_envelope: object(input.generation_envelope),
      shot_bible: object(input.shot_bible),
      shot_id: text(input.shot_id || input.shot_bible?.shot_id) || null,
    };
    const inserted = await supabaseAdmin.from("avantiqo_local_compute_jobs").insert({
      organization_id: organizationId,
      usage_id: usageId,
      capability: CAPABILITY,
      lane: "gpu",
      workload: "video_ltx25",
      model: MODEL,
      payload,
      priority: 66,
      max_attempts: 1,
    }).select("id").single();    if (inserted.error || !inserted.data?.id) throw inserted.error || new Error("AVANTIQO_VIDEO_LOCAL_QUEUE_INSERT_FAILED");
    return {
      success: true,
      provider: "avantiqo-video",
      model: PRODUCT_MODEL,
      output: {
        provider_job_id: JOB_PREFIX + inserted.data.id,
        status: "queued",
        capability: CAPABILITY,
        foundation_model: FOUNDATION_MODEL,
        infrastructure_provider: INFRASTRUCTURE,
        storage_reference: storageUpload.storage_reference,
        local_node: true,
        raw_reasoning_persisted: false,
      },
    };
  },  async getStatus(input = {}) {
    const jobId = text(input.job_id || input.jobId || input.provider_job_id);
    const result = await supabaseAdmin.from("avantiqo_local_compute_jobs")
      .select("status,result,metrics,error_code,node_id,model")
      .eq("id", rawJobId(jobId))
      .maybeSingle();
    if (result.error) throw result.error;
    const row = result.data;
    if (!row) return { status: "failed", provider_job_id: jobId, error: "AVANTIQO_VIDEO_LOCAL_JOB_NOT_FOUND" };
    const status = text(row.status).toUpperCase();    if (status === "COMPLETED") {
      const output = object(row.result);
      const storageReference = text(output.storage_reference);
      const organizationId = text(input.context?.organization_id);
      let assetUrl = null;
      if (organizationId && storageReference) {
        assetUrl = await resolveCreativeProviderAssetUrl({
          organization_id: organizationId,
          value: storageReference,
        });
      }
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
    }    if (["FAILED", "CANCELLED"].includes(status)) {
      return {
        status: "failed",
        provider_job_id: jobId,
        error: text(row.error_code) || "AVANTIQO_VIDEO_LOCAL_JOB_FAILED",
      };
    }
    return {
      status: status === "RUNNING" ? "processing" : "queued",
      provider_job_id: jobId,
      infrastructure_provider: INFRASTRUCTURE,
    };
  },
};

export const AVANTIQO_VIDEO_LOCAL_JOB_PREFIX = JOB_PREFIX;