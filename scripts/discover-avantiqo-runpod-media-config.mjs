const RUNPOD_ENDPOINTS_URL = "https://rest.runpod.io/v1/endpoints?includeTemplate=true&includeWorkers=true";

function text(value) {
  return String(value ?? "").trim();
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function required(name) {
  const value = text(process.env[name]);
  if (!value) throw new Error(`AVANTIQO_RUNPOD_DISCOVERY_ENV_REQUIRED:${name}`);
  return value;
}

function redactEnvKeys(value) {
  return Object.keys(object(value)).sort();
}

function candidateScore(endpoint, family) {
  const haystack = [
    endpoint.name,
    endpoint.template?.name,
    endpoint.template?.imageName,
    ...redactEnvKeys(endpoint.env),
    ...redactEnvKeys(endpoint.template?.env),
  ]
    .map((value) => text(value).toLowerCase())
    .join(" ");

  const terms = family === "image"
    ? ["avantiqo", "image", "flux", "qwen", "swin", "sdxl"]
    : ["avantiqo", "lipsync", "lip-sync", "latent", "sync", "whisper", "insightface"];

  return terms.reduce((score, term) => score + (haystack.includes(term) ? 1 : 0), 0);
}

function sanitizeWorker(worker = {}) {
  return {
    id: text(worker.id) || null,
    status: text(worker.desiredStatus || worker.lastStatusChange || worker.name) || null,
    cost_per_hour: Number.isFinite(Number(worker.costPerHr)) ? Number(worker.costPerHr) : null,
    adjusted_cost_per_hour: Number.isFinite(Number(worker.adjustedCostPerHr))
      ? Number(worker.adjustedCostPerHr)
      : null,
    gpu_display_name: text(worker.gpu?.displayName || worker.machine?.gpuDisplayName) || null,
    gpu_type_id: text(worker.machine?.gpuTypeId) || null,
  };
}

function sanitizeEndpoint(endpoint = {}) {
  return {
    id: text(endpoint.id) || null,
    name: text(endpoint.name) || null,
    compute_type: text(endpoint.computeType) || null,
    gpu_count: Number.isFinite(Number(endpoint.gpuCount)) ? Number(endpoint.gpuCount) : null,
    gpu_type_ids: list(endpoint.gpuTypeIds).map(text).filter(Boolean),
    workers_min: Number.isFinite(Number(endpoint.workersMin)) ? Number(endpoint.workersMin) : null,
    workers_max: Number.isFinite(Number(endpoint.workersMax)) ? Number(endpoint.workersMax) : null,
    idle_timeout_seconds: Number.isFinite(Number(endpoint.idleTimeout)) ? Number(endpoint.idleTimeout) : null,
    template_id: text(endpoint.templateId) || null,
    template_name: text(endpoint.template?.name) || null,
    template_image_name: text(endpoint.template?.imageName) || null,
    endpoint_env_keys: redactEnvKeys(endpoint.env),
    template_env_keys: redactEnvKeys(endpoint.template?.env),
    workers: list(endpoint.workers).map(sanitizeWorker),
  };
}

async function main() {
  const apiKey = required("RUNPOD_API_KEY");
  const configuredVideoId = text(process.env.RUNPOD_AVANTIQO_VIDEO_ENDPOINT_ID);
  const configuredImageId = text(process.env.RUNPOD_AVANTIQO_IMAGE_ENDPOINT_ID);
  const configuredLipsyncId = text(process.env.RUNPOD_AVANTIQO_LIPSYNC_ENDPOINT_ID);

  const response = await fetch(RUNPOD_ENDPOINTS_URL, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(20000),
  });

  const raw = await response.text();
  let body = null;
  try {
    body = raw ? JSON.parse(raw) : null;
  } catch {
    body = null;
  }

  if (!response.ok || !Array.isArray(body)) {
    throw new Error(
      `AVANTIQO_RUNPOD_DISCOVERY_FAILED:${response.status}:${text(body?.error || body?.message || raw).slice(0, 500)}`,
    );
  }

  const endpoints = body.map((endpoint) => ({
    ...sanitizeEndpoint(endpoint),
    configured_as: [
      configuredImageId && endpoint.id === configuredImageId ? "image" : null,
      configuredVideoId && endpoint.id === configuredVideoId ? "cinema" : null,
      configuredLipsyncId && endpoint.id === configuredLipsyncId ? "lipsync" : null,
    ].filter(Boolean),
    image_candidate_score: candidateScore(endpoint, "image"),
    lipsync_candidate_score: candidateScore(endpoint, "lipsync"),
  }));

  const imageCandidates = endpoints
    .filter((endpoint) => endpoint.image_candidate_score > 0)
    .sort((a, b) => b.image_candidate_score - a.image_candidate_score);
  const lipsyncCandidates = endpoints
    .filter((endpoint) => endpoint.lipsync_candidate_score > 0)
    .sort((a, b) => b.lipsync_candidate_score - a.lipsync_candidate_score);

  const report = {
    contract: "AVANTIQO_RUNPOD_MEDIA_CONFIG_DISCOVERY_V1",
    generated_at: new Date().toISOString(),
    request: {
      method: "GET",
      endpoint: "https://rest.runpod.io/v1/endpoints",
      include_template: true,
      include_workers: true,
    },
    configured: {
      image_endpoint_id_present: Boolean(configuredImageId),
      cinema_endpoint_id_present: Boolean(configuredVideoId),
      lipsync_endpoint_id_present: Boolean(configuredLipsyncId),
    },
    endpoint_count: endpoints.length,
    endpoints,
    candidates: {
      image: imageCandidates,
      lipsync: lipsyncCandidates,
    },
    safety: {
      read_only: true,
      runpod_generation_jobs_submitted: 0,
      runpod_run_called: false,
      runpod_runsync_called: false,
      endpoint_mutations_performed: 0,
      secrets_persisted: false,
      secret_values_in_output: false,
    },
    next_step: {
      identify_exact_image_endpoint_id: !configuredImageId,
      identify_exact_lipsync_endpoint_id: !configuredLipsyncId,
      use_gpu_type_ids_and_worker_mode_to_set_current_cost_rates: true,
    },
  };

  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(text(error?.message || error));
  process.exit(1);
});
