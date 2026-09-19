import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { getServiceSupabase } from "@/lib/shared/supabase/service";
import { resolveFirstCreativeProviderAssetUrl, resolveCreativeProviderAssetUrl } from "@/lib/creative/assets/storage/resolveCreativeProviderAssetUrl";

export const AVANTIQO_MUSIC_ELASTIC_LOCAL_JOB_PREFIX = "local-music-elastic:";
const CAPABILITY = "ai.audio.elastic-warp";
const ENGINE_CONTRACT = "AVANTIQO_MUSIC_ELASTIC_AUDIO_ENGINE_V1";
const INFRASTRUCTURE = "AVANTIQO_LOCAL_NODE_V1";
const MODEL = "signalsmith-stretch";
const OUTPUT_BUCKET = "creative-assets";

function text(value) { return String(value ?? "").trim(); }
function object(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function enabled(value) { return ["1", "true", "yes", "on"].includes(text(value).toLowerCase()); }
function rawJobId(value) { const id=text(value); if (!id.startsWith(AVANTIQO_MUSIC_ELASTIC_LOCAL_JOB_PREFIX)) throw new Error("AVANTIQO_MUSIC_ELASTIC_LOCAL_JOB_ID_REQUIRED"); return id.slice(AVANTIQO_MUSIC_ELASTIC_LOCAL_JOB_PREFIX.length); }
export function isMusicElasticLocalJob(value) { return text(value).startsWith(AVANTIQO_MUSIC_ELASTIC_LOCAL_JOB_PREFIX); }

async function onlineNodeAvailable() {
  if (!enabled(process.env.AVANTIQO_LOCAL_COMPUTE_QUEUE_ENABLED ?? "true")) return false;
  if (text(process.env.AVANTIQO_LOCAL_AUDIO_ELASTIC_ENABLED) && !enabled(process.env.AVANTIQO_LOCAL_AUDIO_ELASTIC_ENABLED)) return false;
  const result = await supabaseAdmin.from("avantiqo_local_compute_nodes")
    .select("id,last_seen_at,enabled,capabilities")
    .eq("enabled", true).contains("capabilities", [CAPABILITY]).order("last_seen_at", { ascending: false }).limit(4);
  if (result.error) throw result.error;
  const now=Date.now();
  return (result.data || []).some((node) => {
    const seen=new Date(node.last_seen_at || 0).getTime();
    return Number.isFinite(seen) && (now-seen) <= 90000;
  });
}

async function preparePayload(input = {}) {
  const organizationId=text(input.context?.organization_id), usageId=text(input.context?.usage_id);
  if (!organizationId || !usageId) throw new Error("AVANTIQO_MUSIC_ELASTIC_GOVERNED_CONTEXT_REQUIRED");
  const sourceUrl = await resolveFirstCreativeProviderAssetUrl({ organization_id: organizationId, values: [input.source_audio, input.sourceAudio, input.audio, input.source].filter(Boolean) });
  if (!sourceUrl) throw new Error("AVANTIQO_MUSIC_ELASTIC_SOURCE_AUDIO_REQUIRED");
  const path=`${organizationId}/generated/avantiqo-music-elastic/${usageId.replace(/[^A-Za-z0-9_-]/g, "")}.wav`;
  const storage=getServiceSupabase();
  const upload=await storage.storage.from(OUTPUT_BUCKET).createSignedUploadUrl(path, { upsert: false });
  if (upload.error || !upload.data?.signedUrl) throw upload.error || new Error("AVANTIQO_MUSIC_ELASTIC_SIGNED_UPLOAD_REQUIRED");
  return {
    contract: ENGINE_CONTRACT,
    capability: CAPABILITY,
    source_asset_roles: { source_audio: sourceUrl },
    source_assets: [sourceUrl],
    organization_id: organizationId,
    usage_id: usageId,
    duration_seconds: input.duration_seconds || input.duration || input.generation?.duration_seconds || null,
    structured_specification: {
      generation: input.generation,
      requirements: input.requirements,
      provider_parameters: { ...object(input.generation?.provider_parameters), ...object(input.provider_parameters) },
    },
    storage_upload: { signed_url: upload.data.signedUrl, storage_reference: `storage://${OUTPUT_BUCKET}/${path}` },
  };
}

export const AvantiqoMusicElasticLocalQueueProvider = {
  id: "avantiqo-audio",
  async available() { return onlineNodeAvailable(); },
  async execute(input = {}) {
    if (text(input.capability) !== CAPABILITY) throw new Error(`AVANTIQO_MUSIC_ELASTIC_CAPABILITY_NOT_SUPPORTED:${text(input.capability)}`);
    if (!(await onlineNodeAvailable())) throw new Error("AVANTIQO_MUSIC_ELASTIC_LOCAL_NODE_UNAVAILABLE");
    const payload=await preparePayload(input);
    const inserted=await supabaseAdmin.from("avantiqo_local_compute_jobs").insert({
      organization_id: text(input.context?.organization_id), usage_id: text(input.context?.usage_id), capability: CAPABILITY,
      lane: "cpu", workload: "music_elastic", model: MODEL, payload, priority: 40, max_attempts: 2,
    }).select("id").single();
    if (inserted.error || !inserted.data?.id) throw inserted.error || new Error("AVANTIQO_MUSIC_ELASTIC_LOCAL_QUEUE_INSERT_FAILED");
    return { success:true, provider:"avantiqo-audio", model:MODEL, output:{ provider_job_id:`${AVANTIQO_MUSIC_ELASTIC_LOCAL_JOB_PREFIX}${inserted.data.id}`, status:"queued", capability:CAPABILITY, engine_contract:ENGINE_CONTRACT, infrastructure_provider:INFRASTRUCTURE, local_node:true, raw_reasoning_persisted:false } };
  },
  async getStatus(input = {}) {
    const jobId=text(input.job_id || input.jobId || input.provider_job_id), id=rawJobId(jobId), organizationId=text(input.context?.organization_id);
    const result=await supabaseAdmin.from("avantiqo_local_compute_jobs").select("status,result,metrics,error_code,node_id,model").eq("id", id).maybeSingle();
    if (result.error) throw result.error;
    const row=result.data; if (!row) return { status:"failed", provider_job_id:jobId, error:"AVANTIQO_MUSIC_ELASTIC_LOCAL_JOB_NOT_FOUND" };
    const status=text(row.status).toUpperCase();
    if (status === "COMPLETED") {
      const out=object(row.result), storageReference=text(out.storage_reference);
      const assetUrl=storageReference ? await resolveCreativeProviderAssetUrl({ organization_id: organizationId, value: storageReference }) : null;
      return { status:"completed", provider_job_id:jobId, output:{ ...out, ...(assetUrl ? { asset_url:assetUrl } : {}), infrastructure_provider:INFRASTRUCTURE, node_id:row.node_id, runtime_model:text(row.model)||MODEL, raw_reasoning_persisted:false }, infrastructure_provider:INFRASTRUCTURE };
    }
    if (["FAILED","CANCELLED"].includes(status)) return { status:"failed", provider_job_id:jobId, error:text(row.error_code)||`AVANTIQO_MUSIC_ELASTIC_LOCAL_${status}` };
    return { status: status === "RUNNING" ? "processing" : "queued", provider_job_id:jobId, infrastructure_provider:INFRASTRUCTURE };
  },
};
