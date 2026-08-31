#!/usr/bin/env node

import { readFile, unlink } from "node:fs/promises";
import { spawn, spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

const ENV_FILE = ".env.local";
const REPO = "churchillkaron/churchill-control-new";
const WORKFLOW = "avantiqo-video-ltx25-scene1-proof.yml";

const REQUIRED_DIRECT = [
  "RUNPOD_MANAGEMENT_API_KEY",
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
];

const OPTIONAL_DIRECT = [
  "RUNPOD_API_KEY",
  "RUNPOD_AVANTIQO_VIDEO_API_KEY",
];

const HF_ALIASES = [
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
];

function parseDotEnv(raw) {
  const result = {};
  for (const original of String(raw ?? "").split(/\r?\n/)) {
    const line = original.trim();
    if (!line || line.startsWith("#")) continue;
    const match = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;
    let value = match[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    } else {
      const comment = value.search(/\s+#/);
      if (comment >= 0) value = value.slice(0, comment).trim();
    }
    result[match[1]] = value;
  }
  return result;
}

function normalizeHfToken(value) {
  const token = String(value ?? "").trim().replace(/^Bearer\s+/i, "");
  return /^hf_[A-Za-z0-9_-]{20,}$/.test(token) ? token : "";
}

function findHfCredential(values, source) {
  for (const key of HF_ALIASES) {
    const token = normalizeHfToken(values[key]);
    if (token) return { token, source, key };
  }

  const candidates = Object.entries(values)
    .map(([key, value]) => ({ key, token: normalizeHfToken(value) }))
    .filter((entry) => entry.token)
    .sort((a, b) => {
      const score = (key) => /HUGGING|HF(?:_|$)/i.test(key) ? 1 : 0;
      return score(b.key) - score(a.key) || a.key.localeCompare(b.key);
    });

  if (candidates.length) {
    return { token: candidates[0].token, source, key: candidates[0].key };
  }
  return null;
}

function run(command, args, { stdin = null } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: [stdin === null ? "inherit" : "pipe", "inherit", "inherit"],
      env: process.env,
    });
    if (stdin !== null) child.stdin.end(stdin);
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited ${code}`));
    });
  });
}

function quiet(command, args) {
  return spawnSync(command, args, {
    cwd: process.cwd(),
    env: process.env,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 120_000,
  });
}

async function recoverFromVercel() {
  const tempPath = join(tmpdir(), `avantiqo-video-ltx25-vercel-env-${randomUUID()}`);
  try {
    let result = quiet("vercel", ["env", "pull", tempPath, "--environment=production"]);
    if (result.error?.code === "ENOENT") {
      result = quiet("npx", ["--yes", "vercel@latest", "env", "pull", tempPath, "--environment=production"]);
    }
    if (result.status !== 0) {
      console.log("AVANTIQO_VIDEO_LTX25_VERCEL_ENV_PULL=UNAVAILABLE");
      return null;
    }

    const pulled = parseDotEnv(await readFile(tempPath, "utf8"));
    const credential = findHfCredential(pulled, "vercel-production-env");
    console.log(`AVANTIQO_VIDEO_LTX25_VERCEL_ENV_PULL=${credential ? "PASS" : "NO_HF_CREDENTIAL"}`);
    return credential;
  } catch {
    console.log("AVANTIQO_VIDEO_LTX25_VERCEL_ENV_PULL=UNAVAILABLE");
    return null;
  } finally {
    await unlink(tempPath).catch(() => {});
  }
}

const localFileValues = parseDotEnv(await readFile(ENV_FILE, "utf8"));
const localValues = { ...process.env, ...localFileValues };

for (const name of REQUIRED_DIRECT) {
  if (!localValues[name]) {
    throw new Error(`AVANTIQO_VIDEO_LTX25_LOCAL_SECRET_REQUIRED:${name}`);
  }
}

let hfCredential = findHfCredential(process.env, "shell-env")
  || findHfCredential(localFileValues, "env-local");

if (!hfCredential) {
  hfCredential = await recoverFromVercel();
}

if (!hfCredential) {
  const relatedNames = Object.keys(localValues)
    .filter((name) => /HUGGING|HF(?:_|$)|LTX/i.test(name))
    .sort();
  console.log(`AVANTIQO_VIDEO_LTX25_RELATED_LOCAL_ENV_NAMES=${relatedNames.join(",") || "NONE"}`);
  throw new Error("AVANTIQO_VIDEO_LTX25_EXISTING_HF_CREDENTIAL_NOT_RECOVERABLE");
}

await run("gh", ["auth", "status"]);

for (const name of [...REQUIRED_DIRECT, ...OPTIONAL_DIRECT]) {
  const value = localValues[name];
  if (!value) {
    if (OPTIONAL_DIRECT.includes(name)) {
      console.log(`AVANTIQO_VIDEO_LTX25_SECRET_SKIPPED_OPTIONAL=${name}`);
      continue;
    }
    throw new Error(`AVANTIQO_VIDEO_LTX25_LOCAL_SECRET_REQUIRED:${name}`);
  }
  await run("gh", ["secret", "set", name, "--repo", REPO], { stdin: value });
  console.log(`AVANTIQO_VIDEO_LTX25_SECRET_SET=${name}`);
}

await run("gh", ["secret", "set", "HF_TOKEN", "--repo", REPO], {
  stdin: hfCredential.token,
});
console.log(`AVANTIQO_VIDEO_LTX25_HF_SECRET_SET_FROM=${hfCredential.source}:${hfCredential.key}`);

await run("gh", ["workflow", "run", WORKFLOW, "--repo", REPO, "--ref", "main"]);
console.log("AVANTIQO_VIDEO_LTX25_SCENE1_CI_TRIGGERED=true");
console.log("SECRETS_PRINTED=false");
console.log("PRODUCTION_DEPLOY_TRIGGERED=false");
