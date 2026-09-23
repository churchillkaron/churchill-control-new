import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { getServiceSupabase } from "@/lib/shared/supabase/service";
import { enqueueLocalComputeJob } from "@/lib/platform/service-runtime/providers/AvantiqoLocalComputeEnqueueRuntime.js";
import { resolveFirstCreativeProviderAssetUrl, resolveCreativeProviderAssetUrl } from "@/lib/creative/assets/storage/resolveCreativeProviderAssetUrl";

const CAPABILITY = "media.ffmpeg.process";
const INFRASTRUCTURE = "AVANTIQO_LOCAL_NODE_V1";
const JOB_PREFIX = "local-media:";
const OUTPUT_BUCKET = "creative-assets";

function text(value) { return String(value ?? "").trim(); }
function enabled(value) { return ["1","true","yes","on"].includes(text(value).toLowerCase()); }
function object(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }

async function onlineNodeAvailable() {
  if (!enabled(process.env.AVANTIQO_LOCAL_COMPUTE_QUEUE_ENABLED)) return false;
  if (text(process.env.AVANTIQO_LOCAL_MEDIA_ENABLED) && !enabled(process.env.AVANTIQO_LOCAL_MEDIA_ENABLED)) return false;
  const result = await supabaseAdmin.from("avantiqo_local_compute_nodes")
    .select("id,last_seen_at,enabled,capabilities")
    .eq("enabled", true).contains("capabilities", [CAPABILITY]).order("last_seen_at", { ascending: false }).limit(4);
  if (result.error) throw result.error;
  const now = Date.now();
  return (result.data || []).some((node) => {
    const seen = new Date(node.last_seen_at || 0).getTime();
    return Number.isFinite(seen) && now - seen <= 90000;
  });
}

async function outputTarget({ organizationId, usageId, extension = "mp4" }) {
  const safeUsage = text(usageId).replace(/[^A-Za-z0-9_-]/g, "");
  const path = `${organizationId}/generated/avantiqo-local-media/${safeUsage}.${extension}`;
  const storage = getServiceSupabase();
  const upload = await storage.storage.from(OUTPUT_BUCKET).createSignedUploadUrl(path, { upsert: false });
  if (upload.error || !upload.data?.signedUrl) throw upload.error || new Error("AVANTIQO_LOCAL_MEDIA_UPLOAD_REQUIRED");
  return { signed_url: upload.data.signedUrl, storage_reference: `storage://${OUTPUT_BUCKET}/${path}` };
}

async function waitForJob(id, timeoutMs = 20 * 60 * 1000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const result = await supabaseAdmin.from("avantiqo_local_compute_jobs")
      .select("status,result,metrics,error_code,node_id,model")
      .eq("id", id).maybeSingle();
    if (result.error) throw result.error;
    const row = result.data;
    if (!row) throw new Error("AVANTIQO_LOCAL_MEDIA_JOB_NOT_FOUND");
    const status = text(row.status).toUpperCase();
    if (status === "COMPLETED") return row;
    if (["FAILED","CANCELLED"].includes(status)) throw new Error(text(row.error_code) || `AVANTIQO_LOCAL_MEDIA_${status}`);
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("AVANTIQO_LOCAL_MEDIA_TIMEOUT");
}

export async function executeLocalMediaJob({ organization_id, usage_id, operation, source, options = {}, extension = "mp4" } = {}) {
  const organizationId = text(organization_id), usageId = text(usage_id);
  if (!organizationId || !usageId) throw new Error("AVANTIQO_LOCAL_MEDIA_GOVERNED_CONTEXT_REQUIRED");
  if (!(await onlineNodeAvailable())) throw new Error("AVANTIQO_LOCAL_MEDIA_NODE_UNAVAILABLE");
  const sourceUrl = await resolveFirstCreativeProviderAssetUrl({ organization_id: organizationId, values: [source].filter(Boolean) });
  if (!sourceUrl) throw new Error("AVANTIQO_LOCAL_MEDIA_SOURCE_REQUIRED");
  const upload = await outputTarget({ organizationId, usageId, extension });
  const inserted = await enqueueLocalComputeJob({
    organization_id: organizationId,
    usage_id: usageId,
    capability: CAPABILITY,
    lane: "cpu",
    workload: "media_ffmpeg",
    model: "ffmpeg-9.0.1",
    payload: { operation: text(operation), source_url: sourceUrl, output_upload: upload, options: object(options) },
    priority: 45,
    max_attempts: 2,
    input: { execution_idempotency_key: "local-media:" + usageId + ":" + text(operation) },
  });
  const row = await waitForJob(inserted.id);
  const out = object(row.result);
  const storageReference = text(out.storage_reference || upload.storage_reference);
  const assetUrl = storageReference ? await resolveCreativeProviderAssetUrl({ organization_id: organizationId, value: storageReference }) : null;
  return { success: true, provider_job_id: `${JOB_PREFIX}${inserted.id}`, infrastructure_provider: INFRASTRUCTURE, node_id: row.node_id, model: text(row.model) || "ffmpeg-9.0.1", metrics: object(row.metrics), output: { ...out, storage_reference: storageReference, ...(assetUrl ? { asset_url: assetUrl } : {}) } };
}

export async function localMediaAvailable() { return onlineNodeAvailable(); }
export const CreativeLocalMediaQueueRuntime = Object.freeze({ capability: CAPABILITY, available: localMediaAvailable, execute: executeLocalMediaJob });
