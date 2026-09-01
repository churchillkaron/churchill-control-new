import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(
  new URL("../lib/operator/secretary/SecretaryVoiceCallGatewayRuntime.js", import.meta.url),
  "utf8",
);

test("Secretary Voice enforces one bounded turn deadline", () => {
  assert.match(source, /VOICE_TURN_DEADLINE_MS\s*=\s*285_000/);
  assert.match(source, /VOICE_TTS_SUBMISSION_MINIMUM_REMAINING_MS\s*=\s*60_000/);
  assert.match(source, /deadlineRemainingMs/);
  assert.match(source, /SECRETARY_VOICE_PROVIDER_JOB_TIMEOUT_RESUME_SAME_JOB_REQUIRED/);
  assert.match(source, /SECRETARY_VOICE_TURN_DEADLINE_INSUFFICIENT/);
  assert.match(source, /requireDeadlineBudget\(deadlineAt, VOICE_TTS_SUBMISSION_MINIMUM_REMAINING_MS, "TTS_SUBMISSION"\)/);
});

test("Secretary Voice retrieves generated WAV only from its organization path", () => {
  assert.match(source, /requiredPrefix\s*=\s*`\$\{text\(organizationId, 120\)\}\/generated\/avantiqo-voice\//);
  assert.match(source, /path\.startsWith\(requiredPrefix\)/);
  assert.match(source, /SECRETARY_VOICE_TTS_STORAGE_ORGANIZATION_PATH_INVALID/);
  assert.doesNotMatch(source, /if \(!reference\.startsWith\(VOICE_STORAGE_PREFIX\)\)\s*\{[\s\S]{0,300}audio_base64/);
});

test("Secretary Voice reserves conservatively but settles TTS from actual duration", () => {
  assert.match(source, /function ttsReservationSeconds/);
  assert.match(source, /const baseSeconds = words \/ 2/);
  assert.match(source, /sentencePauses/);
  assert.match(source, /clausePauses/);
  assert.match(source, /Math\.max\(0\.5, baseSeconds \* 0\.15\)/);
  assert.match(source, /TEXT_120_WPM_PLUS_PAUSE_HEADROOM_SECONDS_ESTIMATE/);
  assert.match(source, /actual_output_duration_settlement_required:\s*true/);
});

test("Secretary Voice remains restricted and does not persist caller raw audio", () => {
  assert.match(source, /raw_audio_persisted:\s*false/);
  assert.match(source, /internal_operator_capabilities_available:\s*false/);
  assert.match(source, /external_authority_used:\s*false/);
  assert.match(source, /duplicate_voice_job_submission_per_turn:\s*false/);
});
