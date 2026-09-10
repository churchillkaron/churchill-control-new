import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { resolveVoiceReferenceForExecution } from "@/lib/platform/service-runtime/providers/avantiqo-voice/AvantiqoVoiceLibrary.js";
import { insertVoiceAsyncJob, loadVoiceAsyncJob, submitVoiceService, settleVoiceJob, cancelVoiceJob, voiceText } from "./OperatorVoiceAsyncJobRuntime.js";

const CONTRACT = "AVANTIQO_OPERATOR_ASYNC_SPEECH_V2";
const CAPABILITY = "ai.text.to.speech";
const LANE = "voice-tts";

function storageReference(value, depth = 0) {
  if (depth > 10 || value == null) return null;
  if (typeof value === "string" && value.startsWith("storage://creative-assets/")) return value;
  if (Array.isArray(value)) { for (const item of value) { const found = storageReference(item, depth + 1); if (found) return found; } return null; }
  if (typeof value !== "object") return null;
  for (const key of ["storage_reference","asset_url","output","result","data","raw"]) { const found = storageReference(value[key], depth + 1); if (found) return found; }
  return null;
}

async function audioFromResult(result) {
  const ref = storageReference(result);
  if (!ref) throw new Error("AVANTIQO_OPERATOR_ASYNC_SPEECH_STORAGE_REFERENCE_REQUIRED");
  const path = ref.slice("storage://creative-assets/".length);
  if (!path || path.includes("..")) throw new Error("AVANTIQO_OPERATOR_ASYNC_SPEECH_STORAGE_REFERENCE_INVALID");
  const downloaded = await supabaseAdmin.storage.from("creative-assets").download(path);
  if (downloaded.error) throw downloaded.error;
  const audio = Buffer.from(await downloaded.data.arrayBuffer());
  if (audio.length <= 1000 || audio.subarray(0,4).toString("ascii") !== "RIFF") throw new Error("AVANTIQO_OPERATOR_ASYNC_SPEECH_WAV_INVALID");
  return audio;
}

export async function startOperatorAsyncSpeech({ organizationId, entityId = null, partyId, speechText, language, locale = null, voiceLibraryProfileId = null, deliveryProfile = null, quantity = null, metadata = {} }) {
  const organization = voiceText(organizationId); const party = voiceText(partyId); const text = voiceText(speechText);
  if (!organization || !party || !text) throw new Error("AVANTIQO_OPERATOR_ASYNC_SPEECH_INPUT_REQUIRED");
  const library = await resolveVoiceReferenceForExecution({ organizationId: organization, entityId, profileId: voiceLibraryProfileId || null });
  const job = await insertVoiceAsyncJob({ organizationId: organization, entityId, partyId: party, capability: CAPABILITY, lane: LANE, metadata: { contract: CONTRACT, module: "OPERATOR", operation: "VOICE_SPEECH", ...metadata } });
  const execution = await submitVoiceService({ job, organizationId: organization, entityId, partyId: party, capability: CAPABILITY, input: { input: text, language: language || undefined, locale: locale || undefined, voice_profile: deliveryProfile || library?.voice_profile || undefined, voice_reference: library?.voice_reference || undefined, response_format: "wav", quantity: quantity || undefined }, metadata: { module: "OPERATOR", operation: "VOICE_SPEECH_ASYNC", async_voice_contract: CONTRACT, ...metadata } });
  if (!execution?.pending) return { success: true, pending: false, contract: CONTRACT, job_id: job.id, provider: "avantiqo-voice", audio: await audioFromResult(execution) };
  return { success: true, pending: true, contract: CONTRACT, job_id: job.id, provider: "avantiqo-voice", provider_status: execution.provider_status || "PENDING", expires_at: job.expires_at };
}

export async function pollOperatorAsyncSpeech({ jobId, organizationId }) {
  const job = await loadVoiceAsyncJob({ jobId, organizationId, capability: CAPABILITY, lane: LANE, notFoundCode: "AVANTIQO_OPERATOR_ASYNC_SPEECH_JOB" });
  if (["FAILED","EXPIRED","CANCELLED"].includes(job.status)) return { success: false, pending: false, contract: CONTRACT, job_id: job.id, status: job.status, error: job.error_code || "AVANTIQO_OPERATOR_ASYNC_SPEECH_FAILED" };
  if (job.status === "COMPLETED") return { success: false, pending: false, contract: CONTRACT, job_id: job.id, status: "COMPLETED", error: "AVANTIQO_OPERATOR_ASYNC_SPEECH_RESULT_ALREADY_CONSUMED" };
  const settled = await settleVoiceJob(job, CAPABILITY, CONTRACT);
  if (settled?.pending) return { success: true, pending: true, contract: CONTRACT, job_id: job.id, provider: "avantiqo-voice", status: "PENDING", provider_status: settled.provider_status || job.provider_status };
  if (settled?.failed || settled?.success === false) return { success: false, pending: false, contract: CONTRACT, job_id: job.id, status: "FAILED", error: "Voice generation failed" };
  return { success: true, pending: false, contract: CONTRACT, job_id: job.id, provider: "avantiqo-voice", status: "COMPLETED", audio: await audioFromResult(settled) };
}

export async function cancelOperatorAsyncSpeech({ jobId, organizationId }) { const job = await loadVoiceAsyncJob({ jobId, organizationId, capability: CAPABILITY, lane: LANE, notFoundCode: "AVANTIQO_OPERATOR_ASYNC_SPEECH_JOB" }); return cancelVoiceJob(job, CONTRACT); }
export const OperatorVoiceAsyncSpeechRuntime = { start: startOperatorAsyncSpeech, poll: pollOperatorAsyncSpeech, cancel: cancelOperatorAsyncSpeech };
