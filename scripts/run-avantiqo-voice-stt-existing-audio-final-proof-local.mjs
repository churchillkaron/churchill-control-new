import { spawnSync } from "node:child_process";
import { readFile, unlink, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { loadAvantiqoEnv } from "./load-avantiqo-env.mjs";

loadAvantiqoEnv();

const BASE = "scripts/run-avantiqo-voice-stt-existing-audio-proof-diagnostic-local.mjs";
const LEASE_SCRIPT = resolve("scripts/run-avantiqo-runpod-safe-lease-v2-local.mjs");
const SAFE_LEASE_CONTRACT = "AVANTIQO_RUNPOD_SAFE_LEASE_V2";
const OLD_HANDLER_BLOB = "465da9267ababa6b2ded92f7ebb26e4bbeb34783";
const CURRENT_HANDLER_BLOB = "f525911eaa1678761392c5f556c59c2881da7a9d";
const EXPECTED_DOCKERFILE_BLOB = "fe1ceb09e246a3ad1d851bbba3aaa3f5822e9d2d";
const EXPECTED_REQUIREMENTS_BLOB = "9b1f4d662a7b13b65d192493ed738998d2172698";
const RUNTIME_ENTRYPOINT = "handler.py";
const RUNTIME_REVISION = "AVANTIQO_VOICE_STT_HANDLER_RUNTIME_PROBE_V1";

const text = (value) => String(value ?? "").trim();
const yes = (value) => ["YES", "TRUE", "1", "APPROVED", "ON"].includes(text(value).toUpperCase());

function replaceExactlyOnce(source, search, replacement, label) {
  const count = source.split(search).length - 1;
  if (count !== 1) {
    throw new Error(`AVANTIQO_VOICE_STT_FINAL_PROOF_${label}_MISMATCH:occurrences=${count}`);
  }
  return source.replace(search, replacement);
}

if (!yes(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_ACTIVE)) {
  if (!yes(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_APPROVED)) {
    throw new Error("AVANTIQO_RUNPOD_SAFE_LEASE_APPROVED=YES_REQUIRED");
  }
  const result = spawnSync(
    process.execPath,
    [
      LEASE_SCRIPT,
      "--lane=voice-stt",
      "--ttl-ms=1200000",
      "--",
      process.execPath,
      resolve(process.argv[1]),
    ],
    {
      cwd: process.cwd(),
      env: process.env,
      encoding: "utf8",
      stdio: "inherit",
    },
  );
  if (result.error) throw result.error;
  if (result.signal) throw new Error(`AVANTIQO_VOICE_STT_FINAL_PROOF_SAFE_LEASE_SIGNAL:${result.signal}`);
  if (result.status !== 0) {
    throw new Error(`AVANTIQO_VOICE_STT_FINAL_PROOF_SAFE_LEASE_FAILED:exit=${result.status}`);
  }
  process.exit(0);
}

if (text(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_CONTRACT) !== SAFE_LEASE_CONTRACT) {
  throw new Error("AVANTIQO_VOICE_STT_FINAL_PROOF_SAFE_LEASE_V2_REQUIRED");
}
if (text(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_LANE) !== "voice-stt") {
  throw new Error("AVANTIQO_VOICE_STT_FINAL_PROOF_SAFE_LEASE_LANE_MISMATCH");
}

let source = await readFile(resolve(process.cwd(), BASE), "utf8");

for (const [label, expected] of [
  ["OLD_HANDLER_BLOB", OLD_HANDLER_BLOB],
  ["DOCKERFILE_BLOB", EXPECTED_DOCKERFILE_BLOB],
  ["REQUIREMENTS_BLOB", EXPECTED_REQUIREMENTS_BLOB],
]) {
  if (!source.includes(expected)) {
    throw new Error(`AVANTIQO_VOICE_STT_FINAL_PROOF_${label}_LOCK_MISSING`);
  }
}

source = replaceExactlyOnce(
  source,
  `handler_blob_sha: "${OLD_HANDLER_BLOB}",`,
  `handler_blob_sha: "${CURRENT_HANDLER_BLOB}",`,
  "HANDLER_SOURCE",
);

source = replaceExactlyOnce(
  source,
  "  network_volume_absent: endpointVolumes.length === 0,\n  native_image_source_verified: nativeSource.source_verified === true,",
  "  network_volume_absent: endpointVolumes.length === 0,\n  registry_auth_absent: !text(preflight.template?.containerRegistryAuthId),\n  native_image_source_verified: nativeSource.source_verified === true,",
  "REGISTRY_AUTH_GUARD",
);

console.log(JSON.stringify({
  event: "AVANTIQO_VOICE_STT_FINAL_EXISTING_AUDIO_PREFLIGHT",
  base_script: BASE,
  safe_lease_already_active: true,
  safe_lease_lane: text(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_LANE),
  expected_handler_blob: CURRENT_HANDLER_BLOB,
  expected_dockerfile_blob: EXPECTED_DOCKERFILE_BLOB,
  expected_requirements_blob: EXPECTED_REQUIREMENTS_BLOB,
  expected_entrypoint: RUNTIME_ENTRYPOINT,
  expected_runtime_revision: RUNTIME_REVISION,
  real_stt_jobs_expected: 1,
  tts_jobs_expected: 0,
  music_touched: false,
  secrets_printed: false,
}));

const generatedPath = resolve(
  process.cwd(),
  "scripts",
  `.avantiqo-voice-stt-final-proof-${process.pid}-${Date.now()}.mjs`,
);

try {
  await writeFile(generatedPath, source, { encoding: "utf8", flag: "wx" });
  await import(`${pathToFileURL(generatedPath).href}?run=${Date.now()}`);
} finally {
  await unlink(generatedPath).catch(() => {});
}
