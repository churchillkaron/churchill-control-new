import { supabaseAdmin } from "../../../../shared/supabase/admin.js";
import { enqueueLocalComputeJob } from "../AvantiqoLocalComputeEnqueueRuntime.js";

export const AVANTIQO_VOICE_STT_LOCAL_JOB_PREFIX = "local-voice-stt:";
const CAPABILITY = "ai.speech.to.text";
const MODEL = "openai/whisper-large-v3-turbo";
const INFRASTRUCTURE = "AVANTIQO_LOCAL_NODE_V1";

function text(value) { return String(value ?? "").trim(); }
function object(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function enabled(value) { return ["1", "true", "yes", "on"].includes(text(value).toLowerCase()); }
function rawJobId(value) {
  const id = text(value);
  if (!id.startsWith(AVANTIQO_VOICE_STT_LOCAL_JOB_PREFIX)) throw new Error("AVANTIQO_VOICE_STT_LOCAL_JOB_ID_REQUIRED");
  return id.slice(AVANTIQO_VOICE_STT_LOCAL_JOB_PREFIX.length);
}
export function isVoiceSttLocalJob(value) { return text(value).startsWith(AVANTIQO_VOICE_STT_LOCAL_JOB_PREFIX); }

async function onlineNodeAvailable() {
  if (!enabled(process.env.AVANTIQO_LOCAL_COMPUTE_QUEUE_ENABLED ?? "true")) return false;
  if (text(process.env.AVANTIQO_LOCAL_VOICE_STT_ENABLED) && !enabled(process.env.AVANTIQO_LOCAL_VOICE_STT_ENABLED)) return false;
  const result = await supabaseAdmin.from("avantiqo_local_compute_nodes")
    .select("id,last_seen_at,enabled,capabilities")
    .eq("enabled", true).contains("capabilities", [CAPABILITY]).order("last_seen_at", { ascending: false }).limit(4);
  if (result.error) throw result.error;
  const now = Date.now();
  return (result.data || []).some((node) => {
    const seen = new Date(node.last_seen_at || 0).getTime();
    return Number.isFinite(seen) && (now - seen) <= 90000;
  });
}

export const AvantiqoVoiceSttLocalQueueProvider = {
  id: "avantiqo-voice",
  async available() { return onlineNodeAvailable(); },
  async execute({ context = {}, payload = {}, productModel = "avantiqo-voice-stt-v1" } = {}) {
    if (!(await onlineNodeAvailable())) throw new Error("AVANTIQO_VOICE_STT_LOCAL_NODE_UNAVAILABLE");
    const organizationId = text(context.organizationId || context.organization_id);
    const usageId = text(context.usageId || context.usage_id);
    if (!organizationId || !usageId) throw new Error("AVANTIQO_VOICE_STT_LOCAL_GOVERNED_CONTEXT_REQUIRED");
    const inserted = await enqueueLocalComputeJob({
      organization_id: organizationId, usage_id: usageId, capability: CAPABILITY,
      lane: "gpu", workload: "voice_stt", model: MODEL, payload, priority: 80, max_attempts: 2,
      input: { ...payload },
    });
    return { success: true, provider: "avantiqo-voice", model: productModel, output: {
      provider_job_id: `${AVANTIQO_VOICE_STT_LOCAL_JOB_PREFIX}${inserted.id}`, status: "queued",
      capability: CAPABILITY, engine_contract: "AVANTIQO_VOICE_ENGINE_V1", foundation_model: MODEL,
      infrastructure_provider: INFRASTRUCTURE, local_node: true, raw_reasoning_persisted: false,
    } };
  },
  async getStatus(input = {}) {
    const jobId = text(input.job_id || input.jobId || input.provider_job_id);
    const id = rawJobId(jobId);
    const result = await supabaseAdmin.from("avantiqo_local_compute_jobs")
      .select("status,result,metrics,error_code,node_id,model").eq("id", id).maybeSingle();
    if (result.error) throw result.error;
    const row = result.data;
    if (!row) return { status: "failed", provider_job_id: jobId, error: "AVANTIQO_VOICE_STT_LOCAL_JOB_NOT_FOUND" };
    const status = text(row.status).toUpperCase();
    if (status === "COMPLETED") return { status: "completed", provider_job_id: jobId, output: {
      ...object(row.result), infrastructure_provider: INFRASTRUCTURE, node_id: row.node_id,
      runtime_model: text(row.model) || MODEL, metrics: object(row.metrics), local_node: true, raw_reasoning_persisted: false,
    }, infrastructure_provider: INFRASTRUCTURE };
    if (["FAILED", "CANCELLED"].includes(status)) return { status: "failed", provider_job_id: jobId, error: text(row.error_code) || `AVANTIQO_VOICE_STT_LOCAL_${status}` };
    return { status: status === "RUNNING" ? "processing" : "queued", provider_job_id: jobId, infrastructure_provider: INFRASTRUCTURE, local_node: true };
  },
};
