import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { ServiceExecutionRuntime } from "@/lib/platform/service-runtime/execution/ServiceExecutionRuntime";
import { resolveOperatorVoiceLanguage } from "@/lib/operator/runtime/OperatorVoiceLanguagePolicy";
import { runSecretaryCallerTurn } from "./SecretaryCallerConversationRuntime";

function text(value, limit = 12000) {
  return String(value ?? "").trim().slice(0, limit);
}

function findValue(value, keys, depth = 0) {
  if (depth > 7 || value === null || value === undefined) return null;
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
  for (const key of ["output", "result", "data", "response", "raw"]) {
    const found = findValue(value[key], keys, depth + 1);
    if (found !== null) return found;
  }
  return null;
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

async function transcribe({ call, audio, mimeType, fileName, language }) {
  const upload = audioFile(audio, mimeType, fileName);
  const execution = await ServiceExecutionRuntime.execute({
    organization_id: call.organization_id,
    party_id: call.contact_party_id || null,
    service_id: "ai.speech.to.text",
    input: {
      upload_file: upload,
      file_name: text(fileName, 500) || "secretary-call.wav",
      mime_type: text(mimeType, 120) || upload.type || "audio/wav",
      language: text(language, 80) || undefined,
      quantity: 1,
    },
    metadata: {
      module: "SECRETARY",
      operation: "CALLER_STT",
      call_id: call.id,
      caller_authority: "RESTRICTED_PUBLIC_SECRETARY",
      raw_audio_persisted: false,
      external_authority_used: false,
    },
    category: "AI",
  });

  const transcript = text(findValue(execution, ["transcript", "text", "output_text"]), 12000);
  if (!transcript) throw new Error("SECRETARY_VOICE_TRANSCRIPT_REQUIRED");
  const detectedLanguage = text(findValue(execution, ["detected_language", "language"]), 80) || text(language, 80) || null;
  return { transcript, detected_language: detectedLanguage, execution };
}

async function synthesize({ call, responseText, detectedLanguage }) {
  const plan = resolveOperatorVoiceLanguage({ detectedLanguage });
  if (!plan.voice_available) {
    return {
      audio_base64: null,
      voice_plan: plan,
      voice_available: false,
      speech_generated: false,
    };
  }

  const words = responseText.split(/\s+/).filter(Boolean).length;
  const execution = await ServiceExecutionRuntime.execute({
    organization_id: call.organization_id,
    party_id: call.contact_party_id || null,
    service_id: "ai.text.to.speech",
    input: {
      input: responseText,
      language: plan.language,
      locale: plan.language,
      response_format: "wav",
      quantity: Math.max(0.02, Math.min(10, words / 150)),
    },
    metadata: {
      module: "SECRETARY",
      operation: "CALLER_TTS",
      call_id: call.id,
      caller_authority: "RESTRICTED_PUBLIC_SECRETARY",
      voice_language: plan.language,
      raw_audio_persisted: false,
      external_authority_used: false,
    },
    category: "AI",
  });
  const audioBase64 = text(findValue(execution, ["audio_base64"]), 100000000);
  if (!audioBase64) throw new Error("SECRETARY_VOICE_TTS_AUDIO_REQUIRED");
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
} = {}) {
  const call = await activeCall(callId);
  const stt = await transcribe({ call, audio, mimeType, fileName, language });
  const turn = await runSecretaryCallerTurn({
    callId: call.id,
    message: stt.transcript,
    language: stt.detected_language,
  });
  const tts = await synthesize({
    call,
    responseText: turn.response_text,
    detectedLanguage: turn.response_language || stt.detected_language,
  });

  return {
    status: "completed",
    contract: "AVANTIQO_SECRETARY_VOICE_CALL_GATEWAY_V1",
    call_id: call.id,
    transcript: stt.transcript,
    detected_language: stt.detected_language,
    action: turn.action,
    response_text: turn.response_text,
    response_language: turn.response_language,
    audio_base64: tts.audio_base64,
    voice_available: tts.voice_available,
    speech_generated: tts.speech_generated,
    voice_plan: tts.voice_plan,
    raw_audio_persisted: false,
    internal_operator_capabilities_available: false,
    external_authority_used: false,
  };
}

export default runSecretaryVoiceCallChunk;
