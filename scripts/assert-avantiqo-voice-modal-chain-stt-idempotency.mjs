import { createClient } from "@supabase/supabase-js";

const CONTRACT = "AVANTIQO_VOICE_MODAL_CHAINED_SERVICE_CERTIFICATION_V1";
const PROVIDER = "avantiqo-voice";
const TTS_CAPABILITY = "ai.text.to.speech";
const STT_CAPABILITY = "ai.speech.to.text";
const TTS_FUNCTION = "speak";
const STT_FUNCTION = "transcribe";
const RECOVERY_USAGE_ID = String(
  process.env.AVANTIQO_VOICE_MODAL_CHAIN_RECOVER_TTS_USAGE_ID || "",
).trim();
const ALLOWED_FAILED_STT_USAGE_ID = String(
  process.env.AVANTIQO_VOICE_MODAL_CHAIN_ALLOWED_FAILED_STT_USAGE_ID || "",
).trim();

function required(name) {
  const value = String(process.env[name] || "").trim();
  if (!value) throw new Error(`${CONTRACT}_${name}_REQUIRED`);
  return value;
}
function upper(value) {
  return String(value || "").trim().toUpperCase();
}
function money(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : Number.NaN;
}

if (!/^[0-9a-f-]{36}$/i.test(RECOVERY_USAGE_ID)) {
  throw new Error(`${CONTRACT}_RECOVERY_TTS_USAGE_ID_REQUIRED`);
}
if (!/^[0-9a-f-]{36}$/i.test(ALLOWED_FAILED_STT_USAGE_ID)) {
  throw new Error(`${CONTRACT}_ALLOWED_FAILED_STT_USAGE_ID_REQUIRED`);
}

const url = required("NEXT_PUBLIC_SUPABASE_URL");
const serviceRole = required("SUPABASE_SERVICE_ROLE_KEY");
const supabase = createClient(url, serviceRole, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

const { data: ttsUsage, error: ttsError } = await supabase
  .from("platform_service_usage")
  .select("id,organization_id,provider,capability,status,execution_status,provider_request_id")
  .eq("id", RECOVERY_USAGE_ID)
  .eq("provider", PROVIDER)
  .eq("capability", TTS_CAPABILITY)
  .maybeSingle();
if (ttsError) throw ttsError;
if (!ttsUsage) throw new Error(`${CONTRACT}_RECOVERY_TTS_USAGE_NOT_FOUND`);
if (upper(ttsUsage.status) !== "SUCCESS") {
  throw new Error(`${CONTRACT}_RECOVERY_TTS_USAGE_NOT_SUCCESS`);
}
if (upper(ttsUsage.execution_status) !== "SUCCESS") {
  throw new Error(`${CONTRACT}_RECOVERY_TTS_EXECUTION_NOT_SUCCESS`);
}
if (!String(ttsUsage.provider_request_id || "").startsWith(`modal-voice-direct:${TTS_FUNCTION}:`)) {
  throw new Error(`${CONTRACT}_RECOVERY_TTS_PROVIDER_JOB_INVALID`);
}

const organizationId = String(ttsUsage.organization_id || "").trim();
if (!organizationId) throw new Error(`${CONTRACT}_RECOVERY_TTS_ORGANIZATION_REQUIRED`);
const storageReference = `storage://creative-assets/${organizationId}/generated/avantiqo-voice/${RECOVERY_USAGE_ID}.wav`;
const storagePath = storageReference.slice("storage://creative-assets/".length);
const { data: storedAudio, error: storageError } = await supabase.storage
  .from("creative-assets")
  .download(storagePath);
if (storageError) throw storageError;
const storedBytes = Buffer.from(await storedAudio.arrayBuffer());
if (storedBytes.length < 44) throw new Error(`${CONTRACT}_RECOVERY_TTS_WAV_MISSING`);
if (storedBytes.subarray(0, 4).toString("ascii") !== "RIFF" || storedBytes.subarray(8, 12).toString("ascii") !== "WAVE") {
  throw new Error(`${CONTRACT}_RECOVERY_TTS_WAV_INVALID`);
}

const { data: sttRows, error: sttError } = await supabase
  .from("platform_service_usage")
  .select("id,status,execution_status,provider_request_id,charged_amount,created_at,error_message")
  .eq("organization_id", organizationId)
  .eq("provider", PROVIDER)
  .eq("capability", STT_CAPABILITY)
  .contains("metadata", {
    certification_contract: CONTRACT,
    chained_from_tts_storage_reference: storageReference,
    exact_tts_wav_reused: true,
  })
  .order("created_at", { ascending: true });
if (sttError) throw sttError;

const rows = sttRows || [];
const allowedFailed = rows.filter((row) => String(row.id || "") === ALLOWED_FAILED_STT_USAGE_ID);
const unexpected = rows.filter((row) => String(row.id || "") !== ALLOWED_FAILED_STT_USAGE_ID);
const failedRow = allowedFailed[0] || null;
const failedRowValid = Boolean(
  rows.length === 1 &&
  allowedFailed.length === 1 &&
  failedRow &&
  upper(failedRow.status) === "FAILED" &&
  upper(failedRow.execution_status) === "FAILED" &&
  Number.isFinite(money(failedRow.charged_amount)) &&
  money(failedRow.charged_amount) === 0 &&
  String(failedRow.provider_request_id || "").startsWith(`modal-voice-direct:${STT_FUNCTION}:`)
);

if (!failedRowValid || unexpected.length > 0) {
  const states = rows.map((row) => ({
    id_matches_allowed_failed_usage: String(row.id || "") === ALLOWED_FAILED_STT_USAGE_ID,
    status: String(row.status || ""),
    execution_status: String(row.execution_status || ""),
    charged_amount: money(row.charged_amount),
    provider_job_bound: String(row.provider_request_id || "").startsWith(`modal-voice-direct:${STT_FUNCTION}:`),
    created_at: row.created_at || null,
  }));
  console.log(JSON.stringify({
    success: false,
    contract: CONTRACT,
    duplicate_stt_submission_forbidden: true,
    existing_stt_usage_count: rows.length,
    existing_stt_states: states,
    allowed_failed_stt_usage_observed: allowedFailed.length === 1,
    allowed_failed_stt_usage_valid: failedRowValid,
    new_stt_submission_allowed: false,
    recovery_tts_reused: true,
    recovery_wav_bytes: storedBytes.length,
    secrets_printed: false,
  }));
  throw new Error(`${CONTRACT}_EXISTING_STT_USAGE_NO_NEW_SUBMISSION`);
}

console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  duplicate_stt_submission_forbidden: true,
  existing_stt_usage_count: rows.length,
  allowed_failed_stt_usage_observed: true,
  allowed_failed_stt_zero_charge: true,
  replacement_stt_submission_limit: 1,
  new_stt_submission_allowed: true,
  recovery_tts_reused: true,
  recovery_wav_bytes: storedBytes.length,
  production_routing_changed: false,
  pricing_changed: false,
  gpu_inference_performed: false,
  secrets_printed: false,
}));
console.log(`${CONTRACT}_STT_IDEMPOTENCY_GATE=PASS`);