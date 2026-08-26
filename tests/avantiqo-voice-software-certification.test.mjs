import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const runner = await readFile(
  new URL("../scripts/certify-avantiqo-voice-software-local.mjs", import.meta.url),
  "utf8",
);

test("Voice software certification is main-only and static-only", () => {
  assert.match(runner, /AVANTIQO_VOICE_SOFTWARE_CERTIFICATION_V1/);
  assert.match(runner, /git", \["branch", "--show-current"\]/);
  assert.match(runner, /branch !== "main"/);
  assert.match(runner, /process\.execPath, \["--test", \.\.\.TESTS\]/);
  assert.match(runner, /scripts\/operator-voice-language-policy-audit\.mjs/);
});

test("Voice software certification covers the complete static Voice surface", () => {
  for (const required of [
    "avantiqo-voice-browser-client-integration.test.mjs",
    "avantiqo-voice-async-speech-client.test.mjs",
    "avantiqo-voice-async-transcription-client.test.mjs",
    "avantiqo-voice-async-speech.test.mjs",
    "avantiqo-voice-async-transcription.test.mjs",
    "avantiqo-voice-library-ui.test.mjs",
    "avantiqo-voice-library.test.mjs",
    "avantiqo-voice-owned-engine.test.mjs",
    "avantiqo-voice-safe-lease-v2.test.mjs",
    "avantiqo-voice-software-certification.test.mjs",
  ]) {
    assert.match(runner, new RegExp(required.replaceAll(".", "\\.")));
  }
});

test("Voice software certification cannot start engines, submit generations, deploy production or apply migrations", () => {
  assert.doesNotMatch(runner, /run-avantiqo-voice-tts-v3-one-proof/);
  assert.doesNotMatch(runner, /smoke-avantiqo-voice/);
  assert.doesNotMatch(runner, /run-avantiqo-runpod-safe-lease/);
  assert.doesNotMatch(runner, /vercel\s+(?:--prod|deploy|build)/i);
  assert.doesNotMatch(runner, /supabase\s+(?:db\s+push|migration\s+up|link)/i);
  assert.match(runner, /gpu_started:\s*false/);
  assert.match(runner, /generation_submitted:\s*false/);
  assert.match(runner, /production_deploy_performed:\s*false/);
  assert.match(runner, /production_migration_applied:\s*false/);
  assert.match(runner, /engine_proof_performed:\s*false/);
});

test("Voice software certification preserves uncertified engine claims", () => {
  assert.match(runner, /recorded_reference_engine_certified:\s*false/);
  assert.match(runner, /realtime_streaming_certified:\s*false/);
  assert.match(runner, /thai_synthesis:\s*"FAIL_CLOSED_UNTIL_CERTIFIED"/);
});
