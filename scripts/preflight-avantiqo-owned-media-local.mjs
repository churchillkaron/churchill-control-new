import fs from "node:fs";
import { spawnSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

const CONTRACT = "AVANTIQO_OWNED_MEDIA_LOCAL_PREFLIGHT_V1";
const RUNPOD_API_BASE = "https://api.runpod.ai/v2";
const OUTPUT =
  process.env.AVANTIQO_MEDIA_PREFLIGHT_OUTPUT ||
  "/tmp/avantiqo-owned-media-local-preflight.json";
const REQUIRED_NODE_MAJOR = 24;
const LIPSYNC_MAX_SECONDS = 4;

function text(value) {
  return String(value ?? "").trim();
}

function enabled(value) {
  return ["1", "true", "yes", "on"].includes(text(value).toLowerCase());
}

function required(name) {
  const value = text(process.env[name]);
  if (!value) throw new Error(`AVANTIQO_MEDIA_PREFLIGHT_ENV_REQUIRED:${name}`);
  return value;
}

function optionalPositiveRate(name) {
  const raw = text(process.env[name]);
  if (!raw) return null;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`AVANTIQO_MEDIA_PREFLIGHT_GPU_RATE_INVALID:${name}`);
  }
  return value;
}

function requireLocalFile(name) {
  const value = required(name);
  if (!fs.existsSync(value)) {
    throw new Error(`AVANTIQO_MEDIA_PREFLIGHT_FILE_MISSING:${name}`);
  }
  const stat = fs.statSync(value);
  if (!stat.isFile() || stat.size <= 0) {
    throw new Error(`AVANTIQO_MEDIA_PREFLIGHT_FILE_INVALID:${name}`);
  }
  return { path: value, size_bytes: stat.size };
}

function requireCommand(name) {
  const result = spawnSync(name, ["-version"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    throw new Error(`AVANTIQO_MEDIA_PREFLIGHT_COMMAND_REQUIRED:${name}`);
  }
  return text(result.stdout).split("\n")[0] || name;
}

function mediaDurationSeconds(localPath) {
  const result = spawnSync(
    "ffprobe",
    [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      localPath,
    ],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );
  const duration = Number(text(result.stdout));
  if (result.status !== 0 || !Number.isFinite(duration) || duration <= 0) {
    throw new Error(`AVANTIQO_MEDIA_PREFLIGHT_MEDIA_DURATION_INVALID:${localPath}`);
  }
  return duration;
}

async function requestJson(url, apiKey) {
  const response = await fetch(url, {
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
      `AVANTIQO_MEDIA_PREFLIGHT_RUNPOD_HEALTH_FAILED:${response.status}:${text(body?.error || body?.message || raw).slice(0, 500)}`,
    );
  }
  return body;
}

function normalizeHealth(body = {}) {
  return {
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

async function endpointHealth(label, endpointId, apiKey) {
  const started = Date.now();
  const body = await requestJson(
    `${RUNPOD_API_BASE}/${encodeURIComponent(endpointId)}/health`,
    apiKey,
  );
  return {
    label,
    endpoint_configured: true,
    health_reachable: true,
    latency_ms: Date.now() - started,
    ...normalizeHealth(body),
  };
}

async function assertSupabaseReadAccess() {
  const url = required("NEXT_PUBLIC_SUPABASE_URL");
  const serviceRoleKey = required("SUPABASE_SERVICE_ROLE_KEY");
  const supabase = createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
  const { error } = await supabase.storage
    .from("creative-assets")
    .list("platform-certification", { limit: 1, offset: 0 });
  if (error) {
    throw new Error(
      `AVANTIQO_MEDIA_PREFLIGHT_SUPABASE_READ_FAILED:${text(error.message).slice(0, 500)}`,
    );
  }
  return {
    bucket: "creative-assets",
    read_access: true,
    mutation_performed: false,
  };
}

const nodeMajor = Number(process.versions.node.split(".")[0]);
if (nodeMajor !== REQUIRED_NODE_MAJOR) {
  throw new Error(
    `AVANTIQO_MEDIA_PREFLIGHT_NODE_MAJOR_REQUIRED:${REQUIRED_NODE_MAJOR}:CURRENT:${process.versions.node}`,
  );
}

const includeLipsync = enabled(
  process.env.AVANTIQO_MEDIA_CERTIFICATION_INCLUDE_LIPSYNC ||
    process.env.AVANTIQO_MEDIA_PREFLIGHT_INCLUDE_LIPSYNC,
);
const ffmpegVersion = requireCommand("ffmpeg");
const ffprobeVersion = requireCommand("ffprobe");

let lipsyncFixtureSource = {
  required: false,
  configured: false,
  normalization_compatible: null,
};
if (includeLipsync) {
  const faceVideo = requireLocalFile("AVANTIQO_MEDIA_CERTIFICATION_FACE_VIDEO_PATH");
  const faceAudio = requireLocalFile("AVANTIQO_MEDIA_CERTIFICATION_FACE_AUDIO_PATH");
  const faceVideoDuration = mediaDurationSeconds(faceVideo.path);
  const faceAudioDuration = mediaDurationSeconds(faceAudio.path);
  const normalizedVideoDuration = Math.min(LIPSYNC_MAX_SECONDS, faceVideoDuration);
  const normalizedAudioDuration = Math.min(LIPSYNC_MAX_SECONDS, faceAudioDuration);
  if (normalizedVideoDuration < 1.9 || normalizedAudioDuration < 1.9) {
    throw new Error("AVANTIQO_MEDIA_PREFLIGHT_LIPSYNC_INPUT_TOO_SHORT");
  }
  if (Math.abs(normalizedVideoDuration - normalizedAudioDuration) > 0.75) {
    throw new Error("AVANTIQO_MEDIA_PREFLIGHT_LIPSYNC_DURATION_MISMATCH");
  }
  lipsyncFixtureSource = {
    required: true,
    configured: true,
    face_video_size_bytes: faceVideo.size_bytes,
    face_audio_size_bytes: faceAudio.size_bytes,
    face_video_duration_seconds: Number(faceVideoDuration.toFixed(3)),
    face_audio_duration_seconds: Number(faceAudioDuration.toFixed(3)),
    normalized_video_duration_seconds: Number(normalizedVideoDuration.toFixed(3)),
    normalized_audio_duration_seconds: Number(normalizedAudioDuration.toFixed(3)),
    normalization_compatible: true,
  };
}

const gpuRates = {
  image_usd_per_second: optionalPositiveRate("AVANTIQO_IMAGE_GPU_USD_PER_SECOND"),
  cinema_usd_per_second: optionalPositiveRate("AVANTIQO_VIDEO_GPU_USD_PER_SECOND"),
  lipsync_usd_per_second: includeLipsync
    ? optionalPositiveRate("AVANTIQO_LIPSYNC_GPU_USD_PER_SECOND")
    : null,
};
const economicsRatesConfigured =
  gpuRates.image_usd_per_second !== null &&
  gpuRates.cinema_usd_per_second !== null &&
  (!includeLipsync || gpuRates.lipsync_usd_per_second !== null);

const apiKey = required("RUNPOD_API_KEY");
const endpoints = {
  image: required("RUNPOD_AVANTIQO_IMAGE_ENDPOINT_ID"),
  cinema: required("RUNPOD_AVANTIQO_VIDEO_ENDPOINT_ID"),
};
if (includeLipsync) {
  endpoints.lipsync = required("RUNPOD_AVANTIQO_LIPSYNC_ENDPOINT_ID");
}
if (new Set(Object.values(endpoints)).size !== Object.values(endpoints).length) {
  throw new Error("AVANTIQO_MEDIA_PREFLIGHT_DISTINCT_ENDPOINTS_REQUIRED");
}

const endpointChecks = [
  endpointHealth("image", endpoints.image, apiKey),
  endpointHealth("cinema", endpoints.cinema, apiKey),
];
if (includeLipsync) {
  endpointChecks.push(endpointHealth("lipsync", endpoints.lipsync, apiKey));
}
const [healthResults, supabase] = await Promise.all([
  Promise.all(endpointChecks),
  assertSupabaseReadAccess(),
]);

const report = {
  contract: CONTRACT,
  generated_at: new Date().toISOString(),
  success: true,
  source_scope: "BENCHMARK_ONLY",
  certification_stage: includeLipsync ? "FULL_WITH_LIPSYNC" : "CORE_IMAGE_CINEMA",
  local_runtime: {
    node_version: process.versions.node,
    node_major_required: REQUIRED_NODE_MAJOR,
    ffmpeg: ffmpegVersion,
    ffprobe: ffprobeVersion,
  },
  lipsync_fixture_source: lipsyncFixtureSource,
  gpu_rates: gpuRates,
  economics: {
    rate_configuration_required_for_core_health: false,
    rates_configured_for_current_scope: economicsRatesConfigured,
    measurement_pending_real_inference: true,
  },
  endpoints: healthResults,
  supabase,
  safety: {
    runpod_health_requests_only: true,
    runpod_generation_jobs_submitted: 0,
    runpod_run_called: false,
    runpod_runsync_called: false,
    supabase_mutations_performed: 0,
    production_activation_performed: false,
    secrets_persisted: false,
  },
  ready_for_core_generation_benchmark: true,
  ready_for_fixture_preparation: includeLipsync,
};

fs.writeFileSync(OUTPUT, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(
  JSON.stringify(
    {
      success: true,
      contract: CONTRACT,
      certification_stage: report.certification_stage,
      output_path: OUTPUT,
      endpoint_health_checks: report.endpoints.length,
      supabase_read_access: true,
      runpod_generation_jobs_submitted: 0,
      economics_rates_configured: economicsRatesConfigured,
      ready_for_core_generation_benchmark: true,
      ready_for_fixture_preparation: report.ready_for_fixture_preparation,
    },
    null,
    2,
  ),
);
