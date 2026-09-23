import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { getServiceSupabase } from "@/lib/shared/supabase/service";
import { resolveCreativeProviderAssetUrl } from "@/lib/creative/assets/storage/resolveCreativeProviderAssetUrl";
import { enqueueLocalComputeJob } from "../AvantiqoLocalComputeEnqueueRuntime.js";

export const AVANTIQO_SFX_LOCAL_JOB_PREFIX = "local-sfx:";
const CAPABILITY = "ai.sfx.generate";
const MODEL = "OpenMOSS-Team/MOSS-SoundEffect-v2.0";
const PRODUCT_MODEL = "avantiqo-sfx-v1";
const INFRASTRUCTURE = "AVANTIQO_LOCAL_NODE_V1";
const OUTPUT_BUCKET = "creative-assets";

function text(value) { return String(value ?? "").trim(); }
function object(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function enabled(value) { return ["1", "true", "yes", "on"].includes(text(value).toLowerCase()); }
function rawJobId(value) {
  const id = text(value);
  if (!id.startsWith(AVANTIQO_SFX_LOCAL_JOB_PREFIX)) throw new Error("AVANTIQO_SFX_LOCAL_JOB_ID_REQUIRED");
  return id.slice(AVANTIQO_SFX_LOCAL_JOB_PREFIX.length);
}
export function isSfxLocalJob(value) { return text(value).startsWith(AVANTIQO_SFX_LOCAL_JOB_PREFIX); }

async function onlineNodeAvailable() {
  if (!enabled(process.env.AVANTIQO_LOCAL_COMPUTE_QUEUE_ENABLED ?? "true")) return false;
  if (text(process.env.AVANTIQO_LOCAL_SFX_ENABLED) && !enabled(process.env.AVANTIQO_LOCAL_SFX_ENABLED)) return false;
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
  if (!organizationId || !safeUsage) throw new Error("AVANTIQO_SFX_LOCAL_STORAGE_SCOPE_REQUIRED");
  const path = `${organizationId}/generated/avantiqo-sfx/${safeUsage}.wav`;
  const storage = getServiceSupabase();
  const upload = await storage.storage.from(OUTPUT_BUCKET).createSignedUploadUrl(path, { upsert: true });
  if (upload.error || !upload.data?.signedUrl) throw upload.error || new Error("AVANTIQO_SFX_LOCAL_UPLOAD_REQUIRED");
  return { signed_url: upload.data.signedUrl, storage_reference: `storage://${OUTPUT_BUCKET}/${path}` };
}

export const AvantiqoSfxLocalQueueProvider = {
  id: "avantiqo-audio",
  async available() { return onlineNodeAvailable(); },
  async execute(input = {}) {
    if (text(input.capability) !== CAPABILITY) throw new Error(`AVANTIQO_SFX_LOCAL_CAPABILITY_NOT_SUPPORTED:${text(input.capability)}`);
    if (!(await onlineNodeAvailable())) throw new Error("AVANTIQO_SFX_LOCAL_NODE_UNAVAILABLE");
    const organizationId = text(input.context?.organization_id || input.context?.organizationId);
    const usageId = text(input.context?.usage_id || input.context?.usageId);
    if (!organizationId || !usageId) throw new Error("AVANTIQO_SFX_LOCAL_GOVERNED_CONTEXT_REQUIRED");
    const storageUpload = await outputTarget(organizationId, usageId);
    const payload = { ...input, local_storage_upload: storageUpload };
    const inserted = await enqueueLocalComputeJob({
      organization_id: organizationId, usage_id: usageId, capability: CAPABILITY,
      lane: "cpu", workload: "sfx_generate", model: MODEL, payload, priority: 45, max_attempts: 2,
      input,
    });
    return { success: true, provider: "avantiqo-audio", model: PRODUCT_MODEL, output: {
      provider_job_id: `${AVANTIQO_SFX_LOCAL_JOB_PREFIX}${inserted.id}`, status: "queued",
      capability: CAPABILITY, engine_contract: "AVANTIQO_SFX_ENGINE_V1", foundation_model: MODEL,
      storage_reference: storageUpload.storage_reference, infrastructure_provider: INFRASTRUCTURE,
      local_node: true, execution_resource: "LOCAL_CPU", raw_reasoning_persisted: false,
    } };
  },
  async getStatus(input = {}) {
    const jobId = text(input.job_id || input.jobId || input.provider_job_id); const id = rawJobId(jobId);
    const result = await supabaseAdmin.from("avantiqo_local_compute_jobs")
      .select("status,result,metrics,error_code,node_id,model,organization_id").eq("id", id).maybeSingle();
    if (result.error) throw result.error; const row = result.data;
    if (!row) return { status: "failed", provider_job_id: jobId, error: "AVANTIQO_SFX_LOCAL_JOB_NOT_FOUND" };
    const status = text(row.status).toUpperCase();
    if (status === "COMPLETED") {
      const output = object(row.result); const storageReference = text(output.storage_reference);
      const organizationId = text(input.context?.organization_id || row.organization_id);
      const assetUrl = organizationId && storageReference ? await resolveCreativeProviderAssetUrl({ organization_id: organizationId, value: storageReference }) : null;
      return { status: "completed", provider_job_id: jobId, output: { ...output, ...(assetUrl ? { asset_url: assetUrl } : {}), node_id: row.node_id, runtime_model: text(row.model) || MODEL, metrics: object(row.metrics), local_node: true, raw_reasoning_persisted: false }, infrastructure_provider: INFRASTRUCTURE };
    }
    if (["FAILED", "CANCELLED"].includes(status)) return { status: "failed", provider_job_id: jobId, error: text(row.error_code) || `AVANTIQO_SFX_LOCAL_${status}` };
    return { status: status === "RUNNING" ? "processing" : "queued", provider_job_id: jobId, infrastructure_provider: INFRASTRUCTURE, local_node: true };
  },
};
