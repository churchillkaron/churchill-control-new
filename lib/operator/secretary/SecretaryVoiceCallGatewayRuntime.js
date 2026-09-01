import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { ServiceExecutionRuntime } from "@/lib/platform/service-runtime/execution/ServiceExecutionRuntime";
import { resolveOperatorVoiceLanguage } from "@/lib/operator/runtime/OperatorVoiceLanguagePolicy";
import { runSecretaryCallerTurnAutonomous } from "./SecretaryAutonomousCallbackRuntime";

const VOICE_PROVIDER = "avantiqo-voice";
const VOICE_POLL_INTERVAL_MS = 750;
const VOICE_MAX_POLLS = 360;
const VOICE_STORAGE_PREFIX = "storage://creative-assets/";
const VOICE_TURN_DEADLINE_MS = 285_000;
const VOICE_TTS_SUBMISSION_MINIMUM_REMAINING_MS = 60_000;
const MAX_RETURN_AUDIO_BYTES = 64 * 1024 * 1024;

function text(value, limit = 12000) {
  return String(value ?? "").trim().slice(0, limit);
}

function positive(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function findValue(value, keys, depth = 0) {
  if (depth > 9 || value === null || value === undefined) return null;
  if (typeof value !== "object") return null;
  for (const key of keys) {
    const direct = value[key];
    if (direct !== undefined && direct !== null && direct !== "") return direct;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findValue(item, keys, depth + 1);
      if (found !== null) return found;
    }
    return null;
  }
  for (const key of ["output", "result", "data", "response", "raw", "provider_result", "provider_status_input", "usage", "metadata"]) {
    const found = findValue(value[key], keys, depth + 1);
    if (found !== null) return found;
  }
  return null;
}

function deadlineRemainingMs(deadlineAt) {
  const deadline = Number(deadlineAt);
  if (!Number.isFinite(deadline)) return Number.POSITIVE_INFINITY;
  return Math.max(0, deadline - Date.now());
}

function requireDeadlineBudget(deadlineAt, minimumMs, phase) {
  if (deadlineRemainingMs(deadlineAt) < minimumMs) {
    throw new Error(`SECRETARY_VOICE_TURN_DEADLINE_INSUFFICIENT:${phase}`);
  }
}

async function activeCall(callId) {
  const id = text(callId, 120);
  if (!id) throw new Error("SECRETARY_VOICE_CALL_REQUIRED");
  const result = await supabaseAdmin
    .from("secretary_calls")
    .select("id,organization_id,contact_party_id,status,phone_line_id")
    .eq("id", id)
    .maybeSingle();
  if (result.error) throw result.error;
  if (!result.data) throw new Error("SECRETARY_VOICE_CALL_NOT_FOUND");
  if (!["RINGING", "ANSWERED"].includes(result.data.status)) throw new Error("SECRETARY_VOICE_CALL_NOT_ACTIVE");
  return result.data;
}

function audioFile(audio, mimeType, fileName) {
  if (audio && typeof audio.arrayBuffer === "function") return audio;
  if (!audio) throw new Error("SECRETARY_VOICE_AUDIO_REQUIRED");
  const bytes = Buffer.isBuffer(audio) ? audio : Buffer.from(audio);
  if (!bytes.length) throw new Error("SECRETARY_VOICE_AUDIO_EMPTY");
  return new Blob([bytes], { type: text(mimeType, 120) || "audio/wav" });
}

function wavDurationSeconds(bytes) {
  const buffer = Buffer.from(bytes);
  if (
    buffer.length < 44 ||
    buffer.subarray(0, 4).toString("ascii") !== "RIFF" ||
    buffer.subarray(8, 12).toString("ascii") !== "WAVE"
  ) return null;

  let offset = 12;
  let byteRate = 0;
  let dataBytes = 0;
  while (offset + 8 <= buffer.length) {
    const id = buffer.subarray(offset, offset + 4).toString("ascii");
    const size = buffer.readUInt32LE(offset + 4);
    const body = offset + 8;
    if (id === "fmt " && size >= 16 && body + 12 <= buffer.length) {
      byteRate = buffer.readUInt32LE(body + 8);
    }
    if (id === "data") {
      dataBytes = Math.min(size, Math.max(0, buffer.length - body));
      break;
    }
    offset = body + size + (size % 2);
  }
  if (!(byteRate > 0) || !(dataBytes > 0)) return null;
  return dataBytes / byteRate;
}

function inputAudioBillingSeconds({ bytes, mimeType, durationSeconds }) {
  const explicit = positive(durationSeconds);
  if (explicit) return { seconds: explicit, source: "INGRESS_DURATION_SECONDS" };

  const normalizedMime = text(mimeType, 120).toLowerCase().split(";")[0];
  if (["audio/wav", "audio/x-wav", "audio/wave"].includes(normalizedMime)) {
    const wavSeconds = wavDurationSeconds(bytes);
    if (positive(wavSeconds)) return { seconds: wavSeconds, source: "WAV_HEADER_DURATION_SECONDS" };
  }

  throw new Error("SECRETARY_VOICE_AUDIO_DURATION_SECONDS_REQUIRED_FOR_PER_SECOND_BILLING");
}

function ttsReservationSeconds(responseText) {
  const spoken = text(responseText, 12000);
  const words = spoken.split(/\s+/).filter(Boolean).length;
  const baseSeconds = words / 2;
  const sentencePauses = (spoken.match(/[.!?]+/g) || []).length * 0.35;
  const clausePauses = (spoken.match(/[,;:]+/g) || []).length * 0.15;
  const headroom = Math.max(0.5, baseSeconds * 0.15);
  return Number(Math.max(1, Math.min(600, baseSeconds + sentencePauses + clausePauses + headroom)).toFixed(6));
}

async function settleVoiceExecution({ execution, call, capability, deadlineAt }) {
  if (execution?.pending !== true) return execution;

  const provider = text(execution?.provider, 120);
  const providerJobId = text(execution?.provider_job_id, 500);
  const usageId = text(execution?.usage?.id, 200);
  if (provider !== VOICE_PROVIDER || !providerJobId || !usageId) {
    throw new Error(`SECRETARY_VOICE_PENDING_EXECUTION_INVALID:${capability}`);
  }

  for (let poll = 1; poll <= VOICE_MAX_POLLS; poll += 1) {
    if (deadlineRemainingMs(deadlineAt) <= 0) {
      throw new Error(`SECRETARY_VOICE_PROVIDER_JOB_TIMEOUT_RESUME_SAME_JOB_REQUIRED:${capability}`);
    }

    const settled = await ServiceExecutionRuntime.settle({
      organization_id: call.organization_id,
      provider,
      provider_job_id: providerJobId,
      usage_id: usageId,
      pricing: execution.pricing || {},
      quantity: execution?.usage?.quantity ?? execution?.pricing?.quantity ?? null,
      unit: execution?.usage?.unit ?? execution?.pricing?.unit ?? null,
      metadata: {
        module: "SECRETARY",
        operation: capability === "ai.speech.to.text" ? "CALLER_STT_SETTLEMENT" : "CALLER_TTS_SETTLEMENT",
        call_id: call.id,
        secretary_voice_async_settlement: true,
        duplicate_provider_submission_forbidden: true,
        voice_turn_deadline_enforced: true,
      },
      provider_status_input: { capability },
      credential_id: execution.credential_id || null,
      started_at: execution.started_at || null,
    });

    if (settled?.pending !== true) {
      if (settled?.failed === true || settled?.success === false) {
        throw new Error(`SECRETARY_VOICE_PROVIDER_JOB_FAILED:${capability}:${text(settled?.error, 800)}`);
      }
      return settled;
    }

    if (poll < VOICE_MAX_POLLS) {
      const remaining = deadlineRemainingMs(deadlineAt);
      if (remaining <= 0) {
        throw new Error(`SECRETARY_VOICE_PROVIDER_JOB_TIMEOUT_RESUME_SAME_JOB_REQUIRED:${capability}`);
      }
      await sleep(Math.min(VOICE_POLL_INTERVAL_MS, remaining));
    }
  }

  throw new Error(`SECRETARY_VOICE_PROVIDER_JOB_TIMEOUT_RESUME_SAME_JOB_REQUIRED:${capability}`);
}

async function storedVoiceAudioBase64(result, organizationId) {
  const reference = text(findValue(result, ["storage_reference"]), 2000);
  if (!reference.startsWith(VOICE_STORAGE_PREFIX)) {
    throw new Error("SECRETARY_VOICE_TTS_STORAGE_REFERENCE_REQUIRED");
  }

  const path = reference.slice(VOICE_STORAGE_PREFIX.length);
  const requiredPrefix = `${text(organizationId, 120)}/generated/avantiqo-voice/`;
  if (!path || path.includes("..") || !requiredPrefix || !path.startsWith(requiredPrefix)) {
    throw new Error("SECRETARY_VOICE_TTS_STORAGE_ORGANIZATION_PATH_INVALID");
  }
  const { data, error } = await supabaseAdmin.storage.from("creative-assets").download(path);
  if (error) throw error;
  const bytes = Buffer.from(await data.arrayBuffer());
  if (!bytes.length || bytes.length > MAX_RETURN_AUDIO_BYTES) {
    throw new Error("SECRETARY_VOICE_TTS_STORED_AUDIO_SIZE_INVALID");
  }
  return bytes.toString("base64");
}

async function transcribe({ call, audio, mimeType, fileName, language, durationSeconds, deadlineAt }) {
  const upload = audioFile(audio, mimeType, fileName);
  const bytes = Buffer.from(await upload.arrayBuffer());
  if (!bytes.length) throw new Error("SECRETARY_VOICE_AUDIO_EMPTY");
  const billing = inputAudioBillingSeconds({ bytes, mimeType: mimeType || upload.type, durationSeconds });
  const quantitySeconds = Number(billing.seconds.toFixed(6));

  const submitted = await ServiceExecutionRuntime.execute({
    organization_id: call.organization_id,
    party_id: call.contact_party_id || null,
    service_id: "ai.speech.to.text",
    input: {
      upload_file: upload,
      file_name: text(fileName, 500) || "secretary-call.wav",
      mime_type: text(mimeType, 120) || upload.type || "audio/wav",
      language: text(language, 80) || undefined,
      quantity: quantitySeconds,
    },
    metadata: {
      module: "SECRETARY",
      operation: "CALLER_STT",
      call_id: call.id,
      caller_authority: "RESTRICTED_PUBLIC_SECRETARY",
      raw_audio_persisted: false,
      external_authority_used: false,
      voice_billing_unit: "second",
      voice_billing_quantity_seconds: quantitySeconds,
      voice_billing_quantity_source: billing.source,
      voice_billing_contract: "AVANTIQO_VOICE_PER_SECOND_BILLING_V1",
      voice_turn_deadline_enforced: true,
    },
    category: "AI",
  });
  const execution = await settleVoiceExecution({
    execution: submitted,
    call,
    capability: "ai.speech.to.text",
    deadlineAt,
  });

  const transcript = text(findValue(execution, ["transcript", "text", "output_text"]), 12000);
  if (!transcript) throw new Error("SECRETARY_VOICE_TRANSCRIPT_REQUIRED");
  const detectedLanguage = text(findValue(execution, ["detected_language", "language"]), 80) || text(language, 80) || null;
  return { transcript, detected_language: detectedLanguage, execution };
}

async function synthesize({ call, responseText, detectedLanguage, deadlineAt }) {
  const plan = resolveOperatorVoiceLanguage({ detectedLanguage });
  if (!plan.voice_available) {
    return {
      audio_base64: null,
      voice_plan: plan,
      voice_available: false,
      speech_generated: false,
    };
  }

  requireDeadlineBudget(deadlineAt, VOICE_TTS_SUBMISSION_MINIMUM_REMAINING_MS, "TTS_SUBMISSION");
  const estimatedOutputSeconds = ttsReservationSeconds(responseText);
  const submitted = await ServiceExecutionRuntime.execute({
    organization_id: call.organization_id,
    party_id: call.contact_party_id || null,
    service_id: "ai.text.to.speech",
    input: {
      input: responseText,
      language: plan.language,
      locale: plan.language,
      response_format: "wav",
      quantity: estimatedOutputSeconds,
    },
    metadata: {
      module: "SECRETARY",
      operation: "CALLER_TTS",
      call_id: call.id,
      caller_authority: "RESTRICTED_PUBLIC_SECRETARY",
      voice_language: plan.language,
      raw_audio_persisted: false,
      external_authority_used: false,
      voice_billing_unit: "second",
      voice_billing_quantity_seconds: estimatedOutputSeconds,
      voice_billing_quantity_source: "TEXT_120_WPM_PLUS_PAUSE_HEADROOM_SECONDS_ESTIMATE",
      voice_billing_contract: "AVANTIQO_VOICE_PER_SECOND_BILLING_V1",
      actual_output_duration_settlement_required: true,
      voice_turn_deadline_enforced: true,
    },
    category: "AI",
  });
  const execution = await settleVoiceExecution({
    execution: submitted,
    call,
    capability: "ai.text.to.speech",
    deadlineAt,
  });
  const audioBase64 = await storedVoiceAudioBase64(execution, call.organization_id);

  return {
    audio_base64: audioBase64,
    voice_plan: plan,
    voice_available: true,
    speech_generated: true,
    execution,
  };
}

export async function runSecretaryVoiceCallChunk({
  callId,
  audio,
  mimeType = "audio/wav",
  fileName = "secretary-call.wav",
  language = null,
  durationSeconds = null,
} = {}) {
  const deadlineAt = Date.now() + VOICE_TURN_DEADLINE_MS;
  const call = await activeCall(callId);
  const stt = await transcribe({ call, audio, mimeType, fileName, language, durationSeconds, deadlineAt });
  const turn = await runSecretaryCallerTurnAutonomous({
    callId: call.id,
    message: stt.transcript,
    language: stt.detected_language,
  });
  const tts = await synthesize({
    call,
    responseText: turn.response_text,
    detectedLanguage: turn.response_language || stt.detected_language,
    deadlineAt,
  });

  return {
    status: "completed",
    contract: "AVANTIQO_SECRETARY_VOICE_CALL_GATEWAY_V2",
    call_id: call.id,
    transcript: stt.transcript,
    detected_language: stt.detected_language,
    action: turn.action,
    response_text: turn.response_text,
    response_language: turn.response_language,
    business_hours_state: turn.business_hours_state || null,
    server_allowed_actions: turn.server_allowed_actions || null,
    callback_autonomy_promoted: turn.callback_autonomy_promoted === true,
    callback_follow_up_id: turn.callback_follow_up_id || null,
    audio_base64: tts.audio_base64,
    voice_available: tts.voice_available,
    speech_generated: tts.speech_generated,
    voice_plan: tts.voice_plan,
    voice_turn_order: ["STT", "SECRETARY_INTELLIGENCE_AND_ACTION", "TTS"],
    voice_turn_deadline_ms: VOICE_TURN_DEADLINE_MS,
    asynchronous_voice_jobs_settled_inline: true,
    duplicate_voice_job_submission_per_turn: false,
    raw_audio_persisted: false,
    internal_operator_capabilities_available: false,
    external_authority_used: false,
  };
}

export default runSecretaryVoiceCallChunk;