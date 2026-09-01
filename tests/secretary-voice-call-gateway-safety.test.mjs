import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const gatewayPath = new URL("../lib/operator/secretary/SecretaryVoiceCallGatewayRuntime.js", import.meta.url);
const routePath = new URL("../app/api/internal/secretary/calls/turn/route.js", import.meta.url);

const [gateway, route] = await Promise.all([
  readFile(gatewayPath, "utf8"),
  readFile(routePath, "utf8"),
]);

test("Secretary Voice keeps one turn inside the HTTP execution budget", () => {
  assert.match(gateway, /VOICE_TURN_DEADLINE_MS\s*=\s*285_000/);
  assert.match(gateway, /VOICE_TTS_SUBMISSION_MINIMUM_REMAINING_MS\s*=\s*60_000/);
  assert.match(gateway, /deadlineRemainingMs\(deadlineAt\)/);
  assert.match(gateway, /SECRETARY_VOICE_PROVIDER_JOB_TIMEOUT_RESUME_SAME_JOB_REQUIRED/);
  assert.match(gateway, /requireDeadlineBudget\(deadlineAt,\s*VOICE_TTS_SUBMISSION_MINIMUM_REMAINING_MS,\s*"TTS_SUBMISSION"\)/s);
  assert.match(route, /export const maxDuration = 300/);
});

test("Secretary Voice reserves TTS conservatively but settles actual WAV duration", () => {
  assert.match(gateway, /const baseSeconds = words \/ 2;/);
  assert.match(gateway, /sentencePauses/);
  assert.match(gateway, /clausePauses/);
  assert.match(gateway, /const headroom = Math\.max\(0\.5, baseSeconds \* 0\.15\)/);
  assert.match(gateway, /TEXT_120_WPM_PLUS_PAUSE_HEADROOM_SECONDS_ESTIMATE/);
  assert.match(gateway, /actual_output_duration_settlement_required:\s*true/);
});

test("Secretary Voice only returns the organization's persisted private WAV", () => {
  assert.match(gateway, /async function storedVoiceAudioBase64\(result, organizationId\)/);
  assert.match(gateway, /const requiredPrefix = `\$\{text\(organizationId, 120\)\}\/generated\/avantiqo-voice\/`/);
  assert.match(gateway, /!path\.startsWith\(requiredPrefix\)/);
  assert.match(gateway, /SECRETARY_VOICE_TTS_STORAGE_ORGANIZATION_PATH_INVALID/);
  assert.match(gateway, /supabaseAdmin\.storage\.from\("creative-assets"\)\.download\(path\)/);
  assert.doesNotMatch(gateway, /if \(inline\) return inline/);
});

test("Secretary Voice preserves same-provider-job settlement semantics", () => {
  assert.match(gateway, /duplicate_provider_submission_forbidden:\s*true/);
  assert.match(gateway, /provider_job_id:\s*providerJobId/);
  assert.match(gateway, /usage_id:\s*usageId/);
  assert.match(gateway, /ServiceExecutionRuntime\.settle/);
  assert.match(gateway, /voice_turn_deadline_enforced:\s*true/);
});
