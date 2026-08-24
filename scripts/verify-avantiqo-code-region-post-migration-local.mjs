const REST = "https://rest.runpod.io/v1";
const SERVERLESS = "https://api.runpod.ai/v2";

const CONTRACT = "AVANTIQO_CODE_REGION_POST_MIGRATION_V1";
const ENGINE_CONTRACT = "AVANTIQO_CODE_ENGINE_V1";
const CODE_ENDPOINT_NAME = "avantiqo-code-v1";
const FOUNDATION_MODEL = "Qwen/Qwen3-Coder-30B-A3B-Instruct";
const RUNTIME_MODEL = "Qwen/Qwen3-Coder-30B-A3B-Instruct-FP8";
const TARGET_DATACENTER = "AP-JP-1";
const TARGET_VOLUME_NAME = "avantiqo-code-model-cache-ap-jp-1";
const OLD_DATACENTER = "EU-RO-1";
const OLD_VOLUME_NAME = "avantiqo-code-model-cache";
const TARGET_GPU_IDS = Object.freeze([
  "NVIDIA H100 80GB HBM3",
  "NVIDIA H200",
  "NVIDIA B200",
]);
const JOB_TIMEOUT_MS = 20 * 60 * 1000;
const QUEUE_TIMEOUT_MS = 10 * 60 * 1000;
const QUIESCENCE_TIMEOUT_MS = 5 * 60 * 1000;
const POLL_MS = 5000;

function text(value) {
  return String(value ?? "").trim();
}

function yes(value) {
  return ["1", "true", "yes", "on", "approved"].includes(text(value).toLowerCase());
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function sameArray(left, right) {
  const a = list(left).map(text);
  const b = list(right).map(text);
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
    network_volume_id: endpointVolumeId(endpoint) || null,
    data_center_ids: endpointDataCenters(endpoint),
    gpu_type_ids: endpointGpuTypes(endpoint),
    template_id: text(endpoint.templateId || endpoint.template?.id) || null,
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
    throw new Error(
      `RUNPOD_MANAGEMENT_HTTP_${response.status}:${text(body?.message || body?.error || raw).slice(0, 1200)}`,
    );
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
    throw new Error(
      `RUNPOD_SERVERLESS_HTTP_${response.status}:${text(body?.message || body?.error || raw).slice(0, 1200)}`,
    );
  }
  return body || {};
}

async function resolveEndpoint(managementKey, configuredEndpointId) {
  if (configuredEndpointId) {
    const endpoint = await rest(
      managementKey,
      `/endpoints/${encodeURIComponent(configuredEndpointId)}?includeTemplate=true&includeWorkers=true`,
    );
    if (text(endpoint?.name) !== CODE_ENDPOINT_NAME) {
      throw new Error(`CODE_ENDPOINT_NAME_MISMATCH:${text(endpoint?.name) || "MISSING"}`);
    }
    return endpoint;
  }

  const endpoints = await rest(managementKey, "/endpoints?includeTemplate=true&includeWorkers=true");
  const matches = list(endpoints).filter((endpoint) => text(endpoint?.name) === CODE_ENDPOINT_NAME);
  if (matches.length !== 1) {
    throw new Error(`CODE_ENDPOINT_NAME_RESOLUTION_FAILED:${matches.length}`);
  }
  return matches[0];
}

function resolveVolumes(volumes) {
  const targetMatches = list(volumes).filter((volume) => text(volume?.name) === TARGET_VOLUME_NAME);
  const oldMatches = list(volumes).filter((volume) => text(volume?.name) === OLD_VOLUME_NAME);
  if (targetMatches.length !== 1) {
    throw new Error(`CODE_TARGET_VOLUME_RESOLUTION_FAILED:${targetMatches.length}`);
  }
  if (oldMatches.length > 1) {
    throw new Error(`CODE_OLD_VOLUME_AMBIGUOUS:${oldMatches.length}`);
  }
  const target = safeVolume(targetMatches[0]);
  const old = oldMatches.length ? safeVolume(oldMatches[0]) : null;
  if (target.data_center_id !== TARGET_DATACENTER) {
    throw new Error(`CODE_TARGET_VOLUME_DATACENTER_MISMATCH:${target.data_center_id}`);
  }
  if (old && old.data_center_id !== OLD_DATACENTER) {
    throw new Error(`CODE_OLD_VOLUME_DATACENTER_MISMATCH:${old.data_center_id}`);
  }
  return { target, old };
}

function assertJapanBinding(endpoint, targetVolume) {
  const safe = safeEndpoint(endpoint);
  if (safe.network_volume_id !== targetVolume.id) {
    throw new Error(`CODE_JAPAN_BINDING_VOLUME_MISMATCH:${safe.network_volume_id}`);
  }
  if (!sameArray(safe.gpu_type_ids, TARGET_GPU_IDS)) {
    throw new Error(`CODE_JAPAN_BINDING_GPU_MISMATCH:${JSON.stringify(safe.gpu_type_ids)}`);
  }
  if (safe.data_center_ids.length && !safe.data_center_ids.includes(TARGET_DATACENTER)) {
    throw new Error(`CODE_JAPAN_BINDING_DATACENTER_MISMATCH:${JSON.stringify(safe.data_center_ids)}`);
  }
  return safe;
}

function assertNoLiveJobs(health, label) {
  const counters = healthCounters(health);
  if (counters.jobs.in_queue > 0 || counters.jobs.in_progress > 0) {
    throw new Error(
      `${label}_LIVE_JOBS:in_queue=${counters.jobs.in_queue}:in_progress=${counters.jobs.in_progress}`,
    );
  }
  if (counters.workers.unhealthy > 0) {
    throw new Error(`${label}_UNHEALTHY_WORKER:${counters.workers.unhealthy}`);
  }
  return counters;
}

async function submitFirstInference(apiKey, endpointId) {
  const submit = await serverless(apiKey, endpointId, "/run", {
    method: "POST",
    body: {
      input: {
        contract: ENGINE_CONTRACT,
        capability: "ai.code.debug",
        foundation_model: FOUNDATION_MODEL,
        organization_id: "benchmark-only",
        organization_service_id: "benchmark-only",
        usage_id: `code-region-first-inference-${Date.now()}`,
        instruction: "Return only the corrected one-line JavaScript expression. Fix this so numeric string totals add numerically instead of concatenating: const total = rows.reduce((sum, row) => sum + row.total, 0); The corrected expression must use Number(row.total).",
        structured_specification: {
          benchmark_contract: CONTRACT,
          benchmark_case: "first_japan_real_inference",
          response_style: "bounded",
        },
      },
    },
  });
  const jobId = text(submit.id);
  if (!jobId) throw new Error("CODE_FIRST_INFERENCE_JOB_ID_REQUIRED");
  console.log(`AVANTIQO_CODE_FIRST_JAPAN_INFERENCE_JOB=${jobId}`);

  const started = Date.now();
  let body = submit;
  let status = text(body.status).toUpperCase();
  let lastPrinted = 0;

  while (!["COMPLETED", "FAILED", "TIMED_OUT", "CANCELLED", "CANCELED"].includes(status)) {
    const elapsed = Date.now() - started;
    if (status === "IN_QUEUE" && elapsed >= QUEUE_TIMEOUT_MS) {
      await serverless(apiKey, endpointId, `/cancel/${encodeURIComponent(jobId)}`, { method: "POST" }).catch(() => null);
      throw new Error(`CODE_FIRST_INFERENCE_QUEUE_TIMEOUT:${jobId}`);
    }
    if (elapsed >= JOB_TIMEOUT_MS) {
      await serverless(apiKey, endpointId, `/cancel/${encodeURIComponent(jobId)}`, { method: "POST" }).catch(() => null);
      throw new Error(`CODE_FIRST_INFERENCE_JOB_TIMEOUT:${jobId}`);
    }
    if (Date.now() - lastPrinted >= 15_000) {
      const health = await serverless(apiKey, endpointId, "/health").catch(() => null);
      console.log(JSON.stringify({
        event: "AVANTIQO_CODE_FIRST_JAPAN_INFERENCE_PROGRESS",
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
    throw new Error(`CODE_FIRST_INFERENCE_${status}:${text(body?.error || body?.output?.error || body?.message)}`);
  }

  const output = body.output || {};
  const result = text(output.result);
  const checks = {
    provider: text(output.provider) === "avantiqo-code",
    engine_contract: text(output.engine_contract) === ENGINE_CONTRACT,
    capability: text(output.capability) === "ai.code.debug",
    foundation_model: text(output.foundation_model) === FOUNDATION_MODEL,
    runtime_model: text(output.runtime_model) === RUNTIME_MODEL,
    serving_runtime: text(output.serving_runtime).toLowerCase() === "vllm",
    quantization: text(output.quantization).toLowerCase() === "fp8",
    raw_reasoning_boundary: output.raw_reasoning_persisted === false,
    semantic_result: result.includes("Number(row.total)") && result.includes("reduce"),
    nonempty_result: result.length > 10,
  };
  if (!Object.values(checks).every(Boolean)) {
    throw new Error(`CODE_FIRST_INFERENCE_VERIFY_FAILED:${JSON.stringify(checks)}`);
  }

  return {
    job_id: jobId,
    delay_ms: Number(body.delayTime) || null,
    execution_ms: Number(body.executionTime) || null,
    checks,
  };
}

async function waitForPostInferenceQuiescence(apiKey, endpointId) {
  const started = Date.now();
  let lastPrinted = 0;
  while (true) {
    const health = await serverless(apiKey, endpointId, "/health");
    const counters = healthCounters(health);
    if (counters.workers.unhealthy > 0) {
      throw new Error(`CODE_POST_INFERENCE_UNHEALTHY_WORKER:${counters.workers.unhealthy}`);
    }
    const active =
      counters.jobs.in_queue +
      counters.jobs.in_progress +
      counters.workers.initializing +
      counters.workers.running;
    if (active === 0) return counters;
    const elapsed = Date.now() - started;
    if (elapsed >= QUIESCENCE_TIMEOUT_MS) {
      throw new Error(`CODE_POST_INFERENCE_QUIESCENCE_TIMEOUT:${Math.round(elapsed / 1000)}s`);
    }
    if (Date.now() - lastPrinted >= 15_000) {
      console.log(JSON.stringify({
        event: "AVANTIQO_CODE_POST_INFERENCE_QUIESCENCE_WAIT",
        elapsed_seconds: Math.round(elapsed / 1000),
        health: counters,
      }));
      lastPrinted = Date.now();
    }
    await sleep(POLL_MS);
  }
}

async function deleteOldVolume(managementKey, endpointId, targetVolume, oldVolume) {
  if (!oldVolume) {
    return { action: "ALREADY_ABSENT", old_volume: null };
  }
  if (oldVolume.id === targetVolume.id) {
    throw new Error("CODE_OLD_VOLUME_EQUALS_TARGET_VOLUME");
  }

  const [endpoint, endpoints, volumes] = await Promise.all([
    rest(managementKey, `/endpoints/${encodeURIComponent(endpointId)}?includeTemplate=true&includeWorkers=true`),
    rest(managementKey, "/endpoints?includeTemplate=true&includeWorkers=true"),
    rest(managementKey, "/networkvolumes"),
  ]);
  assertJapanBinding(endpoint, targetVolume);

  const currentOld = list(volumes).find((volume) => text(volume?.id) === oldVolume.id) || null;
  if (!currentOld) return { action: "ALREADY_ABSENT", old_volume: oldVolume };
  const currentOldSafe = safeVolume(currentOld);
  if (currentOldSafe.name !== OLD_VOLUME_NAME || currentOldSafe.data_center_id !== OLD_DATACENTER) {
    throw new Error(`CODE_OLD_VOLUME_IDENTITY_CHANGED:${JSON.stringify(currentOldSafe)}`);
  }

  const attached = list(endpoints)
    .filter((candidate) => endpointVolumeId(candidate) === oldVolume.id)
    .map((candidate) => ({ id: text(candidate?.id), name: text(candidate?.name) }));
  if (attached.length) {
    throw new Error(`CODE_OLD_VOLUME_STILL_ATTACHED:${JSON.stringify(attached)}`);
  }

  await rest(managementKey, `/networkvolumes/${encodeURIComponent(oldVolume.id)}`, {
    method: "DELETE",
  });

  const afterVolumes = await rest(managementKey, "/networkvolumes");
  if (list(afterVolumes).some((volume) => text(volume?.id) === oldVolume.id)) {
    throw new Error("CODE_OLD_VOLUME_DELETE_VERIFY_FAILED");
  }
  const finalEndpoint = await rest(
    managementKey,
    `/endpoints/${encodeURIComponent(endpointId)}?includeTemplate=true&includeWorkers=true`,
  );
  assertJapanBinding(finalEndpoint, targetVolume);

  return {
    action: "DELETED_AND_VERIFIED",
    old_volume: oldVolume,
  };
}

async function main() {
  const managementKey = text(process.env.RUNPOD_MANAGEMENT_API_KEY);
  const apiKey = text(process.env.RUNPOD_API_KEY);
  const configuredEndpointId = text(process.env.RUNPOD_AVANTIQO_CODE_ENDPOINT_ID);
  const apply = yes(process.env.AVANTIQO_CODE_POST_MIGRATION_APPLY);
  const approved = yes(process.env.AVANTIQO_CODE_POST_MIGRATION_APPROVED);
  const providerSpendApproved = yes(process.env.AVANTIQO_CODE_PROVIDER_SPEND_APPROVED);
  const oldVolumeDeleteApproved = yes(process.env.AVANTIQO_CODE_OLD_VOLUME_DELETE_APPROVED);

  if (!managementKey) throw new Error("RUNPOD_MANAGEMENT_API_KEY_REQUIRED");
  if (!apiKey) throw new Error("RUNPOD_API_KEY_REQUIRED");
  if (apply && !approved) throw new Error("AVANTIQO_CODE_POST_MIGRATION_APPROVED=YES_REQUIRED");
  if (apply && !providerSpendApproved) throw new Error("AVANTIQO_CODE_PROVIDER_SPEND_APPROVED=YES_REQUIRED");
  if (apply && !oldVolumeDeleteApproved) throw new Error("AVANTIQO_CODE_OLD_VOLUME_DELETE_APPROVED=YES_REQUIRED");

  const endpoint = await resolveEndpoint(managementKey, configuredEndpointId);
  const endpointId = text(endpoint?.id);
  if (!endpointId) throw new Error("CODE_ENDPOINT_ID_REQUIRED");
  const [volumes, health] = await Promise.all([
    rest(managementKey, "/networkvolumes"),
    serverless(apiKey, endpointId, "/health"),
  ]);
  const { target, old } = resolveVolumes(volumes);
  const binding = assertJapanBinding(endpoint, target);
  const healthBefore = assertNoLiveJobs(health, "CODE_POST_MIGRATION_BLOCKED");

  const plan = {
    success: true,
    contract: CONTRACT,
    mode: apply ? "APPLY" : "PLAN",
    mutation_performed: false,
    provider_job_submitted: false,
    production_deploy_performed: false,
    endpoint: binding,
    target_volume: target,
    old_volume: old,
    health_before: healthBefore,
    inference: {
      required: true,
      capability: "ai.code.debug",
      runtime_model: RUNTIME_MODEL,
      serving_runtime: "vllm",
      quantization: "fp8",
      generation_count: 1,
    },
    cleanup: {
      old_volume_delete_required_if_present: true,
      old_volume_must_be_unattached: true,
      japan_binding_reverified_before_and_after_delete: true,
    },
  };

  if (!apply) {
    console.log(JSON.stringify(plan, null, 2));
    return;
  }

  const inference = await submitFirstInference(apiKey, endpointId);
  const healthAfterInference = await waitForPostInferenceQuiescence(apiKey, endpointId);

  const [freshEndpoint, freshVolumes] = await Promise.all([
    rest(managementKey, `/endpoints/${encodeURIComponent(endpointId)}?includeTemplate=true&includeWorkers=true`),
    rest(managementKey, "/networkvolumes"),
  ]);
  const freshResolved = resolveVolumes(freshVolumes);
  assertJapanBinding(freshEndpoint, freshResolved.target);
  if (freshResolved.target.id !== target.id) {
    throw new Error("CODE_TARGET_VOLUME_CHANGED_AFTER_INFERENCE");
  }
  if (old && freshResolved.old && freshResolved.old.id !== old.id) {
    throw new Error("CODE_OLD_VOLUME_CHANGED_AFTER_INFERENCE");
  }

  const cleanup = await deleteOldVolume(
    managementKey,
    endpointId,
    freshResolved.target,
    freshResolved.old,
  );

  console.log(JSON.stringify({
    ...plan,
    success: true,
    mode: "APPLY",
    mutation_performed: cleanup.action === "DELETED_AND_VERIFIED",
    provider_job_submitted: true,
    first_real_japan_inference: { ...inference, verified: true },
    health_after_inference: healthAfterInference,
    cleanup,
    old_eu_volume_retained: cleanup.action !== "DELETED_AND_VERIFIED" && cleanup.action !== "ALREADY_ABSENT",
    production_deploy_performed: false,
    next_action: "RUN_FULL_CODE_CERTIFICATION_BENCHMARK_AND_ECONOMICS",
  }, null, 2));
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
