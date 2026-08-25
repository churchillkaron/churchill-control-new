const RUNPOD_API_BASE = "https://api.runpod.ai/v2";
const RUNPOD_REST_BASE = "https://rest.runpod.io/v1";
const MAX_STT_BYTES = 25 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 120000;
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
      endpointId: text(process.env.RUNPOD_AVANTIQO_VOICE_TTS_ENDPOINT_ID),
      endpointName: "avantiqo-voice-tts-v1",
      foundationModel:
        text(process.env.AVANTIQO_VOICE_TTS_FOUNDATION_MODEL) ||
        "resemble-ai/chatterbox:multilingual-v3",
      productModel: "avantiqo-voice-tts-v1",
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
  if (value.length > 12000) throw new Error("AVANTIQO_VOICE_TTS_TEXT_TOO_LONG");
  return value;
}

async function runSync({ endpointId, payload }) {
  const apiKey = text(process.env.RUNPOD_API_KEY);
  if (!apiKey) throw new Error("RUNPOD_API_KEY_REQUIRED");
  if (!endpointId) throw new Error("AVANTIQO_VOICE_ENDPOINT_REQUIRED");
  if (!/^[A-Za-z0-9_-]+$/.test(endpointId)) throw new Error("AVANTIQO_VOICE_ENDPOINT_INVALID");

  const timeoutMs = Math.max(
    5000,
    Number(process.env.AVANTIQO_VOICE_ENGINE_TIMEOUT_MS || DEFAULT_TIMEOUT_MS),
  );
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  try {
    response = await fetch(`${RUNPOD_API_BASE}/${endpointId}/runsync`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ input: payload }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }

  const raw = await response.text();
  let body = {};
  try {
    body = raw ? JSON.parse(raw) : {};
  } catch {
    body = { error: raw };
  }
  if (!response.ok) {
    throw new Error(`AVANTIQO_VOICE_RUNPOD_REQUEST_FAILED:${response.status}:${text(body.error || body.message)}`);
  }
  const status = text(body.status).toUpperCase();
  if (status !== "COMPLETED") {
    throw new Error(`AVANTIQO_VOICE_RUNSYNC_NOT_COMPLETED:${status || "UNKNOWN"}`);
  }
  if (!body.output || typeof body.output !== "object") {
    throw new Error("AVANTIQO_VOICE_OUTPUT_REQUIRED");
  }
  return cleanOutput(body.output);
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
        voice: text(input.voice) || null,
        response_format: "wav",
      };
    }

    const output = await runSync({
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
        ...output,
        engine_contract: "AVANTIQO_VOICE_ENGINE_V1",
        capability,
        raw_reasoning_persisted: false,
      },
    };
  },
};
