#!/usr/bin/env bash

set -euo pipefail

ROOT="${AVANTIQO_PROJECT_ROOT:-$(pwd)}"
ENV_LOCAL="$ROOT/.env.local"

fail() {
  echo "AVANTIQO_RUNPOD_LOCAL_SOURCE_RECOVERY=FAIL"
  echo "AVANTIQO_RUNPOD_LOCAL_SOURCE_RECOVERY_REASON=$1"
  exit 1
}

command -v node >/dev/null 2>&1 || fail "NODE_REQUIRED"
[ -f "$ENV_LOCAL" ] || fail "ENV_LOCAL_REQUIRED"

echo "AVANTIQO_RUNPOD_LOCAL_SOURCE_RECOVERY_SECRET_VALUES_PRINTED=false"
echo "AVANTIQO_RUNPOD_LOCAL_SOURCE_RECOVERY_SCOPE=PROCESS_ENV_ENV_LOCAL_TEMP_VOICE_ENV_SHELL_CONFIG_SHELL_HISTORY"

set +e
node --input-type=module - "$ENV_LOCAL" <<'NODE'
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  readFileSync,
  readdirSync,
  renameSync,
  statSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseEnv } from "node:util";

const envPath = process.argv[2];
const text = (value) => String(value ?? "").trim();
const candidates = [];
const seen = new Set();
const sourceCounts = new Map();

function addCandidate(value, source) {
  const candidate = text(value);
  if (!candidate || candidate.length < 8 || candidate.length > 4096) return;
  if (seen.has(candidate)) return;
  seen.add(candidate);
  candidates.push({ value: candidate, source });
  sourceCounts.set(source, (sourceCounts.get(source) || 0) + 1);
}

function unquote(raw) {
  let value = text(raw);
  if (
    value.length >= 2 &&
    ((value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'")))
  ) {
    value = value.slice(1, -1);
  }
  return value.replace(/\\([\\"'])/g, "$1");
}

function extractAssignments(raw, source) {
  const input = String(raw ?? "");
  const pattern = /(?:^|[\s;])(?:export\s+)?(RUNPOD_(?:MANAGEMENT_)?API_KEY)\s*=\s*("(?:[^"\\]|\\.)*"|'[^']*'|[^\s;|&]+)/gm;
  let match;
  while ((match = pattern.exec(input))) {
    addCandidate(unquote(match[2]), source);
  }
}

function readSmallFile(filePath, source, parseAsEnv = false) {
  try {
    const stats = statSync(filePath);
    if (!stats.isFile() || stats.size <= 0 || stats.size > 4 * 1024 * 1024) return;
    const raw = readFileSync(filePath, "utf8");
    if (parseAsEnv) {
      try {
        const parsed = parseEnv(raw);
        addCandidate(parsed.RUNPOD_MANAGEMENT_API_KEY, source);
        addCandidate(parsed.RUNPOD_API_KEY, source);
      } catch {
        // Fall through to assignment extraction.
      }
    }
    extractAssignments(raw, source);
  } catch {
    // A missing/unreadable local trace is not a recovery failure.
  }
}

addCandidate(process.env.RUNPOD_MANAGEMENT_API_KEY, "PROCESS_ENV");
addCandidate(process.env.RUNPOD_API_KEY, "PROCESS_ENV");
readSmallFile(envPath, "ENV_LOCAL", true);

for (const tempRoot of ["/private/tmp", "/tmp"]) {
  try {
    for (const entry of readdirSync(tempRoot, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      if (!/^avantiqo-voice-main\./.test(entry.name)) continue;
      const directory = path.join(tempRoot, entry.name);
      for (const envName of [".env.local", ".env", ".env.production.local", ".env.development.local"]) {
        readSmallFile(path.join(directory, envName), "TEMP_VOICE_ENV", true);
      }
    }
  } catch {
    // Ignore unavailable temp roots.
  }
}

const home = os.homedir();
for (const shellFile of [
  ".zshrc",
  ".zprofile",
  ".zshenv",
  ".profile",
  ".bash_profile",
  ".bashrc",
]) {
  readSmallFile(path.join(home, shellFile), "SHELL_CONFIG", false);
}
for (const historyFile of [".zsh_history", ".bash_history"]) {
  readSmallFile(path.join(home, historyFile), "SHELL_HISTORY", false);
}

try {
  const ps = spawnSync("ps", ["eww", "-axo", "command"], {
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
    stdio: ["ignore", "pipe", "ignore"],
  });
  if (ps.status === 0) extractAssignments(ps.stdout, "RUNNING_PROCESS_ENV");
} catch {
  // Process inspection is opportunistic only.
}

async function listEndpoints(credential) {
  const response = await fetch(
    "https://rest.runpod.io/v1/endpoints?includeTemplate=false&includeWorkers=false",
    {
      headers: {
        Authorization: `Bearer ${credential}`,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(20_000),
    },
  );
  if (!response.ok) {
    await response.arrayBuffer().catch(() => null);
    return null;
  }
  const body = await response.json().catch(() => null);
  if (Array.isArray(body)) return body;
  for (const key of ["endpoints", "serverlessEndpoints", "data", "items", "results"]) {
    if (Array.isArray(body?.[key])) return body[key];
  }
  return null;
}

let recovered = null;
let endpoints = null;
for (const candidate of candidates) {
  try {
    const listed = await listEndpoints(candidate.value);
    if (!listed) continue;
    recovered = candidate;
    endpoints = listed;
    break;
  } catch {
    // Continue through local candidates without revealing them.
  }
}

console.log(`AVANTIQO_RUNPOD_LOCAL_SOURCE_RECOVERY_CANDIDATE_COUNT=${candidates.length}`);
console.log(`AVANTIQO_RUNPOD_LOCAL_SOURCE_RECOVERY_SOURCE_COUNT=${sourceCounts.size}`);

if (!recovered || !endpoints) {
  console.log("AVANTIQO_RUNPOD_LOCAL_SOURCE_RECOVERY_VALID_CREDENTIAL=NO");
  console.log("AVANTIQO_RUNPOD_LOCAL_SOURCE_RECOVERY_SECRET_VALUES_PRINTED=false");
  process.exit(2);
}

const endpointSpecs = [
  ["RUNPOD_AVANTIQO_IMAGE_ENDPOINT_ID", ["avantiqo-image-v1"]],
  ["RUNPOD_AVANTIQO_VIDEO_ENDPOINT_ID", ["avantiqo-cinema-v1"]],
  ["RUNPOD_AVANTIQO_INTELLIGENCE_ENDPOINT_ID", ["avantiqo-intelligence-v1"]],
  ["RUNPOD_AVANTIQO_INTELLIGENCE_TRAINER_ENDPOINT_ID", ["avantiqo-intelligence-trainer-v1"]],
  ["RUNPOD_AVANTIQO_INTELLIGENCE_CANDIDATE_ENDPOINT_ID", ["avantiqo-intelligence-candidate-v1"]],
  ["RUNPOD_AVANTIQO_CODE_ENDPOINT_ID", ["avantiqo-code-v1"]],
  ["RUNPOD_AVANTIQO_VOICE_STT_ENDPOINT_ID", ["avantiqo-voice-stt-v1"]],
  ["RUNPOD_AVANTIQO_VOICE_TTS_ENDPOINT_ID", ["avantiqo-voice-tts-v1-recovery-20260825", "avantiqo-voice-tts-v1"]],
  ["RUNPOD_AVANTIQO_AUDIO_ENDPOINT_ID", ["avantiqo-audio-v1"]],
  ["RUNPOD_AVANTIQO_LIPSYNC_ENDPOINT_ID", ["avantiqo-lipsync-v1"]],
];

function resolveEndpoint(names) {
  for (const name of names) {
    const matches = endpoints.filter((endpoint) => text(endpoint?.name) === name);
    if (matches.length > 1) throw new Error(`RUNPOD_ENDPOINT_AMBIGUOUS:${name}`);
    if (matches.length === 1 && text(matches[0]?.id)) return text(matches[0].id);
  }
  return "";
}

const values = {
  RUNPOD_API_KEY: recovered.value,
  RUNPOD_MANAGEMENT_API_KEY: recovered.value,
  RUNPOD_AVANTIQO_IMAGE_API_KEY: recovered.value,
  RUNPOD_AVANTIQO_VIDEO_API_KEY: recovered.value,
};
for (const [name, endpointNames] of endpointSpecs) {
  const endpointId = resolveEndpoint(endpointNames);
  if (endpointId) values[name] = endpointId;
}

if (!values.RUNPOD_AVANTIQO_INTELLIGENCE_ENDPOINT_ID) {
  console.log("AVANTIQO_RUNPOD_LOCAL_SOURCE_RECOVERY_VALID_CREDENTIAL=YES");
  console.log("AVANTIQO_RUNPOD_LOCAL_SOURCE_RECOVERY_INTELLIGENCE_ENDPOINT=NO");
  console.log("AVANTIQO_RUNPOD_LOCAL_SOURCE_RECOVERY_SECRET_VALUES_PRINTED=false");
  process.exit(3);
}

const original = readFileSync(envPath, "utf8");
let next = original;
let changed = 0;
const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
for (const [name, value] of Object.entries(values)) {
  const line = `${name}=${JSON.stringify(value)}`;
  const pattern = new RegExp(`^(?:export\\s+)?${escapeRegex(name)}=.*$`, "m");
  if (pattern.test(next)) {
    const existing = next.match(pattern)?.[0] || "";
    if (existing === line) continue;
    next = next.replace(pattern, line);
    changed += 1;
  } else {
    if (next.length && !next.endsWith("\n")) next += "\n";
    next += `${line}\n`;
    changed += 1;
  }
}

if (changed > 0) {
  const tmp = path.join(path.dirname(envPath), `.env.local.runpod-recovery-${process.pid}-${Date.now()}.tmp`);
  writeFileSync(tmp, next, { mode: 0o600 });
  renameSync(tmp, envPath);
}
chmodSync(envPath, 0o600);

const sourceLabel = recovered.source;
console.log("AVANTIQO_RUNPOD_LOCAL_SOURCE_RECOVERY_VALID_CREDENTIAL=YES");
console.log(`AVANTIQO_RUNPOD_LOCAL_SOURCE_RECOVERY_SOURCE=${sourceLabel}`);
console.log(`AVANTIQO_RUNPOD_LOCAL_SOURCE_RECOVERY_UPDATED_COUNT=${changed}`);
console.log(`AVANTIQO_RUNPOD_LOCAL_SOURCE_RECOVERY_ENDPOINT_COUNT=${endpoints.length}`);
console.log("AVANTIQO_RUNPOD_LOCAL_SOURCE_RECOVERY_INTELLIGENCE_ENDPOINT=YES");
console.log(`AVANTIQO_RUNPOD_LOCAL_SOURCE_RECOVERY_CODE_ENDPOINT=${values.RUNPOD_AVANTIQO_CODE_ENDPOINT_ID ? "YES" : "NO"}`);
console.log(`AVANTIQO_RUNPOD_LOCAL_SOURCE_RECOVERY_IMAGE_ENDPOINT=${values.RUNPOD_AVANTIQO_IMAGE_ENDPOINT_ID ? "YES" : "NO"}`);
console.log(`AVANTIQO_RUNPOD_LOCAL_SOURCE_RECOVERY_VIDEO_ENDPOINT=${values.RUNPOD_AVANTIQO_VIDEO_ENDPOINT_ID ? "YES" : "NO"}`);
console.log(`AVANTIQO_RUNPOD_LOCAL_SOURCE_RECOVERY_VOICE_TTS_ENDPOINT=${values.RUNPOD_AVANTIQO_VOICE_TTS_ENDPOINT_ID ? "YES" : "NO"}`);
console.log(`AVANTIQO_RUNPOD_LOCAL_SOURCE_RECOVERY_VOICE_STT_ENDPOINT=${values.RUNPOD_AVANTIQO_VOICE_STT_ENDPOINT_ID ? "YES" : "NO"}`);
console.log(`AVANTIQO_RUNPOD_LOCAL_SOURCE_RECOVERY_AUDIO_ENDPOINT=${values.RUNPOD_AVANTIQO_AUDIO_ENDPOINT_ID ? "YES" : "NO"}`);
console.log(`AVANTIQO_RUNPOD_LOCAL_SOURCE_RECOVERY_LIPSYNC_ENDPOINT=${values.RUNPOD_AVANTIQO_LIPSYNC_ENDPOINT_ID ? "YES" : "NO"}`);
console.log("AVANTIQO_RUNPOD_LOCAL_SOURCE_RECOVERY_ENV_LOCAL_MODE=0600");
console.log("AVANTIQO_RUNPOD_LOCAL_SOURCE_RECOVERY_SECRET_VALUES_PRINTED=false");
console.log("AVANTIQO_RUNPOD_LOCAL_SOURCE_RECOVERY=PASS");
NODE
STATUS=$?
set -e

if [ "$STATUS" -eq 0 ]; then
  exit 0
fi
if [ "$STATUS" -eq 2 ]; then
  fail "NO_VALID_RUNPOD_CREDENTIAL_IN_LOCAL_TRACES"
fi
if [ "$STATUS" -eq 3 ]; then
  fail "RUNPOD_CREDENTIAL_VALID_BUT_INTELLIGENCE_ENDPOINT_MISSING"
fi
fail "LOCAL_SOURCE_RECOVERY_SCRIPT_FAILED"
