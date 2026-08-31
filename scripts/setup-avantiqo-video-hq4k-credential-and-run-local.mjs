#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { spawn, spawnSync } from "node:child_process";

const REPO = "churchillkaron/churchill-control-new";
const WORKFLOW = "avantiqo-video-ltx25-hq4k-scene1-credential-v2.yml";
const ENV_FILE = ".env.local";
const HQ_DEV_URL = "https://huggingface.co/Lightricks/LTX-2.5/resolve/main/diffusion_models/ltx-2.5-22b-dev-transformer-bf16.safetensors";

const HF_ALIASES = Object.freeze([
  "HF_TOKEN",
  "HF_ACCESS_TOKEN",
  "HF_API_TOKEN",
  "HF_API_KEY",
  "HUGGING_FACE_TOKEN",
  "HUGGING_FACE_ACCESS_TOKEN",
  "HUGGING_FACE_API_TOKEN",
  "HUGGING_FACE_API_KEY",
  "HUGGING_FACE_HUB_TOKEN",
  "HUGGING_FACE_HUB_ACCESS_TOKEN",
  "HUGGINGFACE_TOKEN",
  "HUGGINGFACE_ACCESS_TOKEN",
  "HUGGINGFACE_API_TOKEN",
  "HUGGINGFACE_API_KEY",
  "HUGGINGFACE_HUB_TOKEN",
]);

function parseDotEnv(raw) {
  const out = {};
  for (const original of String(raw ?? "").split(/\r?\n/)) {
    const line = original.trim();
    if (!line || line.startsWith("#")) continue;
    const match = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    } else {
      const comment = value.search(/\s+#/);
      if (comment >= 0) value = value.slice(0, comment).trim();
    }
    out[match[1]] = value;
  }
  return out;
}

function normalizeToken(value) {
  const token = String(value ?? "").trim().replace(/^Bearer\s+/i, "");
  return token.startsWith("hf_") && token.length >= 20 ? token : "";
}

async function entitlement(token) {
  const response = await fetch(HQ_DEV_URL, {
    method: "HEAD",
    redirect: "manual",
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(30_000),
  });
  return response.status;
}

function run(command, args, { stdin = null } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: process.cwd(),
      env: process.env,
      stdio: [stdin === null ? "inherit" : "pipe", "inherit", "inherit"],
    });
    if (stdin !== null) child.stdin.end(stdin);
    child.on("error", reject);
    child.on("exit", (code) => code === 0 ? resolve() : reject(new Error(`${command} exited ${code}`)));
  });
}

const local = parseDotEnv(await readFile(ENV_FILE, "utf8"));
const candidates = [];
for (const name of HF_ALIASES) {
  const token = normalizeToken(process.env[name] || local[name]);
  if (token && !candidates.some((entry) => entry.token === token)) candidates.push({ name, token });
}
for (const [name, value] of Object.entries({ ...local, ...process.env })) {
  const token = normalizeToken(value);
  if (token && !candidates.some((entry) => entry.token === token)) candidates.push({ name, token });
}

if (!candidates.length) {
  throw new Error("AVANTIQO_VIDEO_HQ4K_LOCAL_HF_CREDENTIAL_NOT_FOUND");
}

let winner = null;
for (const candidate of candidates) {
  const status = await entitlement(candidate.token);
  console.log(`AVANTIQO_VIDEO_HQ4K_LOCAL_CREDENTIAL_TEST=${candidate.name}:${status}`);
  if ([200, 206, 302, 303, 307, 308].includes(status)) {
    winner = { ...candidate, status };
    break;
  }
}

if (!winner) {
  throw new Error("AVANTIQO_VIDEO_HQ4K_LOCAL_CREDENTIAL_NOT_ENTITLED");
}

const auth = spawnSync("gh", ["auth", "status"], { stdio: "inherit", cwd: process.cwd(), env: process.env });
if (auth.status !== 0) throw new Error("AVANTIQO_VIDEO_HQ4K_GH_AUTH_REQUIRED");

await run("gh", ["secret", "set", "HF_TOKEN", "--repo", REPO], { stdin: winner.token });
console.log(`AVANTIQO_VIDEO_HQ4K_HF_SECRET_SET_FROM=${winner.name}`);
console.log(`AVANTIQO_VIDEO_HQ4K_HF_ENTITLEMENT=PASS:${winner.status}`);

await run("gh", ["workflow", "run", WORKFLOW, "--repo", REPO, "--ref", "main"]);
console.log("AVANTIQO_VIDEO_HQ4K_WORKFLOW_TRIGGERED=true");
console.log("SECRETS_PRINTED=false");
console.log("PRODUCTION_DEPLOY_TRIGGERED=false");
