#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { spawn } from "node:child_process";

const ENV_FILE = ".env.local";
const REPO = "churchillkaron/churchill-control-new";
const WORKFLOW = "avantiqo-video-v72-flashvsr-4k-quality-final.yml";
const REQUIRED = [
  "RUNPOD_MANAGEMENT_API_KEY",
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
];
const OPTIONAL = [
  "RUNPOD_API_KEY",
  "RUNPOD_AVANTIQO_VIDEO_API_KEY",
];

function parseDotEnv(raw) {
  const result = {};
  for (const original of raw.split(/\r?\n/)) {
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
    result[match[1]] = value;
  }
  return result;
}

function run(command, args, { stdin = null } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: [stdin === null ? "inherit" : "pipe", "inherit", "inherit"],
      env: process.env,
    });
    if (stdin !== null) {
      child.stdin.end(stdin);
    }
    child.on("error", reject);
    child.on("exit", (code) => code === 0 ? resolve() : reject(new Error(`${command} exited ${code}`)));
  });
}

const values = parseDotEnv(await readFile(ENV_FILE, "utf8"));
for (const name of REQUIRED) {
  if (!values[name]) throw new Error(`AVANTIQO_VIDEO_V72_CI_LOCAL_SECRET_REQUIRED:${name}`);
}

await run("gh", ["auth", "status"]);

for (const name of [...REQUIRED, ...OPTIONAL]) {
  const value = values[name];
  if (!value) {
    if (OPTIONAL.includes(name)) {
      console.log(`AVANTIQO_VIDEO_V72_CI_SECRET_SKIPPED_OPTIONAL=${name}`);
      continue;
    }
    throw new Error(`AVANTIQO_VIDEO_V72_CI_LOCAL_SECRET_REQUIRED:${name}`);
  }
  await run("gh", ["secret", "set", name, "--repo", REPO], { stdin: value });
  console.log(`AVANTIQO_VIDEO_V72_CI_SECRET_SET=${name}`);
}

await run("gh", ["workflow", "run", WORKFLOW, "--repo", REPO, "--ref", "main"]);
console.log("AVANTIQO_VIDEO_V72_FLASHVSR_4K_QUALITY_FINAL_CI_TRIGGERED=true");
console.log("SECRETS_PRINTED=false");
console.log("PRODUCTION_DEPLOY_TRIGGERED=false");
