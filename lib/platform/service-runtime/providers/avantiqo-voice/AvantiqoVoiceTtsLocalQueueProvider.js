import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { getServiceSupabase } from "@/lib/shared/supabase/service";
import { resolveCreativeProviderAssetUrl } from "@/lib/creative/assets/storage/resolveCreativeProviderAssetUrl";
import { enqueueLocalComputeJob } from "../AvantiqoLocalComputeEnqueueRuntime.js";

export const AVANTIQO_VOICE_TTS_LOCAL_JOB_PREFIX = "local-voice-tts:";
const CAPABILITY = "ai.text.to.speech";
const MODEL = "resemble-ai/chatterbox:multilingual-v3";
const INFRASTRUCTURE = "AVANTIQO_LOCAL_NODE_V1";
const OUTPUT_BUCKET = "creative-assets";

function text(value) { return String(value ?? "").trim(); }
function object(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function enabled(value) { return ["1", "true", "yes", "on"].includes(text(value).toLowerCase()); }
function rawJobId(value) {
  const id = text(value);
  if (!id.startsWith(AVANTIQO_VOICE_TTS_LOCAL_JOB_PREFIX)) throw new Error("AVANTIQO_VOICE_TTS_LOCAL_JOB_ID_REQUIRED");
  return id.slice(AVANTIQO_VOICE_TTS_LOCAL_JOB_PREFIX.length);
}
export function isVoiceTtsLocalJob(value) { return text(value).startsWith(AVANTIQO_VOICE_TTS_LOCAL_JOB_PREFIX); }

async function onlineNodeAvailable() {
  if (!enabled(process.env.AVANTIQO_LOCAL_COMPUTE_QUEUE_ENABLED ?? "true")) return false;
  if (text(process.env.AVANTIQO_LOCAL_VOICE_TTS_ENABLED) && !enabled(process.env.AVANTIQO_LOCAL_VOICE_TTS_ENABLED)) return false;
  const result = await supabaseAdmin.from("avantiqo_local_compute_nodes")
    .select("id,last_seen_at,enabled,capabilities").eq("enabled", true)
    .contains("capabilities", [CAPABILITY]).order("last_seen_at", { ascending: false }).limit(4);
  if (result.error) throw result.error;
  const now = Date.now();
  return (result.data || []).some((node) => {
    const seen = new Date(node.last_seen_at || 0).getTime();
    return Number.isFinite(seen) && (now - seen) <= 90000;
  });
}

async function outputTarget(organizationId, usageId) {
  const safeUsage = text(usageId).replace(/[^A-Za-z0-9_-]/g, "");
  if (!organizationId || !safeUsage) throw new Error("AVANTIQO_VOICE_TTS_LOCAL_STORAGE_SCOPE_REQUIRED");
  const path = `${organizationId}/generated/avantiqo-voice/${safeUsage}.wav`;
  const storage = getServiceSupabase();
  const upload = await storage.storage.from(OUTPUT_BUCKET).createSignedUploadUrl(path, { upsert: true });
  if (upload.error || !upload.data?.signedUrl) throw upload.error || new Error("AVANTIQO_VOICE_TTS_LOCAL_UPLOAD_REQUIRED");
  return { signed_url: upload.data.signedUrl, storage_reference: `storage://${OUTPUT_BUCKET}/${path}` };
}

export const AvantiqoVoiceTtsLocalQueueProvider = {
  id: "avantiqo-voice",
  async available() { return onlineNodeAvailable(); },
  async execute({ context = {}, payload = {}, productModel = "avantiqo-voice-tts-v2", ttsVoiceSelection = null } = {}) {
    if (!(await onlineNodeAvailable())) throw new Error("AVANTIQO_VOICE_TTS_LOCAL_NODE_UNAVAILABLE");
    const organizationId = text(context.organizationId || context.organization_id);
    const usageId = text(context.usageId || context.usage_id);
    if (!organizationId || !usageId) throw new Error("AVANTIQO_VOICE_TTS_LOCAL_GOVERNED_CONTEXT_REQUIRED");
    const storageUpload = await outputTarget(organizationId, usageId);
    const queuePayload = { ...payload, local_storage_upload: storageUpload };
    const inserted = await enqueueLocalComputeJob({ organization_id: organizationId, usage_id: usageId, capability: CAPABILITY, lane: "gpu", workload: "voice_tts", model: MODEL, payload: queuePayload, priority: 35, max_attempts: 2, input: { ...input, ...queuePayload } });
    return { success: true, provider: "avantiqo-voice", model: productModel, output: { provider_job_id: `${AVANTIQO_VOICE_TTS_LOCAL_JOB_PREFIX}${inserted.id}`, status: "queued", capability: CAPABILITY, engine_contract: "AVANTIQO_VOICE_ENGINE_V1", foundation_model: MODEL, storage_reference: storageUpload.storage_reference, voice_reference_contract: ttsVoiceSelection?.voiceReference?.contract || null, recorded_reference_voice_requested: Boolean(ttsVoiceSelection?.voiceReference), voice_identity_source: ttsVoiceSelection?.identitySource || null, voice_identity_profile_id: ttsVoiceSelection?.identityProfileId || null, voice_delivery_profile: ttsVoiceSelection?.voiceProfile || null, infrastructure_provider: INFRASTRUCTURE, local_node: true, local_tts_mode: "LOCAL_GPU_FIRST_MODAL_FALLBACK", raw_reasoning_persisted: false } };
  },
  async getStatus(input = {}) {
    const jobId = text(input.job_id || input.jobId || input.provider_job_id); const id = rawJobId(jobId);
    const result = await supabaseAdmin.from("avantiqo_local_compute_jobs").select("status,result,metrics,error_code,node_id,model,organization_id").eq("id", id).maybeSingle();
    if (result.error) throw result.error; const row = result.data;
    if (!row) return { status: "failed", provider_job_id: jobId, error: "AVANTIQO_VOICE_TTS_LOCAL_JOB_NOT_FOUND" };
    const status = text(row.status).toUpperCase();
    if (status === "COMPLETED") {
      const output = object(row.result); const storageReference = text(output.storage_reference);
      const organizationId = text(input.context?.organization_id || row.organization_id);
      const assetUrl = organizationId && storageReference ? await resolveCreativeProviderAssetUrl({ organization_id: organizationId, value: storageReference }) : null;
      return { status: "completed", provider_job_id: jobId, output: { ...output, ...(assetUrl ? { asset_url: assetUrl } : {}), node_id: row.node_id, runtime_model: text(row.model) || MODEL, metrics: object(row.metrics), local_node: true, raw_reasoning_persisted: false }, infrastructure_provider: INFRASTRUCTURE };
    }
    if (["FAILED", "CANCELLED"].includes(status)) return { status: "failed", provider_job_id: jobId, error: text(row.error_code) || `AVANTIQO_VOICE_TTS_LOCAL_${status}` };
    return { status: status === "RUNNING" ? "processing" : "queued", provider_job_id: jobId, infrastructure_provider: INFRASTRUCTURE, local_node: true };
  },
};
