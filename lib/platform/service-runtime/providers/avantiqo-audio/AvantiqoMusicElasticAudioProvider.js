import { resolveCreativeProviderAssetUrl } from "@/lib/creative/assets/storage/resolveCreativeProviderAssetUrl";
import { getServiceSupabase } from "@/lib/shared/supabase/service";

const RUNPOD_API_BASE = "https://api.runpod.ai/v2";
const OUTPUT_BUCKET = "creative-assets";
const ENGINE_CONTRACT = "AVANTIQO_MUSIC_ELASTIC_AUDIO_ENGINE_V2";
const CAPABILITY = "ai.audio.elastic-warp";
const PROVIDER_ID = "avantiqo-audio";
const MODEL = "signalsmith-stretch";
const JOB_PREFIX = "music-elastic-audio:";
const ENDPOINT_ENV = "RUNPOD_AVANTIQO_MUSIC_ELASTIC_ENDPOINT_ID";
const ENABLED_ENV = "AVANTIQO_MUSIC_ELASTIC_ENGINE_ENABLED";
const CERTIFIED_ENV = "AVANTIQO_MUSIC_ELASTIC_ENGINE_CERTIFIED";
const TIMEOUT_ENV = "AVANTIQO_MUSIC_ELASTIC_ENGINE_TIMEOUT_MS";
const SAFE_LEASE_CONTRACT = "AVANTIQO_RUNPOD_SAFE_LEASE_V2";
const SAFE_LEASE_LANE = "music-elastic-audio";
const PLAN_CONTRACT = "AVANTIQO_MUSIC_ELASTIC_WARP_PLAN_V1";
const PRIVATE_KEYS = new Set(["signed_url", "reasoning", "reasoning_content", "chain_of_thought", "analysis"]);

function text(value) { return String(value ?? "").trim(); }
function object(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function enabled(value) { return ["1", "true", "yes", "on"].includes(text(value).toLowerCase()); }
function clean(value, depth = 0) {
  if (depth > 10) return "[depth-limited]";
  if (Array.isArray(value)) return value.map((entry) => clean(entry, depth + 1));
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).filter(([key]) => !PRIVATE_KEYS.has(String(key).toLowerCase())).map(([key, child]) => [key, clean(child, depth + 1)]));
}
function runpodStatus(value) {
  const status = text(value).toUpperCase();
  if (["COMPLETED", "COMPLETE", "SUCCEEDED", "SUCCESS", "DONE"].includes(status)) return "completed";
  if (["FAILED", "ERROR", "CANCELLED", "CANCELED", "TIMED_OUT"].includes(status)) return "failed";
  if (["IN_QUEUE", "QUEUED", "PENDING"].includes(status)) return "queued";
  return "processing";
}
function assertSafeLease(endpointId) {
  if (text(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_ACTIVE).toUpperCase() !== "YES") throw new Error("AVANTIQO_MUSIC_ELASTIC_SAFE_LEASE_ACTIVE_REQUIRED");
  if (text(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_CONTRACT) !== SAFE_LEASE_CONTRACT) throw new Error("AVANTIQO_MUSIC_ELASTIC_SAFE_LEASE_CONTRACT_INVALID");
  if (text(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_LANE) !== SAFE_LEASE_LANE) throw new Error("AVANTIQO_MUSIC_ELASTIC_SAFE_LEASE_LANE_INVALID");
  const leased = text(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_ENDPOINT_ID);
  if (!leased || leased !== endpointId) throw new Error("AVANTIQO_MUSIC_ELASTIC_SAFE_LEASE_ENDPOINT_MISMATCH");
  return { contract: SAFE_LEASE_CONTRACT, lane: SAFE_LEASE_LANE, endpoint_id: leased };
}
function configuration() {
  if (!enabled(process.env[ENABLED_ENV])) throw new Error("AVANTIQO_MUSIC_ELASTIC_ENGINE_DISABLED");
  if (!enabled(process.env[CERTIFIED_ENV])) throw new Error("AVANTIQO_MUSIC_ELASTIC_ENGINE_NOT_CERTIFIED");
  const endpointId = text(process.env[ENDPOINT_ENV]); const apiKey = text(process.env.RUNPOD_API_KEY);
  if (!endpointId) throw new Error(`${ENDPOINT_ENV}_REQUIRED`); if (!apiKey) throw new Error("RUNPOD_API_KEY_REQUIRED");
  return { baseUrl: `${RUNPOD_API_BASE}/${endpointId}`, apiKey, timeoutMs: Math.max(1000, Number(process.env[TIMEOUT_ENV] || 30000)), lease: assertSafeLease(endpointId) };
}
async function fetchWithTimeout(url, options, timeoutMs) { const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), timeoutMs); try { return await fetch(url, { ...options, signal: controller.signal }); } finally { clearTimeout(timer); } }
async function responseJson(response) { const raw = await response.text(); let body = {}; try { body = raw ? JSON.parse(raw) : {}; } catch { body = { message: raw }; } if (!response.ok) throw new Error(`AVANTIQO_MUSIC_ELASTIC_RUNPOD_REQUEST_FAILED:${response.status}:${text(body?.error || body?.message)}`); return body; }
async function outputTarget(organizationId, usageId) {
  const safeUsage = text(usageId).replace(/[^A-Za-z0-9_-]/g, ""); if (!organizationId || !safeUsage) throw new Error("AVANTIQO_MUSIC_ELASTIC_STORAGE_SCOPE_REQUIRED");
  const path = `${organizationId}/generated/avantiqo-music-elastic/${safeUsage}/elastic-render.wav`;
  const { data, error } = await getServiceSupabase().storage.from(OUTPUT_BUCKET).createSignedUploadUrl(path, { upsert: false });
  if (error) throw error; if (!data?.signedUrl) throw new Error("AVANTIQO_MUSIC_ELASTIC_SIGNED_UPLOAD_REQUIRED");
  return { signed_url: data.signedUrl, storage_reference: `storage://${OUTPUT_BUCKET}/${path}` };
}
function stripPrefix(value) { const jobId = text(value); if (!jobId.startsWith(JOB_PREFIX)) throw new Error("AVANTIQO_MUSIC_ELASTIC_JOB_PREFIX_REQUIRED"); const raw = jobId.slice(JOB_PREFIX.length); if (!raw) throw new Error("AVANTIQO_MUSIC_ELASTIC_JOB_ID_REQUIRED"); return raw; }

export const AvantiqoMusicElasticAudioProvider = {
  id: PROVIDER_ID,
  async execute(input = {}) {
    const organizationId = text(input.context?.organization_id), organizationServiceId = text(input.context?.organization_service_id), usageId = text(input.context?.usage_id);
    if (!organizationId || !organizationServiceId || !usageId) throw new Error("AVANTIQO_MUSIC_ELASTIC_GOVERNED_SERVICE_EXECUTION_REQUIRED");
    if (text(input.capability) !== CAPABILITY) throw new Error("AVANTIQO_MUSIC_ELASTIC_CAPABILITY_INVALID");
    const params = object(input.provider_parameters); const plan = clean(object(params.approved_warp_plan));
    if (text(plan.contract) !== PLAN_CONTRACT || plan.render_ready !== true || plan.all_reviewed !== true || plan.automatic_apply_forbidden !== true) throw new Error("AVANTIQO_MUSIC_ELASTIC_APPROVED_PLAN_REQUIRED");
    const sourceReference = text(input.source_audio || params.source_audio || params.source_reference); if (!sourceReference) throw new Error("AVANTIQO_MUSIC_ELASTIC_SOURCE_REQUIRED");
    const sourceAudioUrl = await resolveCreativeProviderAssetUrl({ organization_id: organizationId, value: sourceReference }); if (!sourceAudioUrl) throw new Error("AVANTIQO_MUSIC_ELASTIC_SOURCE_URL_REQUIRED");
    const target = await outputTarget(organizationId, usageId); const { baseUrl, apiKey, timeoutMs, lease } = configuration();
    const response = await fetchWithTimeout(`${baseUrl}/run`, { method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ input: { contract: ENGINE_CONTRACT, source_audio_url: sourceAudioUrl, output_upload_url: target.signed_url, source_asset_id: text(params.source_asset_id) || null, source_offset_seconds: Number(params.source_offset_seconds || 0), duration_seconds: Number(params.duration_seconds), source_file_checksum: text(params.source_file_checksum) || null, approved_warp_plan: plan } }) }, timeoutMs);
    const body = await responseJson(response); const rawJobId = text(body.id || body.job_id || body.jobId); if (!rawJobId) throw new Error("AVANTIQO_MUSIC_ELASTIC_RUNPOD_JOB_ID_REQUIRED");
    return { success: true, provider: PROVIDER_ID, model: MODEL, output: { provider_job_id: `${JOB_PREFIX}${rawJobId}`, status: runpodStatus(body.status || "IN_QUEUE"), engine_contract: ENGINE_CONTRACT, approved_warp_plan_contract: PLAN_CONTRACT, output_storage_reference: target.storage_reference, safe_lease: lease, infrastructure_provider: "RUNPOD_SERVERLESS", raw_reasoning_persisted: false } };
  },
  async getStatus(input = {}) {
    const organizationId = text(input.context?.organization_id); if (!organizationId) throw new Error("organization_id required");
    const rawJobId = stripPrefix(input.job_id || input.jobId || input.provider_job_id); const { baseUrl, apiKey, timeoutMs, lease } = configuration();
    const response = await fetchWithTimeout(`${baseUrl}/status/${encodeURIComponent(rawJobId)}`, { method: "GET", headers: { Authorization: `Bearer ${apiKey}` } }, timeoutMs); const body = await responseJson(response); const status = runpodStatus(body.status); const output = clean(object(body.output));
    if (status === "completed" && output.output_checksum) output.elastic_render = { storage_reference: text(input.output_storage_reference || input.metadata?.output_storage_reference) || null, asset_url: null };
    return { status, provider_job_id: `${JOB_PREFIX}${rawJobId}`, safe_lease: lease, ...(status === "failed" ? { error: body.error || output.error || "Elastic audio execution failed" } : {}), ...(status === "completed" ? { output } : {}), raw_reasoning_persisted: false };
  },
};

export const AVANTIQO_MUSIC_ELASTIC_JOB_PREFIX = JOB_PREFIX;
export const AVANTIQO_MUSIC_ELASTIC_ENGINE_CONTRACT = ENGINE_CONTRACT;
