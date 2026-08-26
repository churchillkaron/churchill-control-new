import { spawnSync } from "node:child_process";
import process from "node:process";

const CONTRACT = "AVANTIQO_VOICE_SOFTWARE_CERTIFICATION_V1";

const TESTS = [
  "tests/avantiqo-voice-browser-client-integration.test.mjs",
  "tests/avantiqo-voice-async-speech-client.test.mjs",
  "tests/avantiqo-voice-async-transcription-client.test.mjs",
  "tests/avantiqo-voice-async-speech.test.mjs",
  "tests/avantiqo-voice-async-transcription.test.mjs",
  "tests/avantiqo-voice-library-ui.test.mjs",
  "tests/avantiqo-voice-library.test.mjs",
  "tests/avantiqo-voice-owned-engine.test.mjs",
  "tests/avantiqo-voice-safe-lease-v2.test.mjs",
  "tests/avantiqo-voice-realtime-owned.test.mjs",
  "tests/avantiqo-voice-software-certification.test.mjs",
];

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    env: process.env,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const error = new Error(`${command} ${args.join(" ")} failed with status ${result.status}`);
    error.exitCode = result.status || 1;
    throw error;
  }
}

function capture(command, args) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    env: process.env,
    encoding: "utf8",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(String(result.stderr || result.stdout || "command failed").trim());
  }
  return String(result.stdout || "").trim();
}

try {
  const branch = capture("git", ["branch", "--show-current"]);
  if (branch !== "main") {
    throw new Error(`AVANTIQO_VOICE_SOFTWARE_CERTIFICATION_MAIN_REQUIRED:${branch || "DETACHED"}`);
  }

  run(process.execPath, ["--test", ...TESTS]);
  run(process.execPath, ["scripts/operator-voice-language-policy-audit.mjs"]);

  console.log(JSON.stringify({
    success: true,
    contract: CONTRACT,
    branch,
    software_only: true,
    static_tests: true,
    static_test_files: TESTS.length,
    language_audit: true,
    browser_runpod_access: false,
    gpu_started: false,
    generation_submitted: false,
    production_deploy_performed: false,
    production_migration_applied: false,
    engine_proof_performed: false,
    recorded_reference_engine_certified: false,
    realtime_streaming_implemented: true,
    realtime_streaming_certified: false,
    realtime_relay_required: true,
    thai_synthesis: "FAIL_CLOSED_UNTIL_CERTIFIED",
  }, null, 2));
} catch (error) {
  console.error(JSON.stringify({
    success: false,
    contract: CONTRACT,
    error: error?.message || String(error),
    software_only: true,
    gpu_started: false,
    generation_submitted: false,
    production_deploy_performed: false,
    production_migration_applied: false,
    engine_proof_performed: false,
  }, null, 2));
  process.exitCode = Number(error?.exitCode) || 1;
}
