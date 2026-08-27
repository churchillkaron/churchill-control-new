import { existsSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";

const CONTRACT = "AVANTIQO_VOICE_TTS_V2_PROOF_RESULT_INSPECTION_V1";
const SOURCE_CONTRACT = "AVANTIQO_VOICE_TTS_COLD_START_SMOKE_V2";
const ENGINE_CONTRACT = "AVANTIQO_VOICE_ENGINE_V1";
const PRODUCT_MODEL = "avantiqo-voice-tts-v2";
const FOUNDATION_MODEL = "resemble-ai/chatterbox:multilingual-v3";
const SECRETARY_PROFILE = "avantiqo-secretary-v1";
const REPORT_PATH = resolve(
  process.env.AVANTIQO_VOICE_TTS_V3_ONE_PROOF_REPORT_OUTPUT ||
  "/tmp/avantiqo-voice-tts-v3-one-proof.json",
);
const AUDIO_PATH = resolve(
  process.env.AVANTIQO_VOICE_TTS_V3_ONE_PROOF_AUDIO_OUTPUT ||
  "/tmp/avantiqo-voice-tts-v3-one-proof.wav",
);

function text(value) {
  return String(value ?? "").trim();
}

if (!existsSync(REPORT_PATH)) {
  throw new Error(`AVANTIQO_VOICE_TTS_V2_PROOF_REPORT_REQUIRED:${REPORT_PATH}`);
}
if (!existsSync(AUDIO_PATH)) {
  throw new Error(`AVANTIQO_VOICE_TTS_V2_PROOF_AUDIO_REQUIRED:${AUDIO_PATH}`);
}

const report = JSON.parse(await readFile(REPORT_PATH, "utf8"));
const tts = report?.tts && typeof report.tts === "object" ? report.tts : {};
const audioStat = await stat(AUDIO_PATH);
const blockers = [];

if (report?.contract !== SOURCE_CONTRACT) blockers.push("SOURCE_CONTRACT_MISMATCH");
if (report?.success !== true) blockers.push("SOURCE_PROOF_NOT_SUCCESSFUL");
if (report?.generation_submitted !== true) blockers.push("GENERATION_NOT_SUBMITTED");
if (text(report?.generation_submission_outcome) !== "ACCEPTED") blockers.push("GENERATION_NOT_ACCEPTED");
if (!text(report?.job_id)) blockers.push("JOB_ID_REQUIRED");
if (report?.stt_submitted !== false) blockers.push("STT_MUST_NOT_BE_SUBMITTED");
if (report?.production_web_deploy !== false) blockers.push("PRODUCTION_WEB_DEPLOY_MUST_BE_FALSE");
if (report?.pricing_activation_performed !== false) blockers.push("PRICING_ACTIVATION_MUST_BE_FALSE");
if (tts?.passed !== true) blockers.push("TTS_RESULT_NOT_PASSED");
if (text(tts?.engine_contract) !== ENGINE_CONTRACT) blockers.push("ENGINE_CONTRACT_MISMATCH");
if (text(tts?.model) !== PRODUCT_MODEL) blockers.push("PRODUCT_MODEL_NOT_V2");
if (text(tts?.foundation_model) !== FOUNDATION_MODEL) blockers.push("FOUNDATION_MODEL_MISMATCH");
if (text(tts?.voice_profile) !== SECRETARY_PROFILE) blockers.push("SECRETARY_PROFILE_NOT_RETURNED");
if (tts?.voice_cloning_used !== false) blockers.push("UNEXPECTED_VOICE_CLONING");
if (tts?.raw_reasoning_persisted !== false) blockers.push("RAW_REASONING_PERSISTED");
if (text(tts?.format).toLowerCase() !== "wav") blockers.push("FORMAT_NOT_WAV");
if (text(tts?.wav_header) !== "RIFF") blockers.push("WAV_HEADER_INVALID");
if (!(Number(tts?.audio_bytes) > 1000)) blockers.push("AUDIO_BYTES_TOO_SMALL");
if (!(audioStat.size > 1000)) blockers.push("AUDIO_FILE_TOO_SMALL");
if (Number(tts?.audio_bytes) !== audioStat.size) blockers.push("AUDIO_SIZE_REPORT_MISMATCH");

const result = {
  success: blockers.length === 0,
  contract: CONTRACT,
  read_only: true,
  source_report: REPORT_PATH,
  audio_path: AUDIO_PATH,
  blockers,
  certified: {
    engine_contract: text(tts?.engine_contract) || null,
    product_model: text(tts?.model) || null,
    foundation_model: text(tts?.foundation_model) || null,
    voice_profile: text(tts?.voice_profile) || null,
    voice_cloning_used: tts?.voice_cloning_used === true,
    wav_header: text(tts?.wav_header) || null,
    format: text(tts?.format) || null,
    reported_audio_bytes: Number(tts?.audio_bytes) || null,
    actual_audio_bytes: audioStat.size,
  },
  generation_submitted_by_inspector: false,
  stt_submitted_by_inspector: false,
  mutation_performed: false,
  production_deploy_performed: false,
  pricing_activation_performed: false,
  secrets_printed: false,
};

console.log(JSON.stringify(result, null, 2));
if (!result.success) {
  throw new Error(`AVANTIQO_VOICE_TTS_V2_PROOF_RESULT_REJECTED:${blockers.join(",")}`);
}
