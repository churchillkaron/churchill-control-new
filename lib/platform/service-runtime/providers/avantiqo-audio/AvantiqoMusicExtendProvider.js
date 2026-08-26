import { resolveFirstCreativeProviderAssetUrl, resolveCreativeProviderAssetUrl } from "@/lib/creative/assets/storage/resolveCreativeProviderAssetUrl";
import { getServiceSupabase } from "@/lib/shared/supabase/service";

const RUNPOD_API_BASE = "https://api.runpod.ai/v2";
const OUTPUT_BUCKET = "creative-assets";
const ENGINE_CONTRACT = "AVANTIQO_MUSIC_EXTEND_ENGINE_V1";
const CAPABILITY = "ai.audio.extend";
const PROVIDER_ID = "avantiqo-audio";
const MODEL = "avantiqo-music-extend-v1";
const QUALITY_PROFILE = "ACE_STEP_1_5_BASE_COMPLETE_V1";
const JOB_PREFIX = "music-extend:";
const ENDPOINT_ENV = "RUNPOD_AVANTIQO_MUSIC_EXTEND_ENDPOINT_ID";
const ENABLED_ENV = "AVANTIQO_MUSIC_EXTEND_ENGINE_ENABLED";
const CERTIFIED_ENV = "AVANTIQO_MUSIC_EXTEND_ENGINE_CERTIFIED";
const TIMEOUT_ENV = "AVANTIQO_MUSIC_EXTEND_ENGINE_TIMEOUT_MS";
const RIGHTS_CONTRACT = "AVANTIQO_SOURCE_AUDIO_RIGHTS_ATTESTATION_V1";
const SAFE_LEASE_CONTRACT = "AVANTIQO_RUNPOD_SAFE_LEASE_V2";
const SAFE_LEASE_LANE = "music-extend";
const DEFAULT_TIMEOUT_MS = 30_000;

const text = (value) => String(value ?? "").trim();
const object = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};
const enabled = (value) => ["1", "true", "yes", "on"].includes(text(value).toLowerCase());

function runpodStatus(value) {
  const status = text(value).toUpperCase();
  if (["COMPLETED", "COMPLETE", "SUCCEEDED", "SUCCESS", "DONE"].includes(status)) return "completed";
  if (["FAILED", "ERROR", "CANCELLED", "CANCELED", "TIMED_OUT"].includes(status)) return "failed";
  if (["IN_QUEUE", "QUEUED", "PENDING"].includes(status)) return "queued";
  return "processing";
}

function clean(value, depth = 0) {
  if (depth > 10) return "[depth-limited]";
  if (Array.isArray(value)) return value.map((entry) => clean(entry, depth + 1));
  if (!value || typeof value !== "object") return value;
  const privateKeys = new Set(["reasoning", "reasoning_content", "chain_of_thought", "cot", "thoughts", "scratchpad", "analysis", "signed_url"]);
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !privateKeys.has(String(key).toLowerCase()))
    .map(([key, child]) => [key, clean(child, depth + 1)]));
}

function assertSafeLease(endpointId) {
  if (text(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_ACTIVE).toUpperCase() !== "YES") throw new Error("AVANTIQO_MUSIC_EXTEND_SAFE_LEASE_ACTIVE_REQUIRED");
  if (text(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_CONTRACT) !== SAFE_LEASE_CONTRACT) throw new Error("AVANTIQO_MUSIC_EXTEND_SAFE_LEASE_CONTRACT_INVALID");
  if (text(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_LANE) !== SAFE_LEASE_LANE) throw new Error("AVANTIQO_MUSIC_EXTEND_SAFE_LEASE_LANE_INVALID");
  const leasedEndpointId = text(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_ENDPOINT_ID);
  if (!endpointId || leasedEndpointId !== endpointId) throw new Error("AVANTIQO_MUSIC_EXTEND_SAFE_LEASE_ENDPOINT_MISMATCH");
  const expiresAt = Date.parse(text(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_EXPIRES_AT));
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) throw new Error("AVANTIQO_MUSIC_EXTEND_SAFE_LEASE_EXPIRED");
  return { contract: SAFE_LEASE_CONTRACT, lane: SAFE_LEASE_LANE, endpoint_id: leasedEndpointId, expires_at: new Date(expiresAt).toISOString() };
}

function configuration() {
  if (!enabled(process.env[ENABLED_ENV])) throw new Error("AVANTIQO_MUSIC_EXTEND_ENGINE_DISABLED");
  if (!enabled(process.env[CERTIFIED_ENV])) throw new Error("AVANTIQO_MUSIC_EXTEND_ENGINE_NOT_CERTIFIED");
  const endpointId = text(process.env[ENDPOINT_ENV]);
  const apiKey = text(process.env.RUNPOD_API_KEY);
  if (!endpointId) throw new Error(`${ENDPOINT_ENV}_REQUIRED`);
  if (!apiKey) throw new Error("RUNPOD_API_KEY_REQUIRED");
  if (!/^[A-Za-z0-9_-]+$/.test(endpointId)) throw new Error(`${ENDPOINT_ENV}_INVALID`);
  return {
    baseUrl: `${RUNPOD_API_BASE}/${endpointId}`,
    apiKey,
    timeoutMs: Math.max(1_000, Number(process.env[TIMEOUT_ENV] || DEFAULT_TIMEOUT_MS)),
    lease: assertSafeLease(endpointId),
  };
}

async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try { return await fetch(url, { ...options, signal: controller.signal }); }
  finally { clearTimeout(timer); }
}

async function responseJson(response) {
  const raw = await response.text();
  let body = {};
  try { body = raw ? JSON.parse(raw) : {}; } catch { body = { message: raw }; }
  if (!response.ok) throw new Error(`AVANTIQO_MUSIC_EXTEND_RUNPOD_REQUEST_FAILED:${response.status}:${text(body?.error?.message || body?.error || body?.message) || "UNKNOWN"}`);
  return body;
}

function rightsAttestation(input = {}) {
  const supplied = object(input.provider_parameters?.rights_attestation || input.requirements?.rights_attestation || input.metadata?.rights_attestation);
  if (supplied.confirmed !== true || text(supplied.contract) !== RIGHTS_CONTRACT) throw new Error("AVANTIQO_MUSIC_EXTEND_SOURCE_RIGHTS_CONFIRMATION_REQUIRED");
  return { contract: RIGHTS_CONTRACT, confirmed: true };
}

async function sourceAudioUrl(input = {}) {
  const organizationId = text(input.context?.organization_id);
  if (!organizationId) throw new Error("organization_id required");
  const resolved = await resolveFirstCreativeProviderAssetUrl({
    organization_id: organizationId,
    values: [input.source_audio, input.sourceAudio, input.audio, input.source].flat(Infinity).filter(Boolean),
  });
  if (!resolved) throw new Error("AVANTIQO_MUSIC_EXTEND_SOURCE_AUDIO_REQUIRED");
  return resolved;
}

async function outputUpload({ organizationId, usageId }) {
  const safeUsage = text(usageId).replace(/[^A-Za-z0-9_-]/g, "");
  if (!organizationId || !safeUsage) throw new Error("AVANTIQO_MUSIC_EXTEND_STORAGE_SCOPE_REQUIRED");
  const path = `${organizationId}/generated/avantiqo-music-extend/${safeUsage}.wav`;
  const { data, error } = await getServiceSupabase().storage.from(OUTPUT_BUCKET).createSignedUploadUrl(path, { upsert: false });
  if (error) throw error;
  if (!data?.signedUrl) throw new Error("AVANTIQO_MUSIC_EXTEND_SIGNED_UPLOAD_REQUIRED");
  return { signed_url: data.signedUrl, storage_reference: `storage://${OUTPUT_BUCKET}/${path}` };
}

function stripJobPrefix(value) {
  const jobId = text(value);
  if (!jobId.startsWith(JOB_PREFIX)) throw new Error("AVANTIQO_MUSIC_EXTEND_JOB_PREFIX_REQUIRED");
  const raw = jobId.slice(JOB_PREFIX.length);
  if (!raw) throw new Error("AVANTIQO_MUSIC_EXTEND_JOB_ID_REQUIRED");
  return raw;
}

export const AvantiqoMusicExtendProvider = {
  id: PROVIDER_ID,

  async execute(input = {}) {
    const organizationId = text(input.context?.organization_id);
    const organizationServiceId = text(input.context?.organization_service_id);
    const usageId = text(input.context?.usage_id);
    if (!organizationId || !organizationServiceId || !usageId) throw new Error("AVANTIQO_MUSIC_EXTEND_GOVERNED_SERVICE_EXECUTION_REQUIRED");
    if (text(input.capability) !== CAPABILITY) throw new Error("AVANTIQO_MUSIC_EXTEND_CAPABILITY_INVALID");
    const rights = rightsAttestation(input);
    const sourceAudio = await sourceAudioUrl(input);
    const storageUpload = await outputUpload({ organizationId, usageId });
    const { baseUrl, apiKey, timeoutMs, lease } = configuration();
    const response = await fetchWithTimeout(`${baseUrl}/run`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ input: {
        contract: ENGINE_CONTRACT,
        capability: CAPABILITY,
        organization_id: organizationId,
        usage_id: usageId,
        source_audio_url: sourceAudio,
        rights_attestation: rights,
        structured_specification: clean(input.structured_specification || input.requirements || {}),
        storage_upload: storageUpload,
      } }),
    }, timeoutMs);
    const body = await responseJson(response);
    const jobId = text(body.id || body.job_id || body.jobId);
    if (!jobId) throw new Error("AVANTIQO_MUSIC_EXTEND_RUNPOD_JOB_ID_REQUIRED");
    return {
      success: true,
      provider: PROVIDER_ID,
      model: MODEL,
      output: {
        provider_job_id: `${JOB_PREFIX}${jobId}`,
        status: runpodStatus(body.status || "IN_QUEUE"),
        engine_contract: ENGINE_CONTRACT,
        capability: CAPABILITY,
        quality_profile: QUALITY_PROFILE,
        safe_lease: lease,
        storage_reference: storageUpload.storage_reference,
        arrangement_completion: true,
        temporal_extension_proven: false,
        infrastructure_provider: "RUNPOD_SERVERLESS",
        raw_reasoning_persisted: false,
      },
    };
  },

  async getStatus(input = {}) {
    const organizationId = text(input.context?.organization_id);
    if (!organizationId) throw new Error("organization_id required");
    const jobId = stripJobPrefix(input.job_id || input.jobId || input.provider_job_id);
    const { baseUrl, apiKey, timeoutMs, lease } = configuration();
    const response = await fetchWithTimeout(`${baseUrl}/status/${encodeURIComponent(jobId)}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
    }, timeoutMs);
    const body = await responseJson(response);
    const status = runpodStatus(body.status);
    let output = null;
    if (status === "completed") {
      const source = clean(object(body.output));
      const reference = text(source.storage_reference);
      output = {
        ...source,
        ...(reference.startsWith(`storage://${OUTPUT_BUCKET}/`) ? {
          asset_url: await resolveCreativeProviderAssetUrl({ organization_id: organizationId, value: reference }),
        } : {}),
      };
    }
    return clean({
      status,
      provider_job_id: `${JOB_PREFIX}${jobId}`,
      safe_lease: lease,
      ...(status === "failed" ? { error: body.error || body.output?.error || "Music extend execution failed" } : {}),
      ...(output ? { output } : {}),
      raw_reasoning_persisted: false,
    });
  },
};

export const AVANTIQO_MUSIC_EXTEND_JOB_PREFIX = JOB_PREFIX;
export const AVANTIQO_MUSIC_EXTEND_ENGINE_CONTRACT = ENGINE_CONTRACT;
