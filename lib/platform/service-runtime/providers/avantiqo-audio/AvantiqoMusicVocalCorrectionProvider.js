import {
  resolveFirstCreativeProviderAssetUrl,
  resolveCreativeProviderAssetUrl,
} from "@/lib/creative/assets/storage/resolveCreativeProviderAssetUrl";
import { getServiceSupabase } from "@/lib/shared/supabase/service";

const RUNPOD_API_BASE = "https://api.runpod.ai/v2";
const OUTPUT_BUCKET = "creative-assets";
const ENGINE_CONTRACT = "AVANTIQO_MUSIC_VOCAL_CORRECTION_ENGINE_V1";
const CAPABILITY = "ai.audio.vocal-correct";
const PROVIDER_ID = "avantiqo-audio";
const MODEL = "torchcrepe-full";
const QUALITY_PROFILE = "TORCHCREPE_SIGNALSMITH_VOCAL_CORRECTION_V1";
const JOB_PREFIX = "music-vocal-correction:";
const ENDPOINT_ENV = "RUNPOD_AVANTIQO_MUSIC_VOCAL_CORRECTION_ENDPOINT_ID";
const ENABLED_ENV = "AVANTIQO_MUSIC_VOCAL_CORRECTION_ENGINE_ENABLED";
const CERTIFIED_ENV = "AVANTIQO_MUSIC_VOCAL_CORRECTION_ENGINE_CERTIFIED";
const TIMEOUT_ENV = "AVANTIQO_MUSIC_VOCAL_CORRECTION_ENGINE_TIMEOUT_MS";
const DEFAULT_TIMEOUT_MS = 30_000;
const RIGHTS_CONTRACT = "AVANTIQO_SOURCE_AUDIO_RIGHTS_ATTESTATION_V1";
const CONTENT_POLICY = "USER_RIGHTS_ATTESTATION_ONLY";
const SAFE_LEASE_CONTRACT = "AVANTIQO_RUNPOD_SAFE_LEASE_V2";
const SAFE_LEASE_LANE = "music-vocal-correction";
const OUTPUTS = Object.freeze({
  corrected_vocal_wav: Object.freeze({ file: "corrected-vocal.wav" }),
  correction_report_json: Object.freeze({ file: "correction-report.json" }),
});
const PRIVATE_KEYS = new Set([
  "reasoning",
  "reasoning_content",
  "chain_of_thought",
  "chainofthought",
  "cot",
  "thoughts",
  "scratchpad",
  "analysis",
  "signed_url",
]);

function text(value) {
  return String(value ?? "").trim();
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function enabled(value) {
  return ["1", "true", "yes", "on"].includes(text(value).toLowerCase());
}

function cleanOutput(value, depth = 0) {
  if (depth > 10) return "[depth-limited]";
  if (Array.isArray(value)) return value.map((entry) => cleanOutput(entry, depth + 1));
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !PRIVATE_KEYS.has(String(key).toLowerCase()))
      .map(([key, child]) => [key, cleanOutput(child, depth + 1)]),
  );
}

function runpodStatus(value) {
  const status = text(value).toUpperCase();
  if (["COMPLETED", "COMPLETE", "SUCCEEDED", "SUCCESS", "DONE"].includes(status)) return "completed";
  if (["FAILED", "ERROR", "CANCELLED", "CANCELED", "TIMED_OUT"].includes(status)) return "failed";
  if (["IN_QUEUE", "QUEUED", "PENDING"].includes(status)) return "queued";
  return "processing";
}

function assertSafeLease(endpointId) {
  if (text(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_ACTIVE).toUpperCase() !== "YES") {
    throw new Error("AVANTIQO_MUSIC_VOCAL_CORRECTION_SAFE_LEASE_ACTIVE_REQUIRED");
  }
  if (text(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_CONTRACT) !== SAFE_LEASE_CONTRACT) {
    throw new Error("AVANTIQO_MUSIC_VOCAL_CORRECTION_SAFE_LEASE_CONTRACT_INVALID");
  }
  if (text(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_LANE) !== SAFE_LEASE_LANE) {
    throw new Error("AVANTIQO_MUSIC_VOCAL_CORRECTION_SAFE_LEASE_LANE_INVALID");
  }
  const leasedEndpointId = text(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_ENDPOINT_ID);
  if (!leasedEndpointId || leasedEndpointId !== endpointId) {
    throw new Error("AVANTIQO_MUSIC_VOCAL_CORRECTION_SAFE_LEASE_ENDPOINT_MISMATCH");
  }
  return {
    contract: SAFE_LEASE_CONTRACT,
    lane: SAFE_LEASE_LANE,
    endpoint_id: leasedEndpointId,
  };
}

function configuration() {
  if (!enabled(process.env[ENABLED_ENV])) {
    throw new Error("AVANTIQO_MUSIC_VOCAL_CORRECTION_ENGINE_DISABLED");
  }
  if (!enabled(process.env[CERTIFIED_ENV])) {
    throw new Error("AVANTIQO_MUSIC_VOCAL_CORRECTION_ENGINE_NOT_CERTIFIED");
  }
  const endpointId = text(process.env[ENDPOINT_ENV]);
  const apiKey = text(process.env.RUNPOD_API_KEY);
  if (!endpointId) throw new Error(`${ENDPOINT_ENV}_REQUIRED`);
  if (!apiKey) throw new Error("RUNPOD_API_KEY_REQUIRED");
  if (!/^[A-Za-z0-9_-]+$/.test(endpointId)) throw new Error(`${ENDPOINT_ENV}_INVALID`);
  const lease = assertSafeLease(endpointId);
  return {
    baseUrl: `${RUNPOD_API_BASE}/${endpointId}`,
    apiKey,
    timeoutMs: Math.max(1_000, Number(process.env[TIMEOUT_ENV] || DEFAULT_TIMEOUT_MS)),
    lease,
  };
}

async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function responseJson(response) {
  const raw = await response.text();
  let body = {};
  try {
    body = raw ? JSON.parse(raw) : {};
  } catch {
    body = { message: raw };
  }
  if (!response.ok) {
    const message = text(body?.error?.message || body?.error || body?.message);
    throw new Error(
      `AVANTIQO_MUSIC_VOCAL_CORRECTION_RUNPOD_REQUEST_FAILED:${response.status}:${message || "UNKNOWN"}`,
    );
  }
  return body;
}

function rightsAttestation(input = {}) {
  const supplied = object(
    input.provider_parameters?.rights_attestation ||
      input.requirements?.rights_attestation ||
      input.metadata?.rights_attestation,
  );
  if (supplied.confirmed !== true || text(supplied.contract) !== RIGHTS_CONTRACT) {
    throw new Error("AVANTIQO_MUSIC_VOCAL_CORRECTION_SOURCE_RIGHTS_CONFIRMATION_REQUIRED");
  }
  return {
    contract: RIGHTS_CONTRACT,
    confirmed: true,
    content_restriction_policy: CONTENT_POLICY,
  };
}

async function sourceAudioUrl(input = {}) {
  const organizationId = text(input.context?.organization_id);
  if (!organizationId) throw new Error("organization_id required");
  const resolved = await resolveFirstCreativeProviderAssetUrl({
    organization_id: organizationId,
    values: [
      input.source_audio,
      input.sourceAudio,
      input.audio,
      input.source,
    ].flat(Infinity).filter(Boolean),
  });
  if (!resolved) throw new Error("AVANTIQO_MUSIC_VOCAL_CORRECTION_SOURCE_AUDIO_REQUIRED");
  return resolved;
}

async function outputUploadTargets({ organizationId, usageId }) {
  const safeUsage = text(usageId).replace(/[^A-Za-z0-9_-]/g, "");
  if (!organizationId || !safeUsage) {
    throw new Error("AVANTIQO_MUSIC_VOCAL_CORRECTION_STORAGE_SCOPE_REQUIRED");
  }
  const supabase = getServiceSupabase();
  const output = {};
  for (const [key, descriptor] of Object.entries(OUTPUTS)) {
    const path = `${organizationId}/generated/avantiqo-music-vocal-correction/${safeUsage}/${descriptor.file}`;
    const { data, error } = await supabase.storage
      .from(OUTPUT_BUCKET)
      .createSignedUploadUrl(path, { upsert: false });
    if (error) throw error;
    if (!data?.signedUrl) {
      throw new Error(`AVANTIQO_MUSIC_VOCAL_CORRECTION_SIGNED_UPLOAD_REQUIRED:${key}`);
    }
    output[key] = {
      signed_url: data.signedUrl,
      storage_reference: `storage://${OUTPUT_BUCKET}/${path}`,
    };
  }
  return output;
}

function stripJobPrefix(value) {
  const jobId = text(value);
  if (!jobId.startsWith(JOB_PREFIX)) {
    throw new Error("AVANTIQO_MUSIC_VOCAL_CORRECTION_JOB_PREFIX_REQUIRED");
  }
  const raw = jobId.slice(JOB_PREFIX.length);
  if (!raw) throw new Error("AVANTIQO_MUSIC_VOCAL_CORRECTION_JOB_ID_REQUIRED");
  return raw;
}

async function resolvedOutput(body, organizationId) {
  if (runpodStatus(body?.status) !== "completed") return null;
  const source = cleanOutput(object(body?.output));
  const correctedReference = text(source.corrected_vocal_wav);
  const reportReference = text(source.correction_report_json);
  const correctedUrl = correctedReference.startsWith(`storage://${OUTPUT_BUCKET}/`)
    ? await resolveCreativeProviderAssetUrl({ organization_id: organizationId, value: correctedReference })
    : null;
  const reportUrl = reportReference.startsWith(`storage://${OUTPUT_BUCKET}/`)
    ? await resolveCreativeProviderAssetUrl({ organization_id: organizationId, value: reportReference })
    : null;
  return {
    ...source,
    corrected_vocal: correctedReference
      ? { storage_reference: correctedReference, asset_url: correctedUrl }
      : null,
    correction_report: reportReference
      ? { storage_reference: reportReference, asset_url: reportUrl }
      : null,
  };
}

export const AvantiqoMusicVocalCorrectionProvider = {
  id: PROVIDER_ID,

  async execute(input = {}) {
    const organizationId = text(input.context?.organization_id);
    const organizationServiceId = text(input.context?.organization_service_id);
    const usageId = text(input.context?.usage_id);
    if (!organizationId || !organizationServiceId || !usageId) {
      throw new Error("AVANTIQO_MUSIC_VOCAL_CORRECTION_GOVERNED_SERVICE_EXECUTION_REQUIRED");
    }
    if (text(input.capability) !== CAPABILITY) {
      throw new Error("AVANTIQO_MUSIC_VOCAL_CORRECTION_CAPABILITY_INVALID");
    }

    const attestation = rightsAttestation(input);
    const sourceAudio = await sourceAudioUrl(input);
    const outputUploads = await outputUploadTargets({ organizationId, usageId });
    const { baseUrl, apiKey, timeoutMs, lease } = configuration();
    const correction = cleanOutput(input.provider_parameters?.correction || input.provider_parameters || {});
    if (!["vocal", "isolated_vocal"].includes(text(correction.source_role || "vocal").toLowerCase())) {
      throw new Error("AVANTIQO_MUSIC_VOCAL_CORRECTION_ISOLATED_VOCAL_REQUIRED");
    }

    const response = await fetchWithTimeout(`${baseUrl}/run`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        input: {
          contract: ENGINE_CONTRACT,
          capability: CAPABILITY,
          model: MODEL,
          quality_profile: QUALITY_PROFILE,
          source_audio: sourceAudio,
          rights_attestation: attestation,
          correction,
          output_uploads: outputUploads,
          organization_id: organizationId,
          usage_id: usageId,
        },
      }),
    }, timeoutMs);
    const body = await responseJson(response);
    const jobId = text(body.id || body.job_id || body.jobId);
    if (!jobId) throw new Error("AVANTIQO_MUSIC_VOCAL_CORRECTION_RUNPOD_JOB_ID_REQUIRED");

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
        output_storage_references: Object.fromEntries(
          Object.entries(outputUploads).map(([key, value]) => [key, value.storage_reference]),
        ),
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
    const response = await fetchWithTimeout(
      `${baseUrl}/status/${encodeURIComponent(jobId)}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: "application/json",
        },
      },
      timeoutMs,
    );
    const body = await responseJson(response);
    const status = runpodStatus(body.status);
    const output = await resolvedOutput(body, organizationId);
    return cleanOutput({
      status,
      provider_job_id: `${JOB_PREFIX}${jobId}`,
      safe_lease: lease,
      ...(status === "failed"
        ? { error: body.error || body.output?.error || "Music vocal correction execution failed" }
        : {}),
      ...(output ? { output } : {}),
      raw_reasoning_persisted: false,
    });
  },
};

export const AVANTIQO_MUSIC_VOCAL_CORRECTION_JOB_PREFIX = JOB_PREFIX;
export const AVANTIQO_MUSIC_VOCAL_CORRECTION_ENGINE_CONTRACT = ENGINE_CONTRACT;
