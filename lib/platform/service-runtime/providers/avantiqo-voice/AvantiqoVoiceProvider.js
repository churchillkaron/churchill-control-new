const RUNPOD_API_BASE = "https://api.runpod.ai/v2";
const RUNPOD_REST_BASE = "https://rest.runpod.io/v1";
const MAX_STT_BYTES = 25 * 1024 * 1024;
const MAX_VOICE_REFERENCE_BYTES = 20 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 120000;
const VOICE_REFERENCE_CONTRACT = "AVANTIQO_VOICE_REFERENCE_V1";
const VOICE_REFERENCE_CONSENT_BASES = new Set(["SELF", "AUTHORIZED", "LICENSED"]);
const VOICE_REFERENCE_MIME_TYPES = new Set([
  "audio/wav",
  "audio/x-wav",
  "audio/wave",
  "audio/mpeg",
  "audio/mp3",
  "audio/mp4",
  "audio/x-m4a",
  "audio/webm",
  "audio/ogg",
  "audio/flac",
]);
const ENDPOINT_CACHE = new Map();
const PRIVATE_KEYS = new Set([
  "reasoning",
  "reasoning_content",
  "chain_of_thought",
  "chainofthought",
  "cot",
  "thoughts",
  "scratchpad",
  "analysis",
]);

function text(value) {
  return String(value ?? "").trim();
}

function cleanOutput(value, depth = 0) {
  if (depth > 8) return "[depth-limited]";
  if (Array.isArray(value)) return value.map((item) => cleanOutput(item, depth + 1));
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !PRIVATE_KEYS.has(String(key).toLowerCase()))
      .map(([key, child]) => [key, cleanOutput(child, depth + 1)]),
  );
}

function normalizeListResponse(value, candidateKeys = [], depth = 0) {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== "object" || depth > 4) return null;
  for (const key of [...candidateKeys, "data", "items", "results"]) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) continue;
    const normalized = normalizeListResponse(value[key], candidateKeys, depth + 1);
    if (normalized) return normalized;
  }
  return null;
}

function runpodStatus(value) {
  const status = text(value).toUpperCase();
  if (["COMPLETED", "COMPLETE", "SUCCEEDED", "SUCCESS", "DONE"].includes(status)) {
    return "completed";
  }
  if (["FAILED", "FAILURE", "ERROR", "CANCELLED", "CANCELED", "TIMED_OUT"].includes(status)) {
    return "failed";
  }
  if (["IN_QUEUE", "QUEUED", "PENDING", "SUBMITTED"].includes(status)) {
    return "queued";
  }
  if (["IN_PROGRESS", "RUNNING", "PROCESSING"].includes(status)) {
    return "processing";
  }
  return status ? status.toLowerCase() : "processing";
}

function requireGovernedContext(input = {}) {
  const organizationId = text(input.context?.organization_id);
  const organizationServiceId = text(input.context?.organization_service_id);
  const usageId = text(input.context?.usage_id);
  if (!organizationId || !organizationServiceId || !usageId) {
    throw new Error("AVANTIQO_VOICE_GOVERNED_SERVICE_EXECUTION_REQUIRED");
  }
  return { organizationId, organizationServiceId, usageId };
}

function endpointForCapability(capability) {
  if (capability === "ai.speech.to.text") {
    return {
      capability,
      endpointId: text(process.env.RUNPOD_AVANTIQO_VOICE_STT_ENDPOINT_ID),
      endpointName: "avantiqo-voice-stt-v1",
      foundationModel:
        text(process.env.AVANTIQO_VOICE_STT_FOUNDATION_MODEL) ||
        "openai/whisper-large-v3-turbo",
      productModel: "avantiqo-voice-stt-v1",
    };
  }
  if (capability === "ai.text.to.speech") {
    return {
      capability,
      endpointId: text(process.env.RUNPOD_AVANTIQO_VOICE_TTS_ENDPOINT_ID),
      endpointName: "avantiqo-voice-tts-v1",
      foundationModel:
        text(process.env.AVANTIQO_VOICE_TTS_FOUNDATION_MODEL) ||
        "resemble-ai/chatterbox:multilingual-v3",
      productModel: "avantiqo-voice-tts-v2",
    };
  }
  throw new Error(`AVANTIQO_VOICE_CAPABILITY_NOT_IMPLEMENTED:${capability}`);
}

async function discoverEndpointId(endpointName) {
  const cached = text(ENDPOINT_CACHE.get(endpointName));
  if (cached) return cached;

  const managementKey =
    text(process.env.RUNPOD_MANAGEMENT_API_KEY) ||
    text(process.env.RUNPOD_API_KEY);
  if (!managementKey) throw new Error("RUNPOD_API_KEY_REQUIRED");

  const response = await fetch(
    `${RUNPOD_REST_BASE}/endpoints?includeTemplate=false&includeWorkers=false`,
    {
      headers: {
        Authorization: `Bearer ${managementKey}`,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(30000),
    },
  );

  const raw = await response.text();
  let body = null;
  try {
    body = raw ? JSON.parse(raw) : null;
  } catch {
    body = null;
  }
  if (!response.ok) {
    throw new Error(`AVANTIQO_VOICE_ENDPOINT_DISCOVERY_FAILED:${response.status}`);
  }

  const endpoints = normalizeListResponse(body, ["endpoints", "serverlessEndpoints"]);
  if (!endpoints) throw new Error("AVANTIQO_VOICE_ENDPOINT_LIST_INVALID");
  const matches = endpoints.filter((endpoint) => text(endpoint?.name) === endpointName);
  if (matches.length !== 1) {
    throw new Error(
      `AVANTIQO_VOICE_ENDPOINT_NAME_RESOLUTION_FAILED:name=${endpointName}:matches=${matches.length}`,
    );
  }

  const endpointId = text(matches[0]?.id);
  if (!/^[A-Za-z0-9_-]+$/.test(endpointId)) {
    throw new Error("AVANTIQO_VOICE_ENDPOINT_INVALID");
  }
  ENDPOINT_CACHE.set(endpointName, endpointId);
  return endpointId;
}

async function resolveEndpointId(endpoint) {
  const explicit = text(endpoint?.endpointId);
  if (explicit) {
    if (!/^[A-Za-z0-9_-]+$/.test(explicit)) {
      throw new Error("AVANTIQO_VOICE_ENDPOINT_INVALID");
    }
    return explicit;
  }
  const endpointName = text(endpoint?.endpointName);
  if (!endpointName) throw new Error("AVANTIQO_VOICE_ENDPOINT_NAME_REQUIRED");
  return discoverEndpointId(endpointName);
}

async function uploadAudioPayload(input = {}) {
  const upload = input.upload_file || input.file || input.audio;
  if (!upload || typeof upload.arrayBuffer !== "function") {
    throw new Error("AVANTIQO_VOICE_STT_AUDIO_FILE_REQUIRED");
  }
  const bytes = Buffer.from(await upload.arrayBuffer());
  if (!bytes.length) throw new Error("AVANTIQO_VOICE_STT_AUDIO_EMPTY");
  if (bytes.length > MAX_STT_BYTES) throw new Error("AVANTIQO_VOICE_STT_AUDIO_TOO_LARGE");
  return {
    audio_base64: bytes.toString("base64"),
    file_name: text(input.file_name || upload.name) || "voice.wav",
    mime_type: text(input.mime_type || upload.type) || "audio/wav",
    size_bytes: bytes.length,
  };
}

function speechText(input = {}) {
  const value = text(input.input || input.text || input.message);
  if (!value) throw new Error("AVANTIQO_VOICE_TTS_TEXT_REQUIRED");
  if (value.length > 6000) throw new Error("AVANTIQO_VOICE_TTS_TEXT_TOO_LONG");
  return value;
}

function normalizeVoiceReferenceObject(reference) {
  if (!reference || typeof reference !== "object" || Array.isArray(reference)) {
    throw new Error("AVANTIQO_VOICE_REFERENCE_INVALID");
  }
  const contract = text(reference.contract);
  if (contract !== VOICE_REFERENCE_CONTRACT) {
    throw new Error("AVANTIQO_VOICE_REFERENCE_CONTRACT_INVALID");
  }
  const consent = reference.consent || {};
  const consentBasis = text(consent.basis).toUpperCase();
  if (consent.confirmed !== true) {
    throw new Error("AVANTIQO_VOICE_REFERENCE_CONSENT_REQUIRED");
  }
  if (!VOICE_REFERENCE_CONSENT_BASES.has(consentBasis)) {
    throw new Error("AVANTIQO_VOICE_REFERENCE_CONSENT_BASIS_INVALID");
  }
  const mimeType = text(reference.mime_type).toLowerCase().split(";")[0];
  if (!VOICE_REFERENCE_MIME_TYPES.has(mimeType)) {
    throw new Error(`AVANTIQO_VOICE_REFERENCE_MIME_NOT_CERTIFIED:${mimeType || "missing"}`);
  }
  const audioBase64 = text(reference.audio_base64);
  if (!audioBase64) throw new Error("AVANTIQO_VOICE_REFERENCE_AUDIO_REQUIRED");
  let bytes;
  try {
    bytes = Buffer.from(audioBase64, "base64");
  } catch {
    throw new Error("AVANTIQO_VOICE_REFERENCE_BASE64_INVALID");
  }
  if (!bytes.length) throw new Error("AVANTIQO_VOICE_REFERENCE_AUDIO_EMPTY");
  if (bytes.length > MAX_VOICE_REFERENCE_BYTES) {
    throw new Error("AVANTIQO_VOICE_REFERENCE_AUDIO_TOO_LARGE");
  }
  return {
    contract: VOICE_REFERENCE_CONTRACT,
    audio_base64: bytes.toString("base64"),
    mime_type: mimeType,
    profile_id: text(reference.profile_id) || null,
    consent: {
      confirmed: true,
      basis: consentBasis,
      evidence_id: text(consent.evidence_id) || null,
    },
  };
}

async function voiceReferencePayload(input = {}) {
  const existing = input.voice_reference || input.voiceReference || null;
  if (existing) return normalizeVoiceReferenceObject(existing);

  const upload = input.voice_reference_audio || input.voiceReferenceAudio || null;
  if (!upload) return null;
  if (typeof upload.arrayBuffer !== "function") {
    throw new Error("AVANTIQO_VOICE_REFERENCE_AUDIO_FILE_REQUIRED");
  }

  const bytes = Buffer.from(await upload.arrayBuffer());
  if (!bytes.length) throw new Error("AVANTIQO_VOICE_REFERENCE_AUDIO_EMPTY");
  if (bytes.length > MAX_VOICE_REFERENCE_BYTES) {
    throw new Error("AVANTIQO_VOICE_REFERENCE_AUDIO_TOO_LARGE");
  }
  const mimeType = text(input.voice_reference_mime_type || upload.type)
    .toLowerCase()
    .split(";")[0];
  const consentBasis = text(input.voice_reference_consent_basis).toUpperCase();
  return normalizeVoiceReferenceObject({
    contract: VOICE_REFERENCE_CONTRACT,
    audio_base64: bytes.toString("base64"),
    mime_type: mimeType,
    profile_id: text(input.voice_reference_profile_id) || null,
    consent: {
      confirmed: input.voice_reference_consent_confirmed === true,
      basis: consentBasis,
      evidence_id: text(input.voice_reference_consent_evidence_id) || null,
    },
  });
}

function runtimeApiKey() {
  const apiKey = text(process.env.RUNPOD_API_KEY);
  if (!apiKey) throw new Error("RUNPOD_API_KEY_REQUIRED");
  return apiKey;
}

function requestTimeoutMs() {
  return Math.max(
    5000,
    Number(process.env.AVANTIQO_VOICE_ENGINE_TIMEOUT_MS || DEFAULT_TIMEOUT_MS),
  );
}

function requireSafeLeaseForSubmission(endpointId) {
  if (text(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_ACTIVE).toUpperCase() !== "YES") {
    throw new Error("AVANTIQO_VOICE_RUNPOD_SAFE_LEASE_REQUIRED");
  }
  const leasedEndpointId = text(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_ENDPOINT_ID);
  if (!leasedEndpointId || leasedEndpointId !== endpointId) {
    throw new Error("AVANTIQO_VOICE_RUNPOD_SAFE_LEASE_ENDPOINT_MISMATCH");
  }
}

async function runpodRequest(endpointId, requestPath, options = {}) {
  const apiKey = runtimeApiKey();
  if (!endpointId) throw new Error("AVANTIQO_VOICE_ENDPOINT_REQUIRED");
  if (!/^[A-Za-z0-9_-]+$/.test(endpointId)) throw new Error("AVANTIQO_VOICE_ENDPOINT_INVALID");

  const response = await fetch(`${RUNPOD_API_BASE}/${endpointId}${requestPath}`, {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: AbortSignal.timeout(requestTimeoutMs()),
  });

  const raw = await response.text();
  let body = {};
  try {
    body = raw ? JSON.parse(raw) : {};
  } catch {
    body = { error: raw };
  }

  return { response, body };
}

async function submitJob({ endpointId, payload }) {
  requireSafeLeaseForSubmission(endpointId);
  const { response, body } = await runpodRequest(endpointId, "/run", {
    method: "POST",
    body: { input: payload },
  });
  if (!response.ok) {
    throw new Error(
      `AVANTIQO_VOICE_RUNPOD_REQUEST_FAILED:${response.status}:${text(body.error || body.message)}`,
    );
  }

  const jobId = text(body.id || body.job_id || body.jobId);
  if (!jobId) throw new Error("AVANTIQO_VOICE_RUNPOD_JOB_ID_REQUIRED");

  const status = runpodStatus(body.status || "IN_QUEUE");
  const immediateOutput = body.output && typeof body.output === "object"
    ? cleanOutput(body.output)
    : null;

  return {
    jobId,
    status,
    immediateOutput,
  };
}

async function statusEndpointCandidates(input = {}) {
  const requestedCapability = text(input.capability || input.payload?.capability);
  if (requestedCapability) {
    const endpoint = endpointForCapability(requestedCapability);
    return [{
      ...endpoint,
      endpointId: await resolveEndpointId(endpoint),
    }];
  }

  const candidates = [];
  const resolutionErrors = [];
  for (const capability of ["ai.text.to.speech", "ai.speech.to.text"]) {
    const endpoint = endpointForCapability(capability);
    try {
      const endpointId = await resolveEndpointId(endpoint);
      if (!candidates.some((candidate) => candidate.endpointId === endpointId)) {
        candidates.push({ ...endpoint, endpointId });
      }
    } catch (error) {
      resolutionErrors.push(text(error?.message || error));
    }
  }

  if (!candidates.length) {
    throw new Error(
      `AVANTIQO_VOICE_STATUS_ENDPOINT_REQUIRED:${resolutionErrors.filter(Boolean).join("|") || "NONE"}`,
    );
  }
  return candidates;
}

async function readJobStatus(endpointId, jobId) {
  const { response, body } = await runpodRequest(
    endpointId,
    `/status/${encodeURIComponent(jobId)}`,
  );
  return { response, body };
}

export const AvantiqoVoiceProvider = {
  id: "avantiqo-voice",

  async execute(input = {}) {
    const context = requireGovernedContext(input);
    const capability = text(input.capability);
    const endpoint = endpointForCapability(capability);
    const endpointId = await resolveEndpointId(endpoint);

    let workload;
    if (capability === "ai.speech.to.text") {
      workload = {
        ...(await uploadAudioPayload(input)),
        language: text(input.language) || null,
        vocabulary_context: text(input.prompt) || null,
      };
    } else {
      workload = {
        text: speechText(input),
        language: text(input.locale || input.language).split("-")[0] || null,
        voice_profile: text(input.voice_profile || input.voiceProfile) || "avantiqo-secretary-v1",
        voice_reference: await voiceReferencePayload(input),
        response_format: "wav",
      };
    }

    const submitted = await submitJob({
      endpointId,
      payload: {
        contract: "AVANTIQO_VOICE_ENGINE_V1",
        capability,
        foundation_model: endpoint.foundationModel,
        organization_id: context.organizationId,
        usage_id: context.usageId,
        workload,
      },
    });

    return {
      success: true,
      provider: "avantiqo-voice",
      model: endpoint.productModel,
      output: {
        ...(submitted.immediateOutput || {}),
        provider_job_id: submitted.jobId,
        status: submitted.status,
        endpoint_id: endpointId,
        engine_contract: "AVANTIQO_VOICE_ENGINE_V1",
        capability,
        foundation_model: endpoint.foundationModel,
        voice_reference_contract: workload.voice_reference?.contract || null,
        recorded_reference_voice_requested: Boolean(workload.voice_reference),
        raw_reasoning_persisted: false,
      },
    };
  },

  async getStatus(input = {}) {
    const jobId = text(input.job_id || input.jobId || input.provider_job_id);
    if (!jobId) throw new Error("AVANTIQO_VOICE_RUNPOD_JOB_ID_REQUIRED");

    const candidates = await statusEndpointCandidates(input);
    for (const endpoint of candidates) {
      const { response, body } = await readJobStatus(endpoint.endpointId, jobId);
      if (response.status === 404) continue;
      if (!response.ok) {
        throw new Error(
          `AVANTIQO_VOICE_RUNPOD_STATUS_FAILED:${response.status}:${text(body.error || body.message)}`,
        );
      }

      const status = runpodStatus(body.status);
      const output = body.output && typeof body.output === "object"
        ? cleanOutput(body.output)
        : null;
      return {
        status,
        provider_job_id: jobId,
        endpoint_id: endpoint.endpointId,
        capability: endpoint.capability,
        foundation_model: endpoint.foundationModel,
        ...(status === "failed"
          ? { error: cleanOutput(body.error || body.output?.error || "Avantiqo Voice execution failed") }
          : {}),
        ...(output ? { output } : {}),
        raw_reasoning_persisted: false,
      };
    }

    throw new Error(`AVANTIQO_VOICE_RUNPOD_JOB_NOT_FOUND:${jobId}`);
  },
};
