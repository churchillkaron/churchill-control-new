const API_BASE = "https://api.runpod.ai/v2";

function text(value) {
  return String(value ?? "").trim();
}

function required(name) {
  const value = text(process.env[name]);
  if (!value) throw new Error(`AVANTIQO_MEDIA_RUNPOD_READINESS_ENV_REQUIRED:${name}`);
  return value;
}

function positiveRate(name) {
  const raw = required(name);
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`AVANTIQO_MEDIA_RUNPOD_READINESS_GPU_RATE_INVALID:${name}`);
  }
  return value;
}

async function health(label, endpointId, apiKey) {
  const started = Date.now();
  const response = await fetch(`${API_BASE}/${encodeURIComponent(endpointId)}/health`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(20000),
  });
  const raw = await response.text();
  let body = {};
  try {
    body = raw ? JSON.parse(raw) : {};
  } catch {
    body = {};
  }
  if (!response.ok) {
    throw new Error(
      `AVANTIQO_MEDIA_RUNPOD_READINESS_HEALTH_FAILED:${label}:${response.status}:${text(body?.error || body?.message || raw).slice(0, 300)}`,
    );
  }
  return {
    label,
    endpoint_id_present: true,
    health_reachable: true,
    latency_ms: Date.now() - started,
    workers: {
      running: Number(body?.workers?.running || 0),
      idle: Number(body?.workers?.idle || 0),
      initializing: Number(body?.workers?.initializing || 0),
      throttled: Number(body?.workers?.throttled || 0),
    },
    jobs: {
      in_progress: Number(body?.jobs?.inProgress || 0),
      in_queue: Number(body?.jobs?.inQueue || 0),
      completed: Number(body?.jobs?.completed || 0),
      failed: Number(body?.jobs?.failed || 0),
    },
  };
}

const apiKey = required("RUNPOD_API_KEY");
const endpoints = {
  image: required("RUNPOD_AVANTIQO_IMAGE_ENDPOINT_ID"),
  cinema: required("RUNPOD_AVANTIQO_VIDEO_ENDPOINT_ID"),
  lipsync: required("RUNPOD_AVANTIQO_LIPSYNC_ENDPOINT_ID"),
};

if (new Set(Object.values(endpoints)).size !== 3) {
  throw new Error("AVANTIQO_MEDIA_RUNPOD_READINESS_DISTINCT_ENDPOINTS_REQUIRED");
}

const rates = {
  image_usd_per_second: positiveRate("AVANTIQO_IMAGE_GPU_USD_PER_SECOND"),
  cinema_usd_per_second: positiveRate("AVANTIQO_VIDEO_GPU_USD_PER_SECOND"),
  lipsync_usd_per_second: positiveRate("AVANTIQO_LIPSYNC_GPU_USD_PER_SECOND"),
};

const checks = await Promise.all([
  health("image", endpoints.image, apiKey),
  health("cinema", endpoints.cinema, apiKey),
  health("lipsync", endpoints.lipsync, apiKey),
]);

console.log(JSON.stringify({
  success: true,
  contract: "AVANTIQO_OWNED_MEDIA_RUNPOD_READINESS_V1",
  endpoint_health_checks: checks,
  gpu_rates: rates,
  face_fixtures_required_for_this_check: false,
  ready_for_media_certification_preflight: true,
  safety: {
    read_only: true,
    runpod_generation_jobs_submitted: 0,
    runpod_run_called: false,
    runpod_runsync_called: false,
    endpoint_mutations_performed: 0,
    production_deploy_performed: false,
  },
}, null, 2));
