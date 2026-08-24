import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { loadEnvFile } from "node:process";
import { spawn } from "node:child_process";

const CONTRACT = "AVANTIQO_CODE_REGION_PLAN_RUNNER_V1";
const CODE_ENDPOINT_NAME = "avantiqo-code-v1";
const REST = "https://rest.runpod.io/v1";
const MIGRATION_SCRIPT = "scripts/migrate-avantiqo-code-runpod-region-local.mjs";

function text(value) {
  return String(value ?? "").trim();
}

function loadLocalEnvironment() {
  const localEnvPath = resolve(process.cwd(), ".env.local");
  if (!existsSync(localEnvPath)) return false;
  loadEnvFile(localEnvPath);
  return true;
}

async function readJson(response, label) {
  const raw = await response.text();
  let body = null;
  try {
    body = raw ? JSON.parse(raw) : null;
  } catch {
    throw new Error(`${label}_INVALID_JSON`);
  }
  if (!response.ok) {
    throw new Error(`${label}_HTTP_${response.status}:${text(body?.message || body?.error || raw).slice(0, 500)}`);
  }
  return body;
}

async function resolveCodeEndpoint(managementKey) {
  const configuredId = text(process.env.RUNPOD_AVANTIQO_CODE_ENDPOINT_ID);
  const response = await fetch(`${REST}/endpoints?includeTemplate=true&includeWorkers=true`, {
    headers: {
      Authorization: `Bearer ${managementKey}`,
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(30_000),
  });
  const endpoints = await readJson(response, "RUNPOD_ENDPOINT_DISCOVERY");
  if (!Array.isArray(endpoints)) throw new Error("RUNPOD_ENDPOINT_LIST_INVALID");

  const matches = configuredId
    ? endpoints.filter((endpoint) => text(endpoint?.id) === configuredId)
    : endpoints.filter((endpoint) => text(endpoint?.name) === CODE_ENDPOINT_NAME);
  if (matches.length !== 1) {
    throw new Error(`RUNPOD_CODE_ENDPOINT_RESOLUTION_FAILED:matches=${matches.length}`);
  }
  const endpoint = matches[0];
  if (text(endpoint?.name) !== CODE_ENDPOINT_NAME) {
    throw new Error(`RUNPOD_CODE_ENDPOINT_NAME_MISMATCH:${text(endpoint?.name) || "missing"}`);
  }
  const id = text(endpoint?.id);
  if (!id) throw new Error("RUNPOD_CODE_ENDPOINT_ID_MISSING_AFTER_RESOLUTION");
  return { id, source: configuredId ? "ENV_VERIFIED" : "EXACT_NAME" };
}

const localEnvLoaded = loadLocalEnvironment();
const managementKey = text(process.env.RUNPOD_MANAGEMENT_API_KEY);
if (!managementKey) throw new Error("RUNPOD_MANAGEMENT_API_KEY_REQUIRED");

const endpoint = await resolveCodeEndpoint(managementKey);
console.log(JSON.stringify({
  event: "AVANTIQO_CODE_REGION_PLAN_START",
  contract: CONTRACT,
  endpoint_resolution_source: endpoint.source,
  local_env_loaded: localEnvLoaded,
  mutation_performed: false,
  provider_job_submitted: false,
  production_deploy_performed: false,
  secrets_printed: false,
}));

const child = spawn(process.execPath, [MIGRATION_SCRIPT], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    RUNPOD_AVANTIQO_CODE_ENDPOINT_ID: endpoint.id,
    AVANTIQO_CODE_REGION_MIGRATION_APPLY: "false",
  },
  stdio: "inherit",
});

const exitCode = await new Promise((resolveExit, reject) => {
  child.once("error", reject);
  child.once("exit", (code, signal) => {
    if (signal) {
      reject(new Error(`CODE_REGION_PLAN_CHILD_SIGNAL:${signal}`));
      return;
    }
    resolveExit(code ?? 1);
  });
});

if (exitCode !== 0 && exitCode !== 2) {
  throw new Error(`CODE_REGION_PLAN_CHILD_EXIT:${exitCode}`);
}

console.log(JSON.stringify({
  event: "AVANTIQO_CODE_REGION_PLAN_COMPLETE",
  contract: CONTRACT,
  child_exit_code: exitCode,
  mutation_performed: false,
  provider_job_submitted: false,
  production_deploy_performed: false,
  secrets_printed: false,
}));

process.exitCode = exitCode;
