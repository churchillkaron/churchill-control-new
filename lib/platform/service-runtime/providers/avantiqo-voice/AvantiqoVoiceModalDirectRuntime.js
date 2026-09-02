import { getServiceSupabase } from "@/lib/shared/supabase/service";
import { resolveCreativeProviderAssetUrl } from "@/lib/creative/assets/storage/resolveCreativeProviderAssetUrl";

const APP_NAME = "avantiqo-voice-owned";
const DIRECT_JOB_PREFIX = "modal-voice-direct:";
const DIRECT_TRANSPORT = "modal-js-sdk-function-call-v1";
const OUTPUT_BUCKET = "creative-assets";
const MAX_TTS_BYTES = 64 * 1024 * 1024;

let sdkPromise = null;

function text(value) { return String(value ?? "").trim(); }
function finitePositive(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}
function clean(value, depth = 0) {
  if (depth > 8) return "[depth-limited]";
  if (Array.isArray(value)) return value.map((entry) => clean(entry, depth + 1));
  if (!value || typeof value !== "object") return value;
  const privateKeys = new Set(["reasoning", "reasoning_content", "chain_of_thought", "chainofthought", "cot", "thoughts", "scratchpad", "analysis"]);
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !privateKeys.has(String(key).toLowerCase()))
    .map(([key, child]) => [key, clean(child, depth + 1)]));
}
function enabled(value) { return ["1", "true", "yes", "on"].includes(text(value).toLowerCase()); }

export function voiceModalDirectConfigured() {
  const tokenId = text(process.env.MODAL_TOKEN_ID || process.env.AVANTIQO_MODAL_TOKEN_ID);
  const tokenSecret = text(process.env.MODAL_TOKEN_SECRET || process.env.AVANTIQO_MODAL_TOKEN_SECRET);
  if (!tokenId && !tokenSecret) return false;
  if (!tokenId) throw new Error("AVANTIQO_VOICE_MODAL_TOKEN_ID_REQUIRED");
  if (!tokenSecret) throw new Error("AVANTIQO_VOICE_MODAL_TOKEN_SECRET_REQUIRED");
  return true;
}

function config() {
  if (!voiceModalDirectConfigured()) throw new Error("AVANTIQO_VOICE_MODAL_DIRECT_CONFIGURATION_REQUIRED");
  if (text(process.env.AVANTIQO_VOICE_ENGINE_ENABLED) && !enabled(process.env.AVANTIQO_VOICE_ENGINE_ENABLED)) {
    throw new Error("AVANTIQO_VOICE_ENGINE_DISABLED");
  }
  return {
    tokenId: text(process.env.MODAL_TOKEN_ID || process.env.AVANTIQO_MODAL_TOKEN_ID),
    tokenSecret: text(process.env.MODAL_TOKEN_SECRET || process.env.AVANTIQO_MODAL_TOKEN_SECRET),
    environment: text(process.env.AVANTIQO_MODAL_ENVIRONMENT || process.env.MODAL_ENVIRONMENT),
  };
}

async function modalSdk() {
  if (!sdkPromise) sdkPromise = import("modal");
  return sdkPromise;
}

async function clientFor(configValue) {
  const sdk = await modalSdk();
  return {
    sdk,
    client: new sdk.ModalClient({ tokenId: configValue.tokenId, tokenSecret: configValue.tokenSecret }),
  };
}

function functionForCapability(capability) {
  if (capability === "ai.speech.to.text") return "transcribe";
  if (capability === "ai.text.to.speech") return "speak";
  throw new Error(`AVANTIQO_VOICE_MODAL_DIRECT_CAPABILITY_INVALID:${capability}`);
}

async function directFunction(client, cfg, functionName) {
  const lookupOptions = cfg.environment ? { environment: cfg.environment } : {};
  return client.functions.fromName(APP_NAME, functionName, lookupOptions);
}

function encodeJob(functionName, callId) {
  if (!text(functionName) || !text(callId)) throw new Error("AVANTIQO_VOICE_MODAL_DIRECT_CALL_ID_REQUIRED");
  return `${DIRECT_JOB_PREFIX}${functionName}:${callId}`;
}

function parseJob(jobId) {
  const source = text(jobId);
  if (!source.startsWith(DIRECT_JOB_PREFIX)) return null;
  const remainder = source.slice(DIRECT_JOB_PREFIX.length);
  const colon = remainder.indexOf(":");
  if (colon <= 0) throw new Error("AVANTIQO_VOICE_MODAL_DIRECT_JOB_ID_INVALID");
  const functionName = remainder.slice(0, colon);
  const callId = remainder.slice(colon + 1);
  if (!["transcribe", "speak"].includes(functionName) || !callId) {
    throw new Error("AVANTIQO_VOICE_MODAL_DIRECT_JOB_ID_INVALID");
  }
  return { functionName, callId };
}

export function isVoiceModalDirectJob(jobId) {
  return text(jobId).startsWith(DIRECT_JOB_PREFIX);
}

function isZeroPollTimeout(error, sdk) {
  return error instanceof sdk.FunctionTimeoutError && /Timeout exceeded:\s*0ms/i.test(text(error?.message));
}

async function persistTtsOutput(output, { organizationId, usageId }) {
  const encoded = text(output.audio_base64);
  if (!encoded) throw new Error("AVANTIQO_VOICE_MODAL_DIRECT_TTS_AUDIO_REQUIRED");
  const bytes = Buffer.from(encoded, "base64");
  if (!bytes.length || bytes.length > MAX_TTS_BYTES) throw new Error("AVANTIQO_VOICE_MODAL_DIRECT_TTS_AUDIO_SIZE_INVALID");
  if (!organizationId || !usageId) throw new Error("AVANTIQO_VOICE_MODAL_DIRECT_STORAGE_CONTEXT_REQUIRED");

  const billingQuantitySeconds = finitePositive(
    output?.billing_quantity_seconds || output?.audio_health?.duration_seconds || output?.duration_seconds,
  );
  if (!billingQuantitySeconds) throw new Error("AVANTIQO_VOICE_MODAL_DIRECT_TTS_DURATION_REQUIRED_FOR_SETTLEMENT");

  const safeUsage = text(usageId).replace(/[^A-Za-z0-9_-]/g, "");
  if (!safeUsage) throw new Error("AVANTIQO_VOICE_MODAL_DIRECT_USAGE_ID_INVALID");
  const path = `${organizationId}/generated/avantiqo-voice/${safeUsage}.wav`;
  const supabase = getServiceSupabase();
  const { error } = await supabase.storage.from(OUTPUT_BUCKET).upload(path, bytes, {
    contentType: "audio/wav",
    upsert: true,
  });
  if (error) throw error;
  const reference = `storage://${OUTPUT_BUCKET}/${path}`;
  const assetUrl = await resolveCreativeProviderAssetUrl({ organization_id: organizationId, value: reference });
  const cleaned = { ...output };
  delete cleaned.audio_base64;
  return {
    ...cleaned,
    billing_quantity_seconds: Number(billingQuantitySeconds.toFixed(6)),
    billing_quantity_source: "GENERATED_WAV_DURATION_SECONDS",
    storage_reference: reference,
    asset_url: assetUrl,
    size_bytes: bytes.length,
    audio_persisted_by: "AVANTIQO_SERVICE_RUNTIME",
    modal_final_artifact_persistence: false,
  };
}

function validateCompletedOutput(output, capability) {
  if (!output || typeof output !== "object" || Array.isArray(output)) throw new Error("AVANTIQO_VOICE_MODAL_DIRECT_OUTPUT_OBJECT_REQUIRED");
  if (text(output.status) !== "completed") throw new Error("AVANTIQO_VOICE_MODAL_DIRECT_COMPLETED_STATUS_REQUIRED");
  if (text(output.provider) !== "avantiqo-voice") throw new Error("AVANTIQO_VOICE_MODAL_DIRECT_PROVIDER_INVALID");
  if (text(output.engine_contract) !== "AVANTIQO_VOICE_ENGINE_V1") throw new Error("AVANTIQO_VOICE_MODAL_DIRECT_ENGINE_CONTRACT_INVALID");
  if (text(output.capability) !== capability) throw new Error("AVANTIQO_VOICE_MODAL_DIRECT_CAPABILITY_MISMATCH");
  if (output.raw_reasoning_persisted !== false) throw new Error("AVANTIQO_VOICE_MODAL_DIRECT_REASONING_BOUNDARY_INVALID");
  return clean(output);
}

export async function executeVoiceModalDirect({ capability, payload, productModel, foundationModel, ttsVoiceSelection = null } = {}) {
  const cfg = config();
  const functionName = functionForCapability(capability);
  const { client } = await clientFor(cfg);
  const fn = await directFunction(client, cfg, functionName);
  const call = await fn.spawn([payload]);
  const callId = text(call.functionCallId);
  if (!callId) throw new Error("AVANTIQO_VOICE_MODAL_DIRECT_CALL_ID_REQUIRED");
  return {
    success: true,
    provider: "avantiqo-voice",
    model: productModel,
    output: {
      provider_job_id: encodeJob(functionName, callId),
      status: "queued",
      engine_contract: "AVANTIQO_VOICE_ENGINE_V1",
      capability,
      foundation_model: foundationModel,
      voice_reference_contract: ttsVoiceSelection?.voiceReference?.contract || null,
      recorded_reference_voice_requested: Boolean(ttsVoiceSelection?.voiceReference),
      voice_identity_source: ttsVoiceSelection?.identitySource || null,
      voice_identity_profile_id: ttsVoiceSelection?.identityProfileId || null,
      voice_delivery_profile: ttsVoiceSelection?.voiceProfile || null,
      infrastructure_provider: "MODAL_DIRECT_ASYNC_V1",
      modal_transport: DIRECT_TRANSPORT,
      modal_app: APP_NAME,
      modal_function: functionName,
      modal_gateway_used: false,
      runpod_safe_lease_required: false,
      raw_reasoning_persisted: false,
    },
  };
}

export async function getVoiceModalDirectStatus(input = {}) {
  const jobId = text(input.job_id || input.jobId || input.provider_job_id);
  const parsed = parseJob(jobId);
  if (!parsed) throw new Error("AVANTIQO_VOICE_MODAL_DIRECT_JOB_ID_REQUIRED");
  const cfg = config();
  const { sdk, client } = await clientFor(cfg);
  const capability = parsed.functionName === "transcribe" ? "ai.speech.to.text" : "ai.text.to.speech";
  try {
    const call = await client.functionCalls.fromId(parsed.callId);
    const raw = await call.get({ timeoutMs: 0 });
    let output = validateCompletedOutput(raw, capability);
    if (capability === "ai.text.to.speech") {
      output = await persistTtsOutput(output, {
        organizationId: text(input.context?.organization_id),
        usageId: text(input.context?.usage_id),
      });
    }
    return clean({
      status: "completed",
      provider_job_id: jobId,
      capability,
      foundation_model: text(output.foundation_model) || null,
      output,
      infrastructure_provider: "MODAL_DIRECT_ASYNC_V1",
      modal_transport: DIRECT_TRANSPORT,
      modal_app: APP_NAME,
      modal_function: parsed.functionName,
      modal_gateway_used: false,
      raw_reasoning_persisted: false,
    });
  } catch (error) {
    if (isZeroPollTimeout(error, sdk)) {
      return {
        status: "processing",
        provider_job_id: jobId,
        capability,
        infrastructure_provider: "MODAL_DIRECT_ASYNC_V1",
        modal_transport: DIRECT_TRANSPORT,
        modal_app: APP_NAME,
        modal_function: parsed.functionName,
        modal_gateway_used: false,
        raw_reasoning_persisted: false,
      };
    }
    return clean({
      status: "failed",
      provider_job_id: jobId,
      capability,
      error: `AVANTIQO_VOICE_MODAL_DIRECT_EXECUTION_FAILED:${text(error?.name || "Error")}:${text(error?.message || error).slice(0, 800)}`,
      infrastructure_provider: "MODAL_DIRECT_ASYNC_V1",
      modal_transport: DIRECT_TRANSPORT,
      modal_app: APP_NAME,
      modal_function: parsed.functionName,
      modal_gateway_used: false,
      raw_reasoning_persisted: false,
    });
  }
}

export const AVANTIQO_VOICE_MODAL_DIRECT_JOB_PREFIX = DIRECT_JOB_PREFIX;
export const AVANTIQO_VOICE_MODAL_DIRECT_TRANSPORT = DIRECT_TRANSPORT;