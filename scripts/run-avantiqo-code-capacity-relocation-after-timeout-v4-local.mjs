import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const CONTRACT = "AVANTIQO_CODE_CAPACITY_TIMEOUT_RECOVERY_V4";
const RELOCATION_SCRIPT = "relocate-avantiqo-code-runpod-capacity-local.mjs";
const V2_SCRIPT = "run-avantiqo-code-capacity-relocation-after-timeout-v2-local.mjs";
const V3_SCRIPT = "run-avantiqo-code-capacity-relocation-after-timeout-v3-local.mjs";
const V2_SOURCE_ANCHOR = 'const SOURCE_SCRIPT = "relocate-avantiqo-code-runpod-capacity-local.mjs";';
const V3_CHILD_ANCHOR = 'const CHILD_SCRIPT = "scripts/run-avantiqo-code-capacity-relocation-after-timeout-v2-local.mjs";';

function text(value) {
  return String(value ?? "").trim();
}

function replaceExactlyOnce(source, needle, replacement, code) {
  const first = source.indexOf(needle);
  if (first < 0) throw new Error(`${code}_ANCHOR_MISSING`);
  if (source.indexOf(needle, first + needle.length) >= 0) {
    throw new Error(`${code}_ANCHOR_AMBIGUOUS`);
  }
  return source.replace(needle, replacement);
}

const scriptDir = dirname(fileURLToPath(import.meta.url));
const relocationPath = resolve(scriptDir, RELOCATION_SCRIPT);
const v2Path = resolve(scriptDir, V2_SCRIPT);
const v3Path = resolve(scriptDir, V3_SCRIPT);

for (const [path, code] of [
  [relocationPath, "CODE_TIMEOUT_RECOVERY_V4_RELOCATION_SOURCE_REQUIRED"],
  [v2Path, "CODE_TIMEOUT_RECOVERY_V4_V2_SOURCE_REQUIRED"],
  [v3Path, "CODE_TIMEOUT_RECOVERY_V4_V3_SOURCE_REQUIRED"],
]) {
  if (!existsSync(path)) throw new Error(code);
}

const relocationSource = readFileSync(relocationPath, "utf8");
const v2Source = readFileSync(v2Path, "utf8");
const v3Source = readFileSync(v3Path, "utf8");

if (!relocationSource.includes('const CONTRACT = "AVANTIQO_CODE_CAPACITY_RELOCATION_V1";')) {
  throw new Error("CODE_TIMEOUT_RECOVERY_V4_RELOCATION_CONTRACT_CHANGED");
}
if (!v2Source.includes('const CONTRACT = "AVANTIQO_CODE_CAPACITY_TIMEOUT_RECOVERY_V2";')) {
  throw new Error("CODE_TIMEOUT_RECOVERY_V4_V2_CONTRACT_CHANGED");
}
if (!v3Source.includes('const CONTRACT = "AVANTIQO_CODE_CAPACITY_TIMEOUT_RECOVERY_V3";')) {
  throw new Error("CODE_TIMEOUT_RECOVERY_V4_V3_CONTRACT_CHANGED");
}

const targetCreateAnchor = `  targetVolume = await rest("/networkvolumes", managementKey, {
    method: "POST",
    body: { dataCenterId: targetDcId, name: SHARED_GROUP.canonical_name, size: TARGET_VOLUME_SIZE_GB },
  });
  targetVolumeCreated = true;
  console.log(\`AVANTIQO_CODE_CAPACITY_RELOCATION_TARGET_VOLUME_CREATED=\${text(targetVolume?.id) || "MISSING"}\`);`;

const targetCreateRecovery = `  const volumeIdsBeforeCreate = new Set(volumes.map((volume) => text(volume?.id)).filter(Boolean));
  let targetCreateError = null;
  try {
    targetVolume = await rest("/networkvolumes", managementKey, {
      method: "POST",
      body: { dataCenterId: targetDcId, name: SHARED_GROUP.canonical_name, size: TARGET_VOLUME_SIZE_GB },
    });
  } catch (error) {
    targetCreateError = error;
    targetVolume = null;
  }

  const createResponseUsable = Boolean(
    text(targetVolume?.id) &&
    text(targetVolume?.dataCenterId) === targetDcId
  );

  if (!createResponseUsable) {
    const reconcileDeadline = Date.now() + 20_000;
    let reconciledCandidates = [];
    while (Date.now() < reconcileDeadline) {
      const observedVolumes = await rest("/networkvolumes", managementKey);
      reconciledCandidates = groupCacheVolumes(observedVolumes, SHARED_GROUP).filter((volume) =>
        text(volume?.name) === SHARED_GROUP.canonical_name &&
        text(volume?.dataCenterId) === targetDcId &&
        number(volume?.size ?? volume?.sizeGb, null) === TARGET_VOLUME_SIZE_GB &&
        text(volume?.id) &&
        !volumeIdsBeforeCreate.has(text(volume?.id))
      );
      if (reconciledCandidates.length === 1) {
        targetVolume = reconciledCandidates[0];
        break;
      }
      if (reconciledCandidates.length > 1) {
        throw new Error(
          \`CODE_CAPACITY_RELOCATION_TARGET_VOLUME_CREATE_RECONCILE_AMBIGUOUS:count=\${reconciledCandidates.length}\`,
        );
      }
      await sleep(1000);
    }

    if (!targetVolume) {
      if (targetCreateError) throw targetCreateError;
      throw new Error("CODE_CAPACITY_RELOCATION_TARGET_VOLUME_CREATE_RESPONSE_UNUSABLE_AND_NOT_RECONCILED");
    }

    console.log(JSON.stringify({
      event: "AVANTIQO_CODE_CAPACITY_RELOCATION_TARGET_VOLUME_CREATE_RECONCILED",
      target_volume_id: text(targetVolume?.id) || null,
      target_data_center_id: text(targetVolume?.dataCenterId) || null,
      target_size_gb: number(targetVolume?.size ?? targetVolume?.sizeGb, null),
      create_http_error: text(targetCreateError?.message || targetCreateError).slice(0, 300) || null,
      exactly_one_new_canonical_target_volume: true,
      endpoint_mutation_performed_at_reconcile: false,
      secrets_printed: false,
    }));
  }

  targetVolumeCreated = true;
  console.log(\`AVANTIQO_CODE_CAPACITY_RELOCATION_TARGET_VOLUME_CREATED=\${text(targetVolume?.id) || "MISSING"}\`);`;

const waitForJobAnchor = `async function waitForJob(endpointId, key, jobId, label) {
  const started = Date.now();
  let body = await serverless(endpointId, \`/status/\${encodeURIComponent(jobId)}\`, key);
  let status = upper(body?.status);
  let lastPrinted = 0;
  while (!["COMPLETED", "FAILED", "TIMED_OUT", "CANCELLED", "CANCELED"].includes(status)) {
    const elapsed = Date.now() - started;
    if (status === "IN_QUEUE" && elapsed >= QUEUE_TIMEOUT_MS) {
      await serverless(endpointId, \`/cancel/\${encodeURIComponent(jobId)}\`, key, { method: "POST" }).catch(() => null);
      throw new Error(\`\${label}_QUEUE_TIMEOUT:\${jobId}:\${Math.round(elapsed / 1000)}s\`);
    }
    if (elapsed >= JOB_TIMEOUT_MS) {
      await serverless(endpointId, \`/cancel/\${encodeURIComponent(jobId)}\`, key, { method: "POST" }).catch(() => null);
      throw new Error(\`\${label}_JOB_TIMEOUT:\${jobId}:\${Math.round(elapsed / 1000)}s\`);
    }
    if (Date.now() - lastPrinted >= 15_000) {
      const health = await serverless(endpointId, "/health", key).catch(() => null);
      console.log(JSON.stringify({
        event: \`\${label}_PROGRESS\`,
        job_id: jobId,
        status,
        elapsed_seconds: Math.round(elapsed / 1000),
        health: health ? healthCounters(health) : null,
      }));
      lastPrinted = Date.now();
    }
    await sleep(POLL_MS);
    body = await serverless(endpointId, \`/status/\${encodeURIComponent(jobId)}\`, key);
    status = upper(body?.status);
  }
  if (status !== "COMPLETED") {
    throw new Error(\`\${label}_\${status}:\${text(body?.error || body?.output?.error || body?.message)}\`);
  }
  return body;
}`;

const waitForJobRecovery = `async function waitForJob(endpointId, key, jobId, label) {
  const started = Date.now();
  let body = await serverless(endpointId, "/status/" + encodeURIComponent(jobId), key);
  let status = upper(body?.status);
  let lastPrinted = 0;
  let cacheStartupObservedAt = null;
  let cacheLastControl = null;

  async function cacheControlSnapshot() {
    try {
      const response = await fetch(
        "https://api.runpod.io/v2/serverless/" + encodeURIComponent(endpointId) + "/workers",
        {
          headers: { Authorization: "Bearer " + key, Accept: "application/json" },
          signal: AbortSignal.timeout(15_000),
        },
      );
      const raw = await response.text();
      let payload = null;
      try { payload = raw ? JSON.parse(raw) : null; } catch { payload = null; }
      if (!response.ok) {
        return {
          available: false,
          http_status: response.status,
          workers: [],
          error: "RUNPOD_CODE_CACHE_CONTROL_HTTP_" + response.status,
        };
      }
      const workers = array(payload?.workers)
        .map((worker) => ({
          id: text(worker?.id) || null,
          status: upper(worker?.status) || null,
          image: text(worker?.image) || null,
          gpu_type_id: text(worker?.gpuTypeId) || null,
          data_center_id: text(worker?.dataCenterId) || null,
        }))
        .filter((worker) => !["EXITED", "STOPPED", "TERMINATED", "DELETED"].includes(worker.status));
      return { available: true, http_status: response.status, workers, error: null };
    } catch (error) {
      return {
        available: false,
        http_status: null,
        workers: [],
        error: text(error?.message || error).slice(0, 300),
      };
    }
  }

  while (!["COMPLETED", "FAILED", "TIMED_OUT", "CANCELLED", "CANCELED"].includes(status)) {
    const elapsed = Date.now() - started;
    const isCacheJob = label === "AVANTIQO_CODE_CAPACITY_CACHE";

    if (status === "IN_QUEUE" && isCacheJob) {
      cacheLastControl = await cacheControlSnapshot();
      if (cacheLastControl.available && cacheLastControl.workers.length > 0 && cacheStartupObservedAt === null) {
        cacheStartupObservedAt = Date.now();
      }

      if (cacheStartupObservedAt === null) {
        const noAcceptanceLimitMs = cacheLastControl.available ? 3 * 60 * 1000 : 8 * 60 * 1000;
        if (elapsed >= noAcceptanceLimitMs) {
          await serverless(endpointId, "/cancel/" + encodeURIComponent(jobId), key, { method: "POST" }).catch(() => null);
          throw new Error(
            label +
            "_NO_WORKER_ACCEPTANCE:" +
            jobId +
            ":" +
            Math.round(elapsed / 1000) +
            "s:control_available=" +
            cacheLastControl.available,
          );
        }
      } else if (Date.now() - cacheStartupObservedAt >= 12 * 60 * 1000) {
        await serverless(endpointId, "/cancel/" + encodeURIComponent(jobId), key, { method: "POST" }).catch(() => null);
        throw new Error(
          label +
          "_COLD_START_TIMEOUT:" +
          jobId +
          ":" +
          Math.round((Date.now() - cacheStartupObservedAt) / 1000) +
          "s_since_control_worker_observed",
        );
      }
    } else if (status === "IN_QUEUE" && elapsed >= QUEUE_TIMEOUT_MS) {
      await serverless(endpointId, "/cancel/" + encodeURIComponent(jobId), key, { method: "POST" }).catch(() => null);
      throw new Error(label + "_QUEUE_TIMEOUT:" + jobId + ":" + Math.round(elapsed / 1000) + "s");
    }

    if (elapsed >= JOB_TIMEOUT_MS) {
      await serverless(endpointId, "/cancel/" + encodeURIComponent(jobId), key, { method: "POST" }).catch(() => null);
      throw new Error(label + "_JOB_TIMEOUT:" + jobId + ":" + Math.round(elapsed / 1000) + "s");
    }

    if (Date.now() - lastPrinted >= 15_000) {
      const health = await serverless(endpointId, "/health", key).catch(() => null);
      console.log(JSON.stringify({
        event: label + "_PROGRESS",
        job_id: jobId,
        status,
        elapsed_seconds: Math.round(elapsed / 1000),
        health: health ? healthCounters(health) : null,
        cache_cold_start_policy: isCacheJob ? "CONTROL_AWARE" : null,
        cache_startup_observed: isCacheJob ? cacheStartupObservedAt !== null : null,
        cache_seconds_since_startup_observed:
          isCacheJob && cacheStartupObservedAt !== null
            ? Math.round((Date.now() - cacheStartupObservedAt) / 1000)
            : null,
        cache_control_plane: isCacheJob ? cacheLastControl : null,
      }));
      lastPrinted = Date.now();
    }

    await sleep(POLL_MS);
    body = await serverless(endpointId, "/status/" + encodeURIComponent(jobId), key);
    status = upper(body?.status);
  }

  if (status !== "COMPLETED") {
    throw new Error(label + "_" + status + ":" + text(body?.error || body?.output?.error || body?.message));
  }
  return body;
}`;

let patchedRelocation = replaceExactlyOnce(
  relocationSource,
  targetCreateAnchor,
  targetCreateRecovery,
  "CODE_TIMEOUT_RECOVERY_V4_TARGET_CREATE",
);
patchedRelocation = replaceExactlyOnce(
  patchedRelocation,
  waitForJobAnchor,
  waitForJobRecovery,
  "CODE_TIMEOUT_RECOVERY_V4_CACHE_WAIT",
);
if (
  patchedRelocation.includes(targetCreateAnchor) ||
  patchedRelocation.includes(waitForJobAnchor) ||
  !patchedRelocation.includes('event: "AVANTIQO_CODE_CAPACITY_RELOCATION_TARGET_VOLUME_CREATE_RECONCILED"') ||
  !patchedRelocation.includes('cache_cold_start_policy: isCacheJob ? "CONTROL_AWARE" : null')
) {
  throw new Error("CODE_TIMEOUT_RECOVERY_V4_PATCH_VERIFY_FAILED");
}

const tempRelocationName = `.avantiqo-code-capacity-timeout-recovery-v4-relocation-${process.pid}.mjs`;
const tempV2Name = `.avantiqo-code-capacity-timeout-recovery-v4-v2-${process.pid}.mjs`;
const tempV3Name = `.avantiqo-code-capacity-timeout-recovery-v4-v3-${process.pid}.mjs`;
const tempRelocationPath = resolve(scriptDir, tempRelocationName);
const tempV2Path = resolve(scriptDir, tempV2Name);
const tempV3Path = resolve(scriptDir, tempV3Name);

const patchedV2 = replaceExactlyOnce(
  v2Source,
  V2_SOURCE_ANCHOR,
  `const SOURCE_SCRIPT = "${tempRelocationName}";`,
  "CODE_TIMEOUT_RECOVERY_V4_V2_SOURCE",
);
const patchedV3 = replaceExactlyOnce(
  v3Source,
  V3_CHILD_ANCHOR,
  `const CHILD_SCRIPT = "scripts/${tempV2Name}";`,
  "CODE_TIMEOUT_RECOVERY_V4_V3_CHILD",
);

console.log(JSON.stringify({
  event: "AVANTIQO_CODE_CAPACITY_TIMEOUT_RECOVERY_V4_START",
  contract: CONTRACT,
  child_contract: "AVANTIQO_CODE_CAPACITY_TIMEOUT_RECOVERY_V3",
  ambiguous_network_volume_create_reconciliation: true,
  cache_queue_monitoring: {
    policy: "CONTROL_AWARE",
    no_worker_timeout_seconds: 180,
    degraded_control_timeout_seconds: 480,
    cold_start_timeout_after_worker_observed_seconds: 720,
    overall_job_timeout_seconds: 1200,
    generic_probe_and_inference_queue_timeout_unchanged: true,
  },
  reconciliation_contract: {
    canonical_name_required: true,
    exact_target_datacenter_required: true,
    exact_80gb_size_required: true,
    new_volume_id_required: true,
    exactly_one_candidate_required: true,
  },
  v3_orphan_cleanup_preserved: true,
  production_deploy_performed: false,
  secrets_printed: false,
}, null, 2));

try {
  writeFileSync(tempRelocationPath, patchedRelocation, { encoding: "utf8", flag: "wx" });
  writeFileSync(tempV2Path, patchedV2, { encoding: "utf8", flag: "wx" });
  writeFileSync(tempV3Path, patchedV3, { encoding: "utf8", flag: "wx" });

  const child = spawnSync(process.execPath, [tempV3Path, ...process.argv.slice(2)], {
    cwd: process.cwd(),
    env: process.env,
    stdio: "inherit",
  });

  if (child.error) throw child.error;
  if (child.signal) throw new Error(`CODE_TIMEOUT_RECOVERY_V4_CHILD_SIGNAL:${child.signal}`);
  if (child.status !== 0) {
    throw new Error(`CODE_TIMEOUT_RECOVERY_V4_CHILD_EXIT:${child.status ?? "UNKNOWN"}`);
  }

  console.log(JSON.stringify({
    event: "AVANTIQO_CODE_CAPACITY_TIMEOUT_RECOVERY_V4_COMPLETE",
    contract: CONTRACT,
    child_exit_code: 0,
    ambiguous_network_volume_create_reconciliation: true,
    cache_queue_monitoring: "CONTROL_AWARE",
    production_deploy_performed: false,
    secrets_printed: false,
  }));
} finally {
  for (const path of [tempV3Path, tempV2Path, tempRelocationPath]) {
    if (existsSync(path)) unlinkSync(path);
  }
}
