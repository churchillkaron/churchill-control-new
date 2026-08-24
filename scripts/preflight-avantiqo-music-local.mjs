import { createClient } from "@supabase/supabase-js";

const RUNPOD_API_BASE = "https://api.runpod.ai/v2";
const STORAGE_BUCKET = "creative-assets";

function text(value) {
  return String(value ?? "").trim();
}

function required(name) {
  const value = text(process.env[name]);
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
}

function positive(name) {
  const value = Number(required(name));
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${name}_POSITIVE_REQUIRED`);
  return value;
}

async function runpodHealth(endpointId, apiKey) {
  const response = await fetch(`${RUNPOD_API_BASE}/${encodeURIComponent(endpointId)}/health`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(20_000),
  });
  const raw = await response.text();
  let body = {};
  try { body = raw ? JSON.parse(raw) : {}; } catch { body = {}; }
  if (!response.ok) {
    throw new Error(`AVANTIQO_MUSIC_RUNPOD_HEALTH_FAILED:${response.status}:${text(body?.error || body?.message || raw).slice(0, 500)}`);
  }
  return body;
}

const apiKey = text(process.env.RUNPOD_AVANTIQO_AUDIO_API_KEY) || required("RUNPOD_API_KEY");
const endpointId = required("RUNPOD_AVANTIQO_AUDIO_ENDPOINT_ID");
const supabaseUrl = required("NEXT_PUBLIC_SUPABASE_URL");
const serviceRoleKey = required("SUPABASE_SERVICE_ROLE_KEY");
const gpuUsdPerHour = positive("AVANTIQO_AUDIO_GPU_USD_PER_HOUR");

const otherEndpointIds = {
  image: text(process.env.RUNPOD_AVANTIQO_IMAGE_ENDPOINT_ID),
  cinema: text(process.env.RUNPOD_AVANTIQO_VIDEO_ENDPOINT_ID),
  code: text(process.env.RUNPOD_AVANTIQO_CODE_ENDPOINT_ID),
  intelligence: text(process.env.RUNPOD_AVANTIQO_INTELLIGENCE_ENDPOINT_ID),
  voice_stt: text(process.env.RUNPOD_AVANTIQO_VOICE_STT_ENDPOINT_ID),
  voice_tts: text(process.env.RUNPOD_AVANTIQO_VOICE_TTS_ENDPOINT_ID),
  lipsync: text(process.env.RUNPOD_AVANTIQO_LIPSYNC_ENDPOINT_ID),
};
const collisions = Object.entries(otherEndpointIds)
  .filter(([, value]) => value && value === endpointId)
  .map(([name]) => name);
if (collisions.length) {
  throw new Error(`AVANTIQO_MUSIC_ENDPOINT_COLLISION:${collisions.join(",")}`);
}

const health = await runpodHealth(endpointId, apiKey);
const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
});

const probePath = `benchmark-preflight/music/${crypto.randomUUID()}.wav`;
const { data: signedUpload, error: uploadError } = await supabase.storage
  .from(STORAGE_BUCKET)
  .createSignedUploadUrl(probePath, { upsert: false });
if (uploadError) throw new Error(`AVANTIQO_MUSIC_SUPABASE_SIGN_UPLOAD_FAILED:${uploadError.message}`);
if (!signedUpload?.signedUrl) throw new Error("AVANTIQO_MUSIC_SUPABASE_SIGN_UPLOAD_URL_REQUIRED");

const { data: signedRead, error: readError } = await supabase.storage
  .from(STORAGE_BUCKET)
  .createSignedUrl(probePath, 60);
if (readError) throw new Error(`AVANTIQO_MUSIC_SUPABASE_SIGN_READ_FAILED:${readError.message}`);
if (!signedRead?.signedUrl) throw new Error("AVANTIQO_MUSIC_SUPABASE_SIGN_READ_URL_REQUIRED");

const result = {
  success: true,
  contract: "AVANTIQO_MUSIC_LOCAL_PREFLIGHT_V1",
  endpoint: {
    configured: true,
    collision_with_other_owned_engine: false,
    health_reachable: true,
    workers: health?.workers || {},
    jobs: health?.jobs || {},
  },
  storage: {
    bucket: STORAGE_BUCKET,
    signed_upload_creation_passed: true,
    signed_read_creation_passed: true,
    object_written: false,
  },
  economics: {
    gpu_usd_per_hour_present: true,
    gpu_usd_per_hour: gpuUsdPerHour,
  },
  ready_for_controlled_benchmark: true,
  safety: {
    read_only_except_signed_url_creation: true,
    runpod_generation_jobs_submitted: 0,
    runpod_run_called: false,
    runpod_runsync_called: false,
    storage_objects_written: 0,
    database_rows_written: 0,
    endpoint_mutations_performed: 0,
    production_deploy_performed: false,
    secret_values_printed: false,
  },
};

console.log(JSON.stringify(result, null, 2));
