#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { spawn } from "node:child_process";

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
  "HUGGING_FACE_HUB_TOKEN",
  "HUGGINGFACE_HUB_TOKEN",
  "HUGGING_FACE_HUB_ACCESS_TOKEN",
  "HUGGINGFACE_TOKEN",
  "HF_ACCESS_TOKEN",
];

function parseDotEnv(raw) {
  const result = {};
  for (const original of raw.split(/\r?\n/)) {
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

const values = parseDotEnv(await readFile(ENV_FILE, "utf8"));

for (const name of REQUIRED_DIRECT) {
  if (!values[name]) {
    throw new Error(`AVANTIQO_VIDEO_LTX25_LOCAL_SECRET_REQUIRED:${name}`);
  }
}

const hfSource = HF_ALIASES.find((name) => values[name]);
if (!hfSource) {
  throw new Error(
    `AVANTIQO_VIDEO_LTX25_LOCAL_SECRET_REQUIRED_ONE_OF:${HF_ALIASES.join(",")}`,
  );
}

await run("gh", ["auth", "status"]);

for (const name of [...REQUIRED_DIRECT, ...OPTIONAL_DIRECT]) {
  const value = values[name];
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
  stdin: values[hfSource],
});
console.log(`AVANTIQO_VIDEO_LTX25_HF_SECRET_SET_FROM=${hfSource}`);

await run("gh", ["workflow", "run", WORKFLOW, "--repo", REPO, "--ref", "main"]);
console.log("AVANTIQO_VIDEO_LTX25_SCENE1_CI_TRIGGERED=true");
console.log("SECRETS_PRINTED=false");
console.log("PRODUCTION_DEPLOY_TRIGGERED=false");
