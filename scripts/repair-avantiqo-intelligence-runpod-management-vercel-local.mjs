#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { loadAvantiqoEnv } from "./load-avantiqo-env.mjs";

const CONTRACT = "AVANTIQO_INTELLIGENCE_RUNPOD_MANAGEMENT_VERCEL_REPAIR_V1";
const APPROVAL_ENV = "AVANTIQO_INTELLIGENCE_RUNPOD_MANAGEMENT_VERCEL_REPAIR_APPROVED";
const EXPECTED_PROJECT_ID = "prj_5K2x3kGkhs3d2PU8VOQQPyNT24A9";
const EXPECTED_ORG_ID = "team_40jy42BqQOs4U6pVdkawwEfp";
const ENV_KEY = "RUNPOD_MANAGEMENT_API_KEY";
const RUNPOD_REST = "https://rest.runpod.io/v1";
const EXPECTED_ENDPOINTS = Object.freeze({
  "avantiqo-intelligence-fast-v1": "RUNPOD_AVANTIQO_INTELLIGENCE_FAST_ENDPOINT_ID",
  "avantiqo-intelligence-v1": "RUNPOD_AVANTIQO_INTELLIGENCE_ENDPOINT_ID",
});

const text = (value) => String(value ?? "").trim();

function redact(value, secret = "") {
  let output = text(value);
  if (secret) output = output.split(secret).join("[REDACTED]");
  return output
    .replace(/Bearer\s+[A-Za-z0-9._~+\/-]{8,}/gi, "Bearer [REDACTED]")
    .replace(/((?:api[_-]?key|token|password|secret|authorization)["']?\s*[:=]\s*["']?)[^"',\s}]+/gi, "$1[REDACTED]")
    .slice(0, 2400);
}

function run(command, args, { input = null, secret = "", allowFailure = false } = {}) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    env: process.env,
    input,
    stdio: [input === null ? "ignore" : "pipe", "pipe", "pipe"],
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.error || (!allowFailure && result.status !== 0)) {
    const detail = result.error?.message || result.stderr || result.stdout || "UNKNOWN_FAILURE";
    throw new Error(`${CONTRACT}_COMMAND_FAILED:${command}:${redact(detail, secret)}`);
  }
  return {
    status: Number.isInteger(result.status) ? result.status : 1,
    stdout: text(result.stdout),
    stderr: text(result.stderr),
  };
}

function resolveVercelCommand() {
  const direct = run("vercel", ["--version"], { allowFailure: true });
  if (direct.status === 0) return { command: "vercel", prefix: [] };
  const npx = run("npx", ["--yes", "vercel", "--version"], { allowFailure: true });
  if (npx.status === 0) return { command: "npx", prefix: ["--yes", "vercel"] };
  throw new Error(`${CONTRACT}_VERCEL_CLI_REQUIRED`);
}

function vercel(cli, args, options = {}) {
  return run(cli.command, [...cli.prefix, ...args], options);
}

async function verifyProjectLink() {
  const projectPath = path.join(process.cwd(), ".vercel", "project.json");
  const parsed = JSON.parse(await readFile(projectPath, "utf8"));
  if (text(parsed?.projectId) !== EXPECTED_PROJECT_ID || text(parsed?.orgId) !== EXPECTED_ORG_ID) {
    throw new Error(`${CONTRACT}_VERCEL_PROJECT_LINK_MISMATCH`);
  }
}

function rows(value, depth = 0) {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== "object" || depth > 4) return [];
  for (const key of ["endpoints", "serverlessEndpoints", "data", "items", "results"]) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) continue;
    const found = rows(value[key], depth + 1);
    if (found.length || Array.isArray(value[key])) return found;
  }
  return [];
}

async function validateManagementKey(key) {
  const response = await fetch(`${RUNPOD_REST}/endpoints?includeTemplate=false&includeWorkers=false`, {
    headers: {
      Authorization: `Bearer ${key}`,
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(30_000),
  });
  const raw = await response.text();
  let body = null;
  try { body = raw ? JSON.parse(raw) : null; } catch {}
  if (!response.ok) {
    throw new Error(`${CONTRACT}_RUNPOD_MANAGEMENT_KEY_REJECTED_HTTP_${response.status}`);
  }
  const endpoints = rows(body);
  const verified = {};
  for (const [name, envName] of Object.entries(EXPECTED_ENDPOINTS)) {
    const matches = endpoints.filter((entry) => text(entry?.name) === name);
    if (matches.length !== 1) {
      throw new Error(`${CONTRACT}_ENDPOINT_RESOLUTION_FAILED:${name}:${matches.length}`);
    }
    const endpointId = text(matches[0]?.id);
    const configuredId = text(process.env[envName]);
    if (configuredId && configuredId !== endpointId) {
      throw new Error(`${CONTRACT}_ENDPOINT_ID_MISMATCH:${name}`);
    }
    verified[name] = true;
  }
  return verified;
}

function envListed(output) {
  return output.split(/\r?\n/).some((line) => line.includes(ENV_KEY));
}

const apply = process.argv.includes("--apply");
if (!apply || text(process.env[APPROVAL_ENV]).toUpperCase() !== "YES") {
  throw new Error(`${APPROVAL_ENV}=YES_AND_--apply_REQUIRED`);
}

loadAvantiqoEnv();
const managementKey = text(process.env[ENV_KEY]);
if (!managementKey || managementKey.length < 20) {
  throw new Error(`${CONTRACT}_LOCAL_${ENV_KEY}_REQUIRED`);
}

await verifyProjectLink();
const endpointsVerified = await validateManagementKey(managementKey);
const cli = resolveVercelCommand();
const envList = vercel(cli, ["env", "ls", "production"]);
const existedBefore = envListed(`${envList.stdout}\n${envList.stderr}`);
const secretInput = `${managementKey}\n`;

const write = existedBefore
  ? vercel(cli, ["env", "update", ENV_KEY, "production", "--sensitive"], {
      input: secretInput,
      secret: managementKey,
      allowFailure: true,
    })
  : vercel(cli, ["env", "add", ENV_KEY, "production", "--sensitive"], {
      input: secretInput,
      secret: managementKey,
      allowFailure: true,
    });

if (write.status !== 0) {
  throw new Error(
    `${CONTRACT}_VERCEL_ENV_WRITE_FAILED:${redact(write.stderr || write.stdout, managementKey)}`,
  );
}

const afterList = vercel(cli, ["env", "ls", "production"]);
if (!envListed(`${afterList.stdout}\n${afterList.stderr}`)) {
  throw new Error(`${CONTRACT}_VERCEL_ENV_NOT_LISTED_AFTER_WRITE`);
}

console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  production_project_id: EXPECTED_PROJECT_ID,
  production_team_id: EXPECTED_ORG_ID,
  local_management_key_present: true,
  local_management_key_validated_by_runpod_rest: true,
  intelligence_endpoints_verified: endpointsVerified,
  vercel_variable: ENV_KEY,
  vercel_variable_sensitive: true,
  vercel_variable_existed_before: existedBefore,
  vercel_variable_upserted: true,
  production_deploy_performed: false,
  runpod_mutation_performed: false,
  inference_performed: false,
  secrets_printed: false,
}, null, 2));
console.log(`${CONTRACT}=PASS`);
