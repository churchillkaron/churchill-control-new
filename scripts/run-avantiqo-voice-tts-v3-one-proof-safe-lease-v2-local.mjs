import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { loadAvantiqoEnv } from "./load-avantiqo-env.mjs";

loadAvantiqoEnv();

const CONTRACT = "AVANTIQO_VOICE_TTS_V3_ONE_PROOF_SAFE_LEASE_V2";
const LEASE_CONTRACT = "AVANTIQO_RUNPOD_SAFE_LEASE_V2";
const LEASE_SCRIPT = resolve("scripts/run-avantiqo-runpod-safe-lease-v2-local.mjs");
const PROOF_SCRIPT = resolve("scripts/run-avantiqo-voice-tts-v3-one-proof-local.mjs");
const LANE = "voice-tts";
const DEFAULT_TTL_MS = 20 * 60_000;

function text(value) {
  return String(value ?? "").trim();
}

function approved(value) {
  return ["YES", "TRUE", "1", "APPROVED"].includes(text(value).toUpperCase());
}

if (!approved(process.env.AVANTIQO_VOICE_TTS_V3_ONE_PROOF_APPROVED)) {
  throw new Error("AVANTIQO_VOICE_TTS_V3_ONE_PROOF_APPROVED=YES_REQUIRED");
}
if (!approved(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_APPROVED)) {
  throw new Error("AVANTIQO_RUNPOD_SAFE_LEASE_APPROVED=YES_REQUIRED");
}
if (!existsSync(LEASE_SCRIPT)) {
  throw new Error("AVANTIQO_VOICE_TTS_SAFE_LEASE_V2_SCRIPT_REQUIRED");
}
if (!existsSync(PROOF_SCRIPT)) {
  throw new Error("AVANTIQO_VOICE_TTS_PROOF_SCRIPT_REQUIRED");
}

const ttlMs = Math.max(
  60_000,
  Math.min(
    30 * 60_000,
    Number(process.env.AVANTIQO_VOICE_TTS_V3_ONE_PROOF_LEASE_TTL_MS || DEFAULT_TTL_MS),
  ),
);

console.log(JSON.stringify({
  event: "AVANTIQO_VOICE_TTS_SAFE_LEASE_V2_PROOF_BEGIN",
  contract: CONTRACT,
  safe_lease_contract: LEASE_CONTRACT,
  lane: LANE,
  ttl_ms: ttlMs,
  exactly_one_new_generation_max: true,
  production_deploy_performed: false,
  pricing_activation_performed: false,
  secrets_printed: false,
}));

const result = spawnSync(
  process.execPath,
  [
    LEASE_SCRIPT,
    `--lane=${LANE}`,
    `--ttl-ms=${ttlMs}`,
    "--",
    process.execPath,
    PROOF_SCRIPT,
  ],
  {
    cwd: process.cwd(),
    env: {
      ...process.env,
      AVANTIQO_VOICE_TTS_PROOF_ENTRYPOINT: CONTRACT,
    },
    encoding: "utf8",
    stdio: "inherit",
  },
);

if (result.error) throw result.error;
if (result.status !== 0) {
  throw new Error(`${CONTRACT}_FAILED:exit=${result.status}`);
}

console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  safe_lease_contract: LEASE_CONTRACT,
  lane: LANE,
  permanent_rest_state: "VOICE_TTS_0_0",
  exactly_one_new_generation_max: true,
  production_deploy_performed: false,
  pricing_activation_performed: false,
  secrets_printed: false,
}, null, 2));
