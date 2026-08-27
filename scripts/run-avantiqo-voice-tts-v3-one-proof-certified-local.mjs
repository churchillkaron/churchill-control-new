import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const CONTRACT = "AVANTIQO_VOICE_TTS_V3_ONE_PROOF_CERTIFIED_V2";
const PROOF_SCRIPT = resolve("scripts/run-avantiqo-voice-tts-v3-one-proof-local.mjs");
const RESULT_GATE_SCRIPT = resolve("scripts/inspect-avantiqo-voice-tts-v2-proof-result-local.mjs");
const LIVE_OUTPUT_GATE_SCRIPT = resolve("scripts/inspect-avantiqo-voice-tts-v2-live-job-output-local.mjs");

function runNode(script) {
  const result = spawnSync(process.execPath, [script], {
    cwd: process.cwd(),
    env: process.env,
    encoding: "utf8",
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${CONTRACT}_CHILD_FAILED:${script}:exit=${result.status}`);
  }
}

if (!existsSync(PROOF_SCRIPT)) throw new Error(`${CONTRACT}_PROOF_SCRIPT_REQUIRED`);
if (!existsSync(RESULT_GATE_SCRIPT)) throw new Error(`${CONTRACT}_RESULT_GATE_SCRIPT_REQUIRED`);
if (!existsSync(LIVE_OUTPUT_GATE_SCRIPT)) throw new Error(`${CONTRACT}_LIVE_OUTPUT_GATE_SCRIPT_REQUIRED`);

console.log(JSON.stringify({
  event: "AVANTIQO_VOICE_TTS_V3_ONE_PROOF_CERTIFIED_BEGIN",
  contract: CONTRACT,
  one_generation_source: PROOF_SCRIPT,
  result_gate: RESULT_GATE_SCRIPT,
  live_output_gate: LIVE_OUTPUT_GATE_SCRIPT,
  extra_generation_submitted_by_wrapper: false,
  stt_submitted_by_wrapper: false,
  production_deploy_performed: false,
  pricing_activation_performed: false,
  secrets_printed: false,
}));

runNode(PROOF_SCRIPT);
runNode(RESULT_GATE_SCRIPT);
runNode(LIVE_OUTPUT_GATE_SCRIPT);

console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  proof_completed: true,
  v2_result_gate_passed: true,
  v2_live_output_gate_passed: true,
  extra_generation_submitted_by_wrapper: false,
  stt_submitted_by_wrapper: false,
  production_deploy_performed: false,
  pricing_activation_performed: false,
  secrets_printed: false,
}, null, 2));
