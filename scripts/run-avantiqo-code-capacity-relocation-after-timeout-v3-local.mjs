import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { loadEnvFile } from "node:process";
import { spawnSync } from "node:child_process";

const CONTRACT = "AVANTIQO_CODE_CAPACITY_TIMEOUT_RECOVERY_V3";
const CHILD_SCRIPT = "scripts/run-avantiqo-code-capacity-relocation-after-timeout-v2-local.mjs";
const CANONICAL_CODE_VOLUME_NAME = "avantiqo-shared-intelligence-code-cache";
const REST = "https://rest.runpod.io/v1";

function text(value) {
  return String(value ?? "").trim();
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function endpointVolumeIds(endpoint = {}) {
  const ids = [];
  if (text(endpoint.networkVolumeId)) ids.push(text(endpoint.networkVolumeId));
  if (Array.isArray(endpoint.networkVolumeIds)) {
    for (const id of endpoint.networkVolumeIds) {
      if (text(id)) ids.push(text(id));
    }
  }
  return [...new Set(ids)];
}

function loadLocalEnvironment() {
  const envPath = resolve(process.cwd(), ".env.local");
  if (!existsSync(envPath)) return false;
  loadEnvFile(envPath);
  return true;
}

async function readJson(response, label) {
  const raw = await response.text();
  let body = null;
  try {
    body = raw ? JSON.parse(raw) : null;
  } catch {
    body = null;
  }
  if (!response.ok) {
    throw new Error(`${label}_HTTP_${response.status}:${text(body?.message || body?.error || raw).slice(0, 700)}`);
  }
  return body;
}

async function rest(managementKey, path, options = {}) {
  return readJson(await fetch(`${REST}${path}`, {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${managementKey}`,
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(30_000),
  }), "RUNPOD_MANAGEMENT");
}

const localEnvLoaded = loadLocalEnvironment();
const managementKey = text(process.env.RUNPOD_MANAGEMENT_API_KEY);
const failedJobId = text(process.argv[2] || process.env.AVANTIQO_CODE_CAPACITY_RELOCATION_FAILED_JOB_ID);
const apply = ["1", "true", "yes", "on", "approved"].includes(
  text(process.env.AVANTIQO_CODE_CAPACITY_RELOCATION_APPLY).toLowerCase(),
);

if (!managementKey) throw new Error("RUNPOD_MANAGEMENT_API_KEY_REQUIRED");
if (!failedJobId || !/^[A-Za-z0-9-]+$/.test(failedJobId)) {
  throw new Error("AVANTIQO_CODE_CAPACITY_RELOCATION_FAILED_JOB_ID_REQUIRED");
}

const [beforeVolumes, beforeEndpoints] = await Promise.all([
  rest(managementKey, "/networkvolumes"),
  rest(managementKey, "/endpoints?includeTemplate=false&includeWorkers=true"),
]);
if (!Array.isArray(beforeVolumes) || !Array.isArray(beforeEndpoints)) {
  throw new Error("CODE_TIMEOUT_RECOVERY_V3_RUNPOD_LIST_INVALID");
}
const beforeVolumeIds = new Set(beforeVolumes.map((volume) => text(volume?.id)).filter(Boolean));

console.log(JSON.stringify({
  event: "AVANTIQO_CODE_CAPACITY_TIMEOUT_RECOVERY_V3_START",
  contract: CONTRACT,
  mode: apply ? "APPLY" : "PLAN",
  local_env_loaded: localEnvLoaded,
  failed_job_id: failedJobId,
  canonical_code_volume_name: CANONICAL_CODE_VOLUME_NAME,
  preexisting_volume_count: beforeVolumeIds.size,
  child_script: CHILD_SCRIPT,
  cleanup_scope: "ONLY_NEW_UNATTACHED_CANONICAL_CODE_VOLUME_CREATED_BY_THIS_RUN",
  production_deploy_performed: false,
  secrets_printed: false,
}, null, 2));

const child = spawnSync(process.execPath, [resolve(process.cwd(), CHILD_SCRIPT), failedJobId], {
  cwd: process.cwd(),
  env: process.env,
  stdio: "inherit",
});

if (child.error) throw child.error;
if (child.signal) throw new Error(`CODE_TIMEOUT_RECOVERY_V3_CHILD_SIGNAL:${child.signal}`);

if (child.status === 0) {
  console.log(JSON.stringify({
    event: "AVANTIQO_CODE_CAPACITY_TIMEOUT_RECOVERY_V3_COMPLETE",
    contract: CONTRACT,
    mode: apply ? "APPLY" : "PLAN",
    child_exit_code: 0,
    orphan_cleanup_required: false,
    production_deploy_performed: false,
    secrets_printed: false,
  }));
  process.exit(0);
}

let cleanup = {
  attempted: false,
  deleted_volume_ids: [],
  preserved_attached_new_volume_ids: [],
  cleanup_errors: [],
};

if (apply) {
  cleanup.attempted = true;
  try {
    const [afterVolumes, afterEndpoints] = await Promise.all([
      rest(managementKey, "/networkvolumes"),
      rest(managementKey, "/endpoints?includeTemplate=false&includeWorkers=true"),
    ]);
    if (!Array.isArray(afterVolumes) || !Array.isArray(afterEndpoints)) {
      throw new Error("CODE_TIMEOUT_RECOVERY_V3_POST_FAILURE_RUNPOD_LIST_INVALID");
    }

    const newlyCreatedCanonical = afterVolumes.filter((volume) =>
      text(volume?.name) === CANONICAL_CODE_VOLUME_NAME &&
      text(volume?.id) &&
      !beforeVolumeIds.has(text(volume?.id)),
    );

    for (const volume of newlyCreatedCanonical) {
      const volumeId = text(volume?.id);
      const users = afterEndpoints
        .filter((endpoint) => endpointVolumeIds(endpoint).includes(volumeId))
        .map((endpoint) => ({ id: text(endpoint?.id) || null, name: text(endpoint?.name) || null }));
      if (users.length) {
        cleanup.preserved_attached_new_volume_ids.push({ volume_id: volumeId, users });
        continue;
      }
      try {
        await rest(managementKey, `/networkvolumes/${encodeURIComponent(volumeId)}`, { method: "DELETE" });
        cleanup.deleted_volume_ids.push(volumeId);
        console.error(`AVANTIQO_CODE_CAPACITY_TIMEOUT_RECOVERY_V3_ORPHAN_VOLUME_DELETED=${volumeId}`);
      } catch (error) {
        cleanup.cleanup_errors.push({ volume_id: volumeId, error: text(error?.message || error) });
      }
    }
  } catch (error) {
    cleanup.cleanup_errors.push({ volume_id: null, error: text(error?.message || error) });
  }
}

console.error(JSON.stringify({
  event: "AVANTIQO_CODE_CAPACITY_TIMEOUT_RECOVERY_V3_CHILD_FAILED",
  contract: CONTRACT,
  mode: apply ? "APPLY" : "PLAN",
  child_exit_code: child.status,
  cleanup,
  production_deploy_performed: false,
  secrets_printed: false,
}, null, 2));
process.exit(child.status || 1);
