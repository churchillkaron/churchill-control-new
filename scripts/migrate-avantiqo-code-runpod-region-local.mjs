const REST = "https://rest.runpod.io/v1";
const GQL = "https://api.runpod.io/graphql";
const SERVERLESS = "https://api.runpod.ai/v2";

const CONTRACT = "AVANTIQO_CODE_REGION_MIGRATION_V1";
const CODE_ENDPOINT_NAME = "avantiqo-code-v1";
const ENGINE_CONTRACT = "AVANTIQO_CODE_ENGINE_V1";
const TARGET_MODEL = "Qwen/Qwen3-Coder-30B-A3B-Instruct-FP8";
const FOUNDATION_MODEL = "Qwen/Qwen3-Coder-30B-A3B-Instruct";
const TARGET_DATACENTER = "AP-JP-1";
const TARGET_VOLUME_NAME = "avantiqo-code-model-cache-ap-jp-1";
const TARGET_VOLUME_SIZE_GB = 80;
const STORAGE_USD_PER_GB_MONTH = 0.07;
const QUEUE_TIMEOUT_MS = 5 * 60 * 1000;
const JOB_TIMEOUT_MS = 45 * 60 * 1000;
const POLL_MS = 5000;

const TARGET_GPU_PREFERENCES = Object.freeze([
  Object.freeze({
    id: "NVIDIA H100 80GB HBM3",
    profile: "H100_SXM_80GB",
  }),
  Object.freeze({
    id: "NVIDIA H200",
    profile: "H200_SXM_141GB",
  }),
  Object.freeze({
    id: "NVIDIA B200",
    profile: "B200_180GB",
  }),
]);

function text(value) {
  return String(value ?? "").trim();
}

function yes(value) {
  return ["1", "true", "yes", "on", "approved"].includes(text(value).toLowerCase());
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sameArray(left, right) {
  const a = list(left).map(text);
  const b = list(right).map(text);
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function stockRank(value) {
  return ({ HIGH: 4, MEDIUM: 3, LOW: 2 }[text(value).toUpperCase()] || 0);
}

function endpointVolumeId(endpoint = {}) {
  return text(
    endpoint.networkVolumeId ||
      (Array.isArray(endpoint.networkVolumeIds) ? endpoint.networkVolumeIds[0] : null),
  );
}

function endpointDataCenters(endpoint = {}) {
  if (Array.isArray(endpoint.dataCenterIds)) return endpoint.dataCenterIds.map(text).filter(Boolean);
  if (text(endpoint.dataCenterIds)) {
    return text(endpoint.dataCenterIds).split(",").map((entry) => entry.trim()).filter(Boolean);
  }
  return [];
}

function endpointGpuTypes(endpoint = {}) {
  return list(endpoint.gpuTypeIds).map(text).filter(Boolean);
}

function safeEndpoint(endpoint = {}) {
  return {
    id: text(endpoint.id) || null,
    name: text(endpoint.name) || null,
    version: number(endpoint.version, null),
    template_id: text(endpoint.templateId || endpoint.template?.id) || null,
    network_volume_id: endpointVolumeId(endpoint) || null,
    data_center_ids: endpointDataCenters(endpoint),
    gpu_type_ids: endpointGpuTypes(endpoint),
    workers_min: number(endpoint.workersMin),
    workers_max: number(endpoint.workersMax),
    idle_timeout_seconds: number(endpoint.idleTimeout),
    scaler_type: text(endpoint.scalerType) || null,
    scaler_value: number(endpoint.scalerValue),
    execution_timeout_ms: number(endpoint.executionTimeoutMs || endpoint.executionTimeout),
    flashboot: endpoint.flashBoot ?? endpoint.flashboot ?? null,
  };
}

function safeVolume(volume = {}) {
  return {
    id: text(volume.id) || null,
    name: text(volume.name) || null,
    size_gb: number(volume.size || volume.sizeGb),
    data_center_id: text(volume.dataCenterId) || null,
  };
}

function healthCounters(health = {}) {
  const jobs = health.jobs || {};
  const workers = health.workers || {};
  return {
    jobs: {
      in_queue: number(jobs.inQueue ?? jobs.in_queue),
      in_progress: number(jobs.inProgress ?? jobs.in_progress),
      completed: number(jobs.completed),
      failed: number(jobs.failed),
      retried: number(jobs.retried),
    },
    workers: {
      idle: number(workers.idle),
      initializing: number(workers.initializing),
      ready: number(workers.ready),
      running: number(workers.running),
      throttled: number(workers.throttled),
      unhealthy: number(workers.unhealthy),
    },
  };
}

function assertNoLiveWork(health, label) {
  const counters = healthCounters(health);
  if (counters.jobs.in_queue > 0 || counters.jobs.in_progress > 0) {
    throw new Error(
      `${label}_LIVE_JOBS:in_queue=${counters.jobs.in_queue}:in_progress=${counters.jobs.in_progress}`,
    );
  }
  if (counters.workers.initializing > 0 || counters.workers.running > 0) {
    throw new Error(
      `${label}_ACTIVE_WORKER:initializing=${counters.workers.initializing}:running=${counters.workers.running}`,
    );
  }
  if (counters.workers.unhealthy > 0) {
    throw new Error(`${label}_UNHEALTHY_WORKER:${counters.workers.unhealthy}`);
  }
  return counters;
}

async function readBody(response) {
  const raw = await response.text();
  let body = null;
  try {
    body = raw ? JSON.parse(raw) : null;
  } catch {
    body = { message: raw };
  }
  return { raw, body };
}

async function rest(key, path, options = {}) {
  const response = await fetch(`${REST}${path}`, {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${key}`,
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: AbortSignal.timeout(options.timeoutMs || 30_000),
  });
  const { raw, body } = await readBody(response);
  if (!response.ok) {
    throw new Error(`RUNPOD_MANAGEMENT_HTTP_${response.status}:${text(body?.message || body?.error || raw).slice(0, 1000)}`);
  }
  return body;
}

async function serverless(apiKey, endpointId, path, options = {}) {
  const response = await fetch(`${SERVERLESS}/${encodeURIComponent(endpointId)}${path}`, {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: AbortSignal.timeout(options.timeoutMs || 30_000),
  });
  const { raw, body } = await readBody(response);
  if (!response.ok) {
    throw new Error(`RUNPOD_SERVERLESS_HTTP_${response.status}:${text(body?.message || body?.error || raw).slice(0, 1000)}`);
  }
  return body || {};
}

async function discoverTargetDatacenter(managementKey) {
  const query = `
    query AvantiqoCodeRegionMigration($input: GpuAvailabilityInput) {
      dataCenters {
        id
        name
        location
        storageSupport
        gpuAvailability(input: $input) {
          available
          stockStatus
          gpuTypeId
          gpuTypeDisplayName
          displayName
        }
      }
    }
  `;
  const response = await fetch(`${GQL}?api_key=${encodeURIComponent(managementKey)}`, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({
      query,
      variables: {
        input: {
          gpuCount: 1,
          minDisk: 5,
          minMemoryInGb: 80,
          secureCloud: true,
        },
      },
    }),
    signal: AbortSignal.timeout(30_000),
  });
  const { raw, body } = await readBody(response);
  if (!response.ok || body?.errors?.length) {
    throw new Error(`RUNPOD_GPU_AVAILABILITY_FAILED:${text(body?.errors?.map((entry) => entry?.message).filter(Boolean).join(" | ") || raw).slice(0, 1200)}`);
  }
  const datacenter = list(body?.data?.dataCenters).find((entry) => text(entry?.id) === TARGET_DATACENTER);
  if (!datacenter) throw new Error(`TARGET_DATACENTER_NOT_FOUND:${TARGET_DATACENTER}`);
  if (datacenter.storageSupport !== true) throw new Error(`TARGET_DATACENTER_STORAGE_UNSUPPORTED:${TARGET_DATACENTER}`);
  const available = list(datacenter.gpuAvailability)
    .filter((gpu) => gpu?.available === true && stockRank(gpu?.stockStatus) > 0)
    .map((gpu) => ({
      id: text(gpu.gpuTypeId),
      name: text(gpu.gpuTypeDisplayName || gpu.displayName || gpu.gpuTypeId),
      stock: text(gpu.stockStatus).toUpperCase(),
    }));
  const selectedPreference = TARGET_GPU_PREFERENCES.find((preference) =>
    available.some((gpu) => gpu.id === preference.id),
  );
  const selectedGpu = selectedPreference
    ? available.find((gpu) => gpu.id === selectedPreference.id)
    : null;
  return {
    id: TARGET_DATACENTER,
    name: text(datacenter.name) || null,
    location: text(datacenter.location) || null,
    available_approved_gpus: TARGET_GPU_PREFERENCES.map((preference) => {
      const match = available.find((gpu) => gpu.id === preference.id) || null;
      return {
        ...preference,
        available: Boolean(match),
        stock: match?.stock || null,
        name: match?.name || null,
      };
    }),
    selected_gpu: selectedGpu && selectedPreference
      ? { ...selectedGpu, profile: selectedPreference.profile }
      : null,
  };
}

async function waitForJob(apiKey, endpointId, jobId, label) {
  const started = Date.now();
  let body = await serverless(apiKey, endpointId, `/status/${encodeURIComponent(jobId)}`);
  let status = text(body.status).toUpperCase();
  let lastPrinted = 0;
  while (!["COMPLETED", "FAILED", "TIMED_OUT", "CANCELLED", "CANCELED"].includes(status)) {
    const elapsed = Date.now() - started;
    if (status === "IN_QUEUE" && elapsed >= QUEUE_TIMEOUT_MS) {
      await serverless(apiKey, endpointId, `/cancel/${encodeURIComponent(jobId)}`, { method: "POST" }).catch(() => null);
      throw new Error(`${label}_QUEUE_TIMEOUT:${jobId}:${Math.round(elapsed / 1000)}s`);
    }
    if (elapsed >= JOB_TIMEOUT_MS) {
      await serverless(apiKey, endpointId, `/cancel/${encodeURIComponent(jobId)}`, { method: "POST" }).catch(() => null);
      throw new Error(`${label}_JOB_TIMEOUT:${jobId}:${Math.round(elapsed / 1000)}s`);
    }
    if (Date.now() - lastPrinted >= 15_000) {
      const health = await serverless(apiKey, endpointId, "/health").catch(() => null);
      console.log(JSON.stringify({
        event: `${label}_PROGRESS`,
        job_id: jobId,
        status,
        elapsed_seconds: Math.round(elapsed / 1000),
        health: health ? healthCounters(health) : null,
      }));
      lastPrinted = Date.now();
    }
    await sleep(POLL_MS);
    body = await serverless(apiKey, endpointId, `/status/${encodeURIComponent(jobId)}`);
    status = text(body.status).toUpperCase();
  }
  if (status !== "COMPLETED") {
    throw new Error(`${label}_${status}:${text(body?.error || body?.output?.error || body?.message)}`);
  }
  return body;
}

async function submitCacheJob(apiKey, endpointId) {
  const submit = await serverless(apiKey, endpointId, "/run", {
    method: "POST",
    body: {
      input: {
        contract: ENGINE_CONTRACT,
        capability: "ai.code.debug",
        organization_id: "benchmark-only",
        organization_service_id: "benchmark-only",
        usage_id: `code-region-cache-${Date.now()}`,
        instruction: "Cache the source-locked Avantiqo Code FP8 runtime model only; do not perform inference.",
        structured_specification: {
          cache_runtime_model: true,
          target_model: TARGET_MODEL,
          purpose: "CODE_REGION_MIGRATION_CACHE_BOOTSTRAP",
        },
      },
    },
  });
  const jobId = text(submit.id);
  if (!jobId) throw new Error("CODE_REGION_CACHE_JOB_ID_REQUIRED");
  console.log(`AVANTIQO_CODE_REGION_CACHE_JOB=${jobId}`);
  const completed = await waitForJob(apiKey, endpointId, jobId, "AVANTIQO_CODE_REGION_CACHE");
  const output = completed.output || {};
  const passed =
    text(output.runtime_model) === TARGET_MODEL &&
    output.cache_ready === true &&
    output.inference_performed === false &&
    output.engine_loaded === false;
  if (!passed) {
    throw new Error(`CODE_REGION_CACHE_VERIFY_FAILED:${JSON.stringify({
      runtime_model: output.runtime_model || null,
      cache_ready: output.cache_ready ?? null,
      inference_performed: output.inference_performed ?? null,
      engine_loaded: output.engine_loaded ?? null,
    })}`);
  }
  return {
    job_id: jobId,
    delay_ms: number(completed.delayTime, null),
    execution_ms: number(completed.executionTime, null),
    output,
  };
}

async function submitProbeJob(apiKey, endpointId) {
  const submit = await serverless(apiKey, endpointId, "/run", {
    method: "POST",
    body: {
      input: {
        contract: ENGINE_CONTRACT,
        capability: "ai.code.debug",
        foundation_model: FOUNDATION_MODEL,
        organization_id: "benchmark-only",
        organization_service_id: "benchmark-only",
        usage_id: `code-region-probe-${Date.now()}`,
        instruction: "Report the deployed Avantiqo Code runtime metadata only.",
        structured_specification: {
          runtime_probe: true,
          purpose: "CODE_REGION_MIGRATION_RUNTIME_PROBE",
        },
      },
    },
  });
  const jobId = text(submit.id);
  if (!jobId) throw new Error("CODE_REGION_PROBE_JOB_ID_REQUIRED");
  console.log(`AVANTIQO_CODE_REGION_PROBE_JOB=${jobId}`);
  const completed = await waitForJob(apiKey, endpointId, jobId, "AVANTIQO_CODE_REGION_PROBE");
  const output = completed.output || {};
  const checks = {
    provider: text(output.provider) === "avantiqo-code",
    engine_contract: text(output.engine_contract) === ENGINE_CONTRACT,
    foundation_model: text(output.foundation_model) === FOUNDATION_MODEL,
    runtime_model: text(output.runtime_model) === TARGET_MODEL,
    serving_runtime: text(output.serving_runtime).toLowerCase() === "vllm",
    quantization: text(output.quantization).toLowerCase() === "fp8",
    cached_model_found: output.cached_model_found === true,
    raw_reasoning_boundary: output.raw_reasoning_persisted === false,
  };
  if (!Object.values(checks).every(Boolean)) {
    throw new Error(`CODE_REGION_PROBE_VERIFY_FAILED:${JSON.stringify(checks)}`);
  }
  return {
    job_id: jobId,
    delay_ms: number(completed.delayTime, null),
    execution_ms: number(completed.executionTime, null),
    checks,
    output,
  };
}

async function main() {
  const managementKey = text(process.env.RUNPOD_MANAGEMENT_API_KEY);
  const apiKey = text(process.env.RUNPOD_API_KEY);
  const endpointId = text(process.env.RUNPOD_AVANTIQO_CODE_ENDPOINT_ID);
  const apply = yes(process.env.AVANTIQO_CODE_REGION_MIGRATION_APPLY);
  const migrationApproved = yes(process.env.AVANTIQO_CODE_REGION_MIGRATION_APPROVED);
  const storageSpendApproved = yes(process.env.AVANTIQO_CODE_STORAGE_SPEND_APPROVED);
  const providerSpendApproved = yes(process.env.AVANTIQO_CODE_PROVIDER_SPEND_APPROVED);

  if (!managementKey) throw new Error("RUNPOD_MANAGEMENT_API_KEY_REQUIRED");
  if (!apiKey) throw new Error("RUNPOD_API_KEY_REQUIRED");
  if (!endpointId) throw new Error("RUNPOD_AVANTIQO_CODE_ENDPOINT_ID_REQUIRED");
  if (apply && !migrationApproved) throw new Error("AVANTIQO_CODE_REGION_MIGRATION_APPROVED=YES_REQUIRED");
  if (apply && !storageSpendApproved) throw new Error("AVANTIQO_CODE_STORAGE_SPEND_APPROVED=YES_REQUIRED");
  if (apply && !providerSpendApproved) throw new Error("AVANTIQO_CODE_PROVIDER_SPEND_APPROVED=YES_REQUIRED");

  const [endpoint, volumes, health, target] = await Promise.all([
    rest(managementKey, `/endpoints/${encodeURIComponent(endpointId)}?includeTemplate=true&includeWorkers=true`),
    rest(managementKey, "/networkvolumes"),
    serverless(apiKey, endpointId, "/health"),
    discoverTargetDatacenter(managementKey),
  ]);

  if (text(endpoint.id) !== endpointId) throw new Error("CODE_ENDPOINT_ID_MISMATCH");
  if (text(endpoint.name) !== CODE_ENDPOINT_NAME) {
    throw new Error(`CODE_ENDPOINT_NAME_MISMATCH:${text(endpoint.name) || "MISSING"}`);
  }
  if (!Array.isArray(volumes)) throw new Error("RUNPOD_NETWORK_VOLUME_LIST_INVALID");

  const before = safeEndpoint(endpoint);
  const oldVolumeId = before.network_volume_id;
  if (!oldVolumeId) throw new Error("CODE_CURRENT_NETWORK_VOLUME_REQUIRED");
  const oldVolume = volumes.find((volume) => text(volume.id) === oldVolumeId) || null;
  if (!oldVolume) throw new Error(`CODE_CURRENT_NETWORK_VOLUME_NOT_FOUND:${oldVolumeId}`);
  const selectedGpu = target.selected_gpu;
  const existingTargetVolumes = volumes.filter((volume) => text(volume.name) === TARGET_VOLUME_NAME);
  if (existingTargetVolumes.length > 1) {
    throw new Error(`CODE_REGION_TARGET_VOLUME_AMBIGUOUS:${existingTargetVolumes.length}`);
  }
  const reusableTargetVolume = existingTargetVolumes[0] || null;
  if (reusableTargetVolume) {
    if (text(reusableTargetVolume.dataCenterId) !== TARGET_DATACENTER) {
      throw new Error("CODE_REGION_TARGET_VOLUME_DATACENTER_MISMATCH");
    }
    if (number(reusableTargetVolume.size || reusableTargetVolume.sizeGb) < TARGET_VOLUME_SIZE_GB) {
      throw new Error("CODE_REGION_TARGET_VOLUME_TOO_SMALL");
    }
  }

  const monthlyStorageUsd = Number((TARGET_VOLUME_SIZE_GB * STORAGE_USD_PER_GB_MONTH).toFixed(2));
  const plan = {
    success: Boolean(selectedGpu),
    contract: CONTRACT,
    mode: apply ? "APPLY" : "PLAN",
    mutation_performed: false,
    provider_jobs_submitted: false,
    generation_performed: false,
    inference_performed: false,
    production_deploy_performed: false,
    endpoint_before: before,
    current_volume: safeVolume(oldVolume),
    target: {
      data_center_id: TARGET_DATACENTER,
      location: target.location,
      selected_gpu: selectedGpu,
      approved_gpu_availability: target.available_approved_gpus,
      volume_name: TARGET_VOLUME_NAME,
      volume_size_gb: TARGET_VOLUME_SIZE_GB,
      estimated_monthly_storage_usd: monthlyStorageUsd,
      reusable_target_volume: reusableTargetVolume ? safeVolume(reusableTargetVolume) : null,
    },
    health_before: healthCounters(health),
    safety: {
      minimum_gpu_memory_gb: 80,
      nvidia_only: true,
      amd_allowed: false,
      sub_80gb_gpu_allowed: false,
      old_volume_delete_in_this_script: false,
      rollback_endpoint_on_cache_or_probe_failure: true,
      first_inference_in_this_script: false,
    },
  };

  if (!selectedGpu) {
    console.log(JSON.stringify({
      ...plan,
      success: false,
      blocked_reason: "NO_APPROVED_H100_H200_B200_STOCK_IN_AP_JP_1",
    }, null, 2));
    process.exitCode = 2;
    return;
  }

  if (!apply) {
    console.log(JSON.stringify(plan, null, 2));
    return;
  }

  assertNoLiveWork(health, "CODE_REGION_MIGRATION_BLOCKED");

  const [freshEndpoint, freshHealth, freshTarget, freshVolumes] = await Promise.all([
    rest(managementKey, `/endpoints/${encodeURIComponent(endpointId)}?includeTemplate=true&includeWorkers=true`),
    serverless(apiKey, endpointId, "/health"),
    discoverTargetDatacenter(managementKey),
    rest(managementKey, "/networkvolumes"),
  ]);
  const fresh = safeEndpoint(freshEndpoint);
  assertNoLiveWork(freshHealth, "CODE_REGION_MIGRATION_BLOCKED_BEFORE_WRITE");
  if (fresh.network_volume_id !== before.network_volume_id) throw new Error("CODE_REGION_MIGRATION_STALE_VOLUME");
  if (fresh.template_id !== before.template_id) throw new Error("CODE_REGION_MIGRATION_STALE_TEMPLATE");
  if (!sameArray(fresh.gpu_type_ids, before.gpu_type_ids)) throw new Error("CODE_REGION_MIGRATION_STALE_GPU_BINDING");
  if (fresh.workers_min !== before.workers_min || fresh.workers_max !== before.workers_max) {
    throw new Error("CODE_REGION_MIGRATION_STALE_WORKER_LIMITS");
  }
  if (fresh.scaler_type !== before.scaler_type || fresh.scaler_value !== before.scaler_value || fresh.idle_timeout_seconds !== before.idle_timeout_seconds) {
    throw new Error("CODE_REGION_MIGRATION_STALE_SCALER");
  }
  if (!freshTarget.selected_gpu) throw new Error("CODE_REGION_MIGRATION_TARGET_STOCK_DISAPPEARED");

  let targetVolume = list(freshVolumes).find((volume) => text(volume.name) === TARGET_VOLUME_NAME) || null;
  let volumeAction = "REUSED";
  if (!targetVolume) {
    targetVolume = await rest(managementKey, "/networkvolumes", {
      method: "POST",
      body: {
        dataCenterId: TARGET_DATACENTER,
        name: TARGET_VOLUME_NAME,
        size: TARGET_VOLUME_SIZE_GB,
      },
    });
    volumeAction = "CREATED";
  }
  const targetVolumeId = text(targetVolume?.id);
  if (!targetVolumeId) throw new Error("CODE_REGION_TARGET_VOLUME_ID_REQUIRED");

  let switched = false;
  try {
    await rest(managementKey, `/endpoints/${encodeURIComponent(endpointId)}`, {
      method: "PATCH",
      body: {
        networkVolumeId: targetVolumeId,
        dataCenterIds: [TARGET_DATACENTER],
        gpuTypeIds: [freshTarget.selected_gpu.id],
      },
    });
    switched = true;

    const verifiedEndpoint = await rest(
      managementKey,
      `/endpoints/${encodeURIComponent(endpointId)}?includeTemplate=true&includeWorkers=true`,
    );
    const after = safeEndpoint(verifiedEndpoint);
    if (after.network_volume_id !== targetVolumeId) throw new Error("CODE_REGION_ENDPOINT_VOLUME_VERIFY_FAILED");
    if (!sameArray(after.data_center_ids, [TARGET_DATACENTER])) throw new Error("CODE_REGION_ENDPOINT_DATACENTER_VERIFY_FAILED");
    if (!sameArray(after.gpu_type_ids, [freshTarget.selected_gpu.id])) throw new Error("CODE_REGION_ENDPOINT_GPU_VERIFY_FAILED");
    if (after.template_id !== before.template_id) throw new Error("CODE_REGION_ENDPOINT_TEMPLATE_CHANGED");
    if (after.workers_min !== before.workers_min || after.workers_max !== before.workers_max) {
      throw new Error("CODE_REGION_ENDPOINT_WORKER_LIMITS_CHANGED");
    }
    if (after.scaler_type !== before.scaler_type || after.scaler_value !== before.scaler_value || after.idle_timeout_seconds !== before.idle_timeout_seconds) {
      throw new Error("CODE_REGION_ENDPOINT_SCALER_CHANGED");
    }
    if (after.flashboot !== before.flashboot) throw new Error("CODE_REGION_ENDPOINT_FLASHBOOT_CHANGED");

    const cache = await submitCacheJob(apiKey, endpointId);
    const probe = await submitProbeJob(apiKey, endpointId);

    console.log(JSON.stringify({
      ...plan,
      success: true,
      mode: "APPLY",
      mutation_performed: true,
      provider_jobs_submitted: true,
      generation_performed: false,
      inference_performed: false,
      selected_gpu: freshTarget.selected_gpu,
      target_volume: safeVolume(targetVolume),
      volume_action: volumeAction,
      endpoint_after: after,
      cache: {
        job_id: cache.job_id,
        delay_ms: cache.delay_ms,
        execution_ms: cache.execution_ms,
        verified: true,
      },
      runtime_probe: {
        job_id: probe.job_id,
        delay_ms: probe.delay_ms,
        execution_ms: probe.execution_ms,
        checks: probe.checks,
        verified: true,
      },
      old_volume_retained_for_rollback: safeVolume(oldVolume),
      cleanup_allowed_after_first_inference_passes: true,
      next_action: "RUN_ONE_REAL_CODE_INFERENCE_IMMEDIATELY_THEN_DELETE_OLD_EU_RO_1_CODE_VOLUME",
    }, null, 2));
  } catch (error) {
    if (switched) {
      try {
        await rest(managementKey, `/endpoints/${encodeURIComponent(endpointId)}`, {
          method: "PATCH",
          body: {
            networkVolumeId: before.network_volume_id,
            dataCenterIds: before.data_center_ids,
            gpuTypeIds: before.gpu_type_ids,
          },
        });
        console.error("AVANTIQO_CODE_REGION_MIGRATION_ENDPOINT_ROLLBACK=VERIFIED_REQUESTED");
      } catch (rollbackError) {
        console.error(`AVANTIQO_CODE_REGION_MIGRATION_ENDPOINT_ROLLBACK_FAILED=${text(rollbackError?.message || rollbackError)}`);
      }
    }
    throw error;
  }
}

main().catch((error) => {
  console.error(JSON.stringify({
    success: false,
    contract: CONTRACT,
    error: text(error?.message || error),
    production_deploy_performed: false,
  }, null, 2));
  process.exit(1);
});
