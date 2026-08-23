import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const REST_BASE = "https://rest.runpod.io/v1";
const ENV_LOCAL = path.resolve(process.cwd(), ".env.local");
const TARGET_ENVIRONMENT = "production";

const BINDINGS = Object.freeze([
  ["RUNPOD_AVANTIQO_IMAGE_ENDPOINT_ID", ["avantiqo-image-v1"]],
  ["RUNPOD_AVANTIQO_VIDEO_ENDPOINT_ID", ["avantiqo-cinema-v1"]],
  ["RUNPOD_AVANTIQO_INTELLIGENCE_ENDPOINT_ID", ["avantiqo-intelligence-v1"]],
  ["RUNPOD_AVANTIQO_CODE_ENDPOINT_ID", ["avantiqo-code-v1"]],
  ["RUNPOD_AVANTIQO_VOICE_STT_ENDPOINT_ID", ["avantiqo-voice-stt-v1"]],
  ["RUNPOD_AVANTIQO_VOICE_TTS_ENDPOINT_ID", ["avantiqo-voice-tts-v1", "services/avantiqo-voice-tts-v1"]],
  ["RUNPOD_AVANTIQO_AUDIO_ENDPOINT_ID", ["avantiqo-audio-v1"]],
  ["RUNPOD_AVANTIQO_LIPSYNC_ENDPOINT_ID", ["avantiqo-lipsync-v1", "avantiqo-lipsync-v1."]],
]);

function text(value) {
  return String(value ?? "").trim();
}

function required(name) {
  const value = text(process.env[name]);
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
}

async function discoverEndpoints(managementKey) {
  const response = await fetch(
    `${REST_BASE}/endpoints?includeTemplate=false&includeWorkers=false`,
    {
      headers: {
        Authorization: `Bearer ${managementKey}`,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(30_000),
    },
  );
  const raw = await response.text();
  let body = null;
  try {
    body = raw ? JSON.parse(raw) : null;
  } catch {
    body = null;
  }
  if (!response.ok || !Array.isArray(body)) {
    throw new Error(
      `RUNPOD_ENDPOINT_DISCOVERY_FAILED:${response.status}:${text(body?.message || body?.error || raw).slice(0, 500)}`,
    );
  }
  return body;
}

function resolveBindings(endpoints) {
  return BINDINGS.map(([envName, acceptedNames]) => {
    const matches = endpoints.filter((endpoint) =>
      acceptedNames.includes(text(endpoint?.name)),
    );
    if (matches.length !== 1) {
      throw new Error(`RUNPOD_ENDPOINT_BINDING_INVALID:${envName}:matches=${matches.length}`);
    }
    const endpointId = text(matches[0]?.id);
    if (!endpointId) throw new Error(`RUNPOD_ENDPOINT_ID_MISSING:${envName}`);
    return {
      envName,
      endpointId,
      endpointName: text(matches[0]?.name),
    };
  });
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function updateLocalEnv(bindings) {
  if (!fs.existsSync(ENV_LOCAL)) throw new Error("ENV_LOCAL_REQUIRED");
  let source = fs.readFileSync(ENV_LOCAL, "utf8");
  let changed = 0;

  for (const binding of bindings) {
    const nextLine = `${binding.envName}=${binding.endpointId}`;
    const pattern = new RegExp(
      `^(?:export\\s+)?${escapeRegex(binding.envName)}=.*$`,
      "m",
    );
    if (pattern.test(source)) {
      const currentLine = source.match(pattern)?.[0] || "";
      if (currentLine !== nextLine) {
        source = source.replace(pattern, nextLine);
        changed += 1;
      }
    } else {
      if (source.length && !source.endsWith("\n")) source += "\n";
      source += `${nextLine}\n`;
      changed += 1;
    }
  }

  if (changed) {
    const temp = path.join(
      os.tmpdir(),
      `avantiqo-runpod-endpoints-${process.pid}-${Date.now()}.tmp`,
    );
    fs.writeFileSync(temp, source, { mode: 0o600 });
    fs.renameSync(temp, ENV_LOCAL);
  }
  return changed;
}

function vercel(args, value) {
  return spawnSync("vercel", args, {
    input: `${value}\n`,
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
    env: process.env,
  });
}

function syncVercelEndpoint(binding) {
  const update = vercel(
    ["env", "update", binding.envName, TARGET_ENVIRONMENT, "--yes"],
    binding.endpointId,
  );
  if (update.status === 0) return "UPDATED";

  const add = vercel(
    ["env", "add", binding.envName, TARGET_ENVIRONMENT, "--yes"],
    binding.endpointId,
  );
  if (add.status !== 0) {
    const detail = text(add.stderr || add.stdout || update.stderr || update.stdout).slice(0, 800);
    throw new Error(`VERCEL_ENDPOINT_SYNC_FAILED:${binding.envName}:${detail || "UNKNOWN"}`);
  }
  return "ADDED";
}

const managementKey = required("RUNPOD_MANAGEMENT_API_KEY");
const cliCheck = spawnSync("vercel", ["--version"], { stdio: "ignore" });
if (cliCheck.status !== 0) throw new Error("VERCEL_CLI_REQUIRED");

console.log("AVANTIQO_RUNPOD_ENDPOINT_SYNC_TARGET=production");
console.log("AVANTIQO_RUNPOD_ENDPOINT_SYNC_SECRETS=false");
console.log("AVANTIQO_RUNPOD_MANAGEMENT_KEY_SYNCED=false");
console.log("AVANTIQO_RUNPOD_PRODUCTION_DEPLOY_PERFORMED=false");

const endpoints = await discoverEndpoints(managementKey);
const bindings = resolveBindings(endpoints);
const localChanged = updateLocalEnv(bindings);

let vercelChanged = 0;
for (const binding of bindings) {
  const action = syncVercelEndpoint(binding);
  vercelChanged += 1;
  console.log(
    `AVANTIQO_RUNPOD_ENDPOINT_SYNCED name=${binding.endpointName} env=${binding.envName} vercel=${action}`,
  );
}

console.log(`AVANTIQO_RUNPOD_ENDPOINT_COUNT=${bindings.length}`);
console.log(`AVANTIQO_RUNPOD_LOCAL_ENDPOINTS_CHANGED=${localChanged}`);
console.log(`AVANTIQO_RUNPOD_VERCEL_ENDPOINTS_SYNCED=${vercelChanged}`);
console.log("AVANTIQO_RUNPOD_ENDPOINT_SYNC=COMPLETE");
