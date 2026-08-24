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

  const termsByFamily = {
    image: ["avantiqo", "image", "flux", "qwen", "swin", "sdxl"],
    audio: ["avantiqo", "audio", "music", "ace-step", "acestep"],
    lipsync: ["avantiqo", "lipsync", "lip-sync", "latent", "sync", "whisper", "insightface"],
  };
  const terms = termsByFamily[family] || [];
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
  const template = object(endpoint.template);
  return {
    id: text(endpoint.id) || null,
    name: text(endpoint.name) || null,
    compute_type: text(endpoint.computeType) || null,
    gpu_count: Number.isFinite(Number(endpoint.gpuCount)) ? Number(endpoint.gpuCount) : null,
    gpu_type_ids: list(endpoint.gpuTypeIds).map(text).filter(Boolean),
    data_center_ids: list(endpoint.dataCenterIds).map(text).filter(Boolean),
    network_volume_id: text(endpoint.networkVolumeId) || null,
    network_volume_ids: list(endpoint.networkVolumeIds).map(text).filter(Boolean),
    workers_min: Number.isFinite(Number(endpoint.workersMin)) ? Number(endpoint.workersMin) : null,
    workers_max: Number.isFinite(Number(endpoint.workersMax)) ? Number(endpoint.workersMax) : null,
    idle_timeout_seconds: Number.isFinite(Number(endpoint.idleTimeout)) ? Number(endpoint.idleTimeout) : null,
    execution_timeout_ms: Number.isFinite(Number(endpoint.executionTimeoutMs))
      ? Number(endpoint.executionTimeoutMs)
      : null,
    scaler_type: text(endpoint.scalerType) || null,
    scaler_value: Number.isFinite(Number(endpoint.scalerValue)) ? Number(endpoint.scalerValue) : null,
    flashboot: endpoint.flashboot === true,
    min_cuda_version: text(endpoint.minCudaVersion) || null,
    allowed_cuda_versions: list(endpoint.allowedCudaVersions).map(text).filter(Boolean),
    template_id: text(endpoint.templateId) || null,
    template_name: text(template.name) || null,
    template_image_name: text(template.imageName) || null,
    template_container_disk_gb: Number.isFinite(Number(template.containerDiskInGb))
      ? Number(template.containerDiskInGb)
      : null,
    template_volume_mount_path: text(template.volumeMountPath) || null,
    template_registry_auth_id: text(template.containerRegistryAuthId) || null,
    template_registry_auth_configured: Boolean(text(template.containerRegistryAuthId)),
    endpoint_env_keys: redactEnvKeys(endpoint.env),
    template_env_keys: redactEnvKeys(template.env),
    workers: list(endpoint.workers).map(sanitizeWorker),
  };
}

async function main() {
  const apiKey = required("RUNPOD_MANAGEMENT_API_KEY");
  const configuredVideoId = text(process.env.RUNPOD_AVANTIQO_VIDEO_ENDPOINT_ID);
  const configuredImageId = text(process.env.RUNPOD_AVANTIQO_IMAGE_ENDPOINT_ID);
  const configuredAudioId = text(process.env.RUNPOD_AVANTIQO_AUDIO_ENDPOINT_ID);
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

  if (response.status === 401 || response.status === 403) {
    throw new Error(
      `AVANTIQO_RUNPOD_MANAGEMENT_PERMISSION_REQUIRED:${response.status}:create a local-only RunPod key with management read access; do not broaden the inference key`,
    );
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
      configuredAudioId && endpoint.id === configuredAudioId ? "audio" : null,
      configuredLipsyncId && endpoint.id === configuredLipsyncId ? "lipsync" : null,
    ].filter(Boolean),
    image_candidate_score: candidateScore(endpoint, "image"),
    audio_candidate_score: candidateScore(endpoint, "audio"),
    lipsync_candidate_score: candidateScore(endpoint, "lipsync"),
  }));

  const imageCandidates = endpoints
    .filter((endpoint) => endpoint.image_candidate_score > 0)
    .sort((a, b) => b.image_candidate_score - a.image_candidate_score);
  const audioCandidates = endpoints
    .filter((endpoint) => endpoint.audio_candidate_score > 0)
    .sort((a, b) => b.audio_candidate_score - a.audio_candidate_score);
  const lipsyncCandidates = endpoints
    .filter((endpoint) => endpoint.lipsync_candidate_score > 0)
    .sort((a, b) => b.lipsync_candidate_score - a.lipsync_candidate_score);
  const cinemaEndpoint = configuredVideoId
    ? endpoints.find((endpoint) => endpoint.id === configuredVideoId) || null
    : null;
  const audioEndpoint = configuredAudioId
    ? endpoints.find((endpoint) => endpoint.id === configuredAudioId) || null
    : null;
  const exactAudioNameMatches = endpoints.filter((endpoint) => endpoint.name === "avantiqo-audio-v1");
  const resolvedAudioEndpoint = audioEndpoint || (exactAudioNameMatches.length === 1 ? exactAudioNameMatches[0] : null);

  const report = {
    contract: "AVANTIQO_RUNPOD_MEDIA_CONFIG_DISCOVERY_V3",
    generated_at: new Date().toISOString(),
    management_credential: {
      env_name: "RUNPOD_MANAGEMENT_API_KEY",
      separate_from_inference_credential: true,
      secret_value_in_output: false,
    },
    request: {
      method: "GET",
      endpoint: "https://rest.runpod.io/v1/endpoints",
      include_template: true,
      include_workers: true,
    },
    configured: {
      image_endpoint_id_present: Boolean(configuredImageId),
      cinema_endpoint_id_present: Boolean(configuredVideoId),
      audio_endpoint_id_present: Boolean(configuredAudioId),
      lipsync_endpoint_id_present: Boolean(configuredLipsyncId),
      configured_cinema_endpoint_found_in_account: Boolean(cinemaEndpoint),
      configured_audio_endpoint_found_in_account: Boolean(audioEndpoint),
    },
    existing_cinema_binding: cinemaEndpoint,
    existing_audio_binding: resolvedAudioEndpoint,
    exact_audio_endpoint_name_match_count: exactAudioNameMatches.length,
    endpoint_count: endpoints.length,
    endpoints,
    candidates: {
      image: imageCandidates,
      audio: audioCandidates,
      lipsync: lipsyncCandidates,
    },
    safety: {
      read_only: true,
      runpod_generation_jobs_submitted: 0,
      runpod_run_called: false,
      runpod_runsync_called: false,
      endpoint_mutations_performed: 0,
      inference_key_permissions_modified: false,
      secrets_persisted: false,
      secret_values_in_output: false,
    },
    next_step: {
      inspect_existing_cinema_network_volume_and_registry_binding: Boolean(cinemaEndpoint),
      inspect_existing_audio_template_and_network_volume: Boolean(resolvedAudioEndpoint),
      identify_exact_image_endpoint_id: !configuredImageId,
      identify_exact_audio_endpoint_id: !configuredAudioId && !resolvedAudioEndpoint,
      identify_exact_lipsync_endpoint_id: !configuredLipsyncId,
      use_exact_gpu_type_and_worker_mode_for_economics: true,
    },
  };

  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(text(error?.message || error));
  process.exit(1);
});
