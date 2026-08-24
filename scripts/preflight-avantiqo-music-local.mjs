import { createClient } from "@supabase/supabase-js";

import {
  assertSharedVolumeGroupCompatible,
  classifyManagedVolumeName,
  resolveReusableGroupVolume,
  sharedVolumeGroup,
} from "./lib/avantiqo-runpod-shared-volumes.mjs";

const RUNPOD_API_BASE = "https://api.runpod.ai/v2";
const RUNPOD_REST_BASE = "https://rest.runpod.io/v1";
const AUDIO_ENDPOINT_NAME = "avantiqo-audio-v1";
const AUDIO_VOICE_GROUP = sharedVolumeGroup("AUDIO_VOICE");
const STORAGE_BUCKET = "creative-assets";
const NETWORK_VOLUME_CHECKPOINT_ROOT = "/runpod-volume/ace-step-checkpoints";
const EXPECTED_FOUNDATION_MODEL = "ACE-Step/Ace-Step1.5";
const EXPECTED_VARIANT = "acestep-v15-turbo";
const RUNPOD_24GB_FLEX_USD_PER_SECOND = 0.00019;
const RUNPOD_PUBLIC_PRICING_VERIFIED_AT = "2026-08-24";
const RUNPOD_24GB_FLEX_GPU_TYPE_IDS = new Set([
  "NVIDIA L4",
  "NVIDIA RTX A5000",
  "NVIDIA GeForce RTX 3090",
]);
const STORAGE_DISCOVERY_MAX_PREFIXES = 64;
const STORAGE_DISCOVERY_LIST_LIMIT = 100;

function text(value) {
  return String(value ?? "").trim();
}

function required(name) {
  const value = text(process.env[name]);
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
}

function positiveOptional(name) {
  const raw = text(process.env[name]);
  if (!raw) return null;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${name}_POSITIVE_REQUIRED`);
  return value;
}

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function normalizeEnv(value) {
  return Object.fromEntries(
    Object.entries(object(value)).map(([key, child]) => [String(key), String(child ?? "")]),
  );
}

function endpointVolumeIds(endpoint = {}) {
  return [...new Set([
    text(endpoint.networkVolumeId ?? endpoint.network_volume_id),
    ...(Array.isArray(endpoint.networkVolumeIds ?? endpoint.network_volume_ids)
      ? (endpoint.networkVolumeIds ?? endpoint.network_volume_ids).map(text)
      : []),
  ].filter(Boolean))];
}

function endpointGpuTypeIds(endpoint = {}) {
  return Array.isArray(endpoint.gpuTypeIds)
    ? endpoint.gpuTypeIds.map(text).filter(Boolean)
    : [];
}

function resolveGpuEconomics(endpoint = {}) {
  const override = positiveOptional("AVANTIQO_AUDIO_GPU_USD_PER_HOUR");
  const gpuTypeIds = endpointGpuTypeIds(endpoint);
  if (override !== null) {
    return {
      gpu_usd_per_hour: override,
      gpu_usd_per_second: override / 3600,
      gpu_rate_source: "AVANTIQO_AUDIO_GPU_USD_PER_HOUR",
      gpu_rate_environment_override_used: true,
      gpu_type_ids: gpuTypeIds,
      public_pricing_verified_at: null,
    };
  }

  if (!gpuTypeIds.length) {
    throw new Error("AVANTIQO_MUSIC_PREFLIGHT_GPU_TYPE_IDS_REQUIRED_FOR_RATE_RESOLUTION");
  }
  const unsupported = gpuTypeIds.filter(
    (gpuTypeId) => !RUNPOD_24GB_FLEX_GPU_TYPE_IDS.has(gpuTypeId),
  );
  if (unsupported.length) {
    throw new Error(
      `AVANTIQO_AUDIO_GPU_USD_PER_HOUR_REQUIRED_FOR_UNMAPPED_GPU_TYPES:${unsupported.join(",")}`,
    );
  }

  return {
    gpu_usd_per_hour: RUNPOD_24GB_FLEX_USD_PER_SECOND * 3600,
    gpu_usd_per_second: RUNPOD_24GB_FLEX_USD_PER_SECOND,
    gpu_rate_source: "RUNPOD_PUBLIC_SERVERLESS_24GB_FLEX_PRICING",
    gpu_rate_environment_override_used: false,
    gpu_type_ids: gpuTypeIds,
    public_pricing_verified_at: RUNPOD_PUBLIC_PRICING_VERIFIED_AT,
  };
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
  try {
    body = raw ? JSON.parse(raw) : {};
  } catch {
    body = {};
  }
  if (!response.ok) {
    throw new Error(
      `AVANTIQO_MUSIC_RUNPOD_HEALTH_FAILED:${response.status}:${text(body?.error || body?.message || raw).slice(0, 500)}`,
    );
  }
  return body;
}

async function runpodRest(path, managementKey) {
  const response = await fetch(`${RUNPOD_REST_BASE}${path}`, {
    headers: {
      Authorization: `Bearer ${managementKey}`,
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(20_000),
  });
  const raw = await response.text();
  let body = null;
  try {
    body = raw ? JSON.parse(raw) : null;
  } catch {
    body = null;
  }
  if (!response.ok) {
    throw new Error(
      `AVANTIQO_MUSIC_RUNPOD_MANAGEMENT_FAILED:${response.status}:${text(body?.error || body?.message || raw).slice(0, 500)}`,
    );
  }
  return body;
}

async function resolveEndpointTemplate(endpoint, managementKey) {
  const inline = object(endpoint?.template);
  if (Object.keys(inline).length) return inline;
  const templateId = text(endpoint?.templateId);
  if (!templateId) throw new Error("AVANTIQO_MUSIC_PREFLIGHT_TEMPLATE_ID_REQUIRED");
  const templates = await runpodRest(
    "/templates?includeEndpointBoundTemplates=true&includePublicTemplates=false&includeRunpodTemplates=false",
    managementKey,
  );
  if (!Array.isArray(templates)) throw new Error("AVANTIQO_MUSIC_PREFLIGHT_TEMPLATE_LIST_INVALID");
  const matches = templates.filter((template) => text(template?.id) === templateId);
  if (matches.length !== 1) {
    throw new Error(`AVANTIQO_MUSIC_PREFLIGHT_TEMPLATE_RESOLUTION_FAILED:matches=${matches.length}`);
  }
  return matches[0];
}

async function findExistingStorageObject(storageBucket) {
  const queue = [""];
  const visited = new Set();
  let prefixesInspected = 0;
  let entriesInspected = 0;

  while (queue.length && prefixesInspected < STORAGE_DISCOVERY_MAX_PREFIXES) {
    const prefix = queue.shift();
    if (visited.has(prefix)) continue;
    visited.add(prefix);
    prefixesInspected += 1;

    const { data, error } = await storageBucket.list(prefix, {
      limit: STORAGE_DISCOVERY_LIST_LIMIT,
      offset: 0,
      sortBy: { column: "name", order: "asc" },
    });
    if (error) {
      throw new Error(`AVANTIQO_MUSIC_SUPABASE_LIST_FAILED:${error.message}`);
    }

    for (const entry of Array.isArray(data) ? data : []) {
      const name = text(entry?.name);
      if (!name) continue;
      entriesInspected += 1;
      const path = prefix ? `${prefix}/${name}` : name;
      const metadata = object(entry?.metadata);
      const isObject = Boolean(text(entry?.id)) || Object.keys(metadata).length > 0;
      if (isObject) {
        return {
          path,
          prefixes_inspected: prefixesInspected,
          entries_inspected: entriesInspected,
        };
      }
      if (queue.length + prefixesInspected < STORAGE_DISCOVERY_MAX_PREFIXES) {
        queue.push(path);
      }
    }
  }

  throw new Error("AVANTIQO_MUSIC_SUPABASE_EXISTING_READ_OBJECT_REQUIRED");
}

const apiKey = text(process.env.RUNPOD_AVANTIQO_AUDIO_API_KEY) || required("RUNPOD_API_KEY");
const managementKey = required("RUNPOD_MANAGEMENT_API_KEY");
const endpointId = required("RUNPOD_AVANTIQO_AUDIO_ENDPOINT_ID");
const supabaseUrl = required("NEXT_PUBLIC_SUPABASE_URL");
const serviceRoleKey = required("SUPABASE_SERVICE_ROLE_KEY");

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

const [health, endpoint, volumes] = await Promise.all([
  runpodHealth(endpointId, apiKey),
  runpodRest(
    `/endpoints/${encodeURIComponent(endpointId)}?includeTemplate=true&includeWorkers=true`,
    managementKey,
  ),
  runpodRest("/networkvolumes", managementKey),
]);
if (text(endpoint?.id) !== endpointId) {
  throw new Error("AVANTIQO_MUSIC_PREFLIGHT_ENDPOINT_ID_MISMATCH");
}
if (text(endpoint?.name) !== AUDIO_ENDPOINT_NAME) {
  throw new Error(
    `AVANTIQO_MUSIC_PREFLIGHT_ENDPOINT_NAME_MISMATCH:${text(endpoint?.name) || "MISSING"}`,
  );
}
if (finite(endpoint?.workersMin, -1) !== 0) {
  throw new Error(
    `AVANTIQO_MUSIC_PREFLIGHT_SCALE_TO_ZERO_REQUIRED:workers_min=${finite(endpoint?.workersMin, -1)}`,
  );
}
if (!Array.isArray(volumes)) {
  throw new Error("AVANTIQO_MUSIC_PREFLIGHT_NETWORK_VOLUME_LIST_INVALID");
}
assertSharedVolumeGroupCompatible(volumes, AUDIO_VOICE_GROUP);
const gpuEconomics = resolveGpuEconomics(endpoint);

const attachedVolumeIds = endpointVolumeIds(endpoint);
if (!attachedVolumeIds.length) {
  throw new Error("AVANTIQO_MUSIC_PREFLIGHT_DURABLE_NETWORK_VOLUME_REQUIRED");
}
const attachedVolumes = volumes.filter((volume) => attachedVolumeIds.includes(text(volume?.id)));
if (attachedVolumes.length !== attachedVolumeIds.length) {
  throw new Error("AVANTIQO_MUSIC_PREFLIGHT_ATTACHED_VOLUME_LOOKUP_FAILED");
}
const wrongSharedGroup = attachedVolumes.filter(
  (volume) => classifyManagedVolumeName(volume?.name)?.id !== AUDIO_VOICE_GROUP.id,
);
if (wrongSharedGroup.length) {
  throw new Error(
    `AVANTIQO_MUSIC_PREFLIGHT_ATTACHED_VOLUME_WRONG_SHARED_GROUP:count=${wrongSharedGroup.length}`,
  );
}
const reusableAudioVoiceVolume = resolveReusableGroupVolume(volumes, AUDIO_VOICE_GROUP);
if (!reusableAudioVoiceVolume.volume) {
  throw new Error("AVANTIQO_MUSIC_PREFLIGHT_SHARED_AUDIO_VOICE_VOLUME_REQUIRED");
}
if (!attachedVolumeIds.includes(text(reusableAudioVoiceVolume.volume.id))) {
  throw new Error("AVANTIQO_MUSIC_PREFLIGHT_SHARED_AUDIO_VOICE_VOLUME_NOT_ATTACHED");
}

const template = await resolveEndpointTemplate(endpoint, managementKey);
const env = normalizeEnv(template?.env);
const requiredTemplateEnv = {
  ACESTEP_CHECKPOINTS_DIR: NETWORK_VOLUME_CHECKPOINT_ROOT,
  HF_HOME: `${NETWORK_VOLUME_CHECKPOINT_ROOT}/.hf-cache`,
  AVANTIQO_AUDIO_FOUNDATION_MODEL: EXPECTED_FOUNDATION_MODEL,
  AVANTIQO_AUDIO_MODEL_VARIANT: EXPECTED_VARIANT,
  AVANTIQO_AUDIO_CERTIFIED_CAPABILITIES: "ai.music.generate",
  ACESTEP_INIT_LLM: "false",
};
const invalidEnv = Object.entries(requiredTemplateEnv)
  .filter(([key, expected]) => env[key] !== expected)
  .map(([key]) => key);
if (invalidEnv.length) {
  throw new Error(`AVANTIQO_MUSIC_PREFLIGHT_TEMPLATE_ENV_INVALID:${invalidEnv.join(",")}`);
}

const jobs = object(health?.jobs);
const inQueue = finite(jobs.inQueue ?? jobs.in_queue, 0);
const inProgress = finite(jobs.inProgress ?? jobs.in_progress, 0);
if (inQueue > 0 || inProgress > 0) {
  throw new Error(
    `AVANTIQO_MUSIC_PREFLIGHT_ENDPOINT_NOT_QUIET:in_queue=${inQueue}:in_progress=${inProgress}`,
  );
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
});
const storageBucket = supabase.storage.from(STORAGE_BUCKET);

const probePath = `benchmark-preflight/music/${crypto.randomUUID()}.wav`;
const { data: signedUpload, error: uploadError } = await storageBucket.createSignedUploadUrl(
  probePath,
  { upsert: false },
);
if (uploadError) {
  throw new Error(`AVANTIQO_MUSIC_SUPABASE_SIGN_UPLOAD_FAILED:${uploadError.message}`);
}
if (!signedUpload?.signedUrl) {
  throw new Error("AVANTIQO_MUSIC_SUPABASE_SIGN_UPLOAD_URL_REQUIRED");
}

const existingReadProbe = await findExistingStorageObject(storageBucket);
const { data: signedRead, error: readError } = await storageBucket.createSignedUrl(
  existingReadProbe.path,
  60,
);
if (readError) {
  throw new Error(`AVANTIQO_MUSIC_SUPABASE_SIGN_READ_FAILED:${readError.message}`);
}
if (!signedRead?.signedUrl) {
  throw new Error("AVANTIQO_MUSIC_SUPABASE_SIGN_READ_URL_REQUIRED");
}

const result = {
  success: true,
  contract: "AVANTIQO_MUSIC_LOCAL_PREFLIGHT_V2",
  endpoint: {
    configured: true,
    exact_audio_identity: true,
    collision_with_other_owned_engine: false,
    health_reachable: true,
    workers_min: 0,
    scale_to_zero: true,
    quiet_for_controlled_benchmark: true,
    gpu_type_ids: gpuEconomics.gpu_type_ids,
    workers: health?.workers || {},
    jobs: health?.jobs || {},
  },
  model_cache: {
    network_volume_attached: true,
    attached_volume_count: attachedVolumeIds.length,
    shared_volume_group: AUDIO_VOICE_GROUP.id,
    shared_volume_name: text(reusableAudioVoiceVolume.volume.name),
    shared_volume_resolution: reusableAudioVoiceVolume.resolution,
    shared_volume_policy_scope: AUDIO_VOICE_GROUP.id,
    shared_volume_policy_compliant: true,
    checkpoints_dir: NETWORK_VOLUME_CHECKPOINT_ROOT,
    huggingface_cache_dir: `${NETWORK_VOLUME_CHECKPOINT_ROOT}/.hf-cache`,
    persistent: true,
  },
  model_contract: {
    foundation_model: EXPECTED_FOUNDATION_MODEL,
    variant: EXPECTED_VARIANT,
    certified_capabilities: ["ai.music.generate"],
    ace_step_lm_enabled: false,
  },
  storage: {
    bucket: STORAGE_BUCKET,
    signed_upload_creation_passed: true,
    signed_read_creation_passed: true,
    signed_read_existing_object_discovered: true,
    signed_read_existing_object_path_printed: false,
    signed_read_discovery_prefixes_inspected: existingReadProbe.prefixes_inspected,
    signed_read_discovery_entries_inspected: existingReadProbe.entries_inspected,
    object_written: false,
  },
  economics: {
    gpu_usd_per_hour_present: true,
    gpu_usd_per_hour: gpuEconomics.gpu_usd_per_hour,
    gpu_usd_per_second: gpuEconomics.gpu_usd_per_second,
    gpu_rate_source: gpuEconomics.gpu_rate_source,
    gpu_rate_environment_override_used: gpuEconomics.gpu_rate_environment_override_used,
    public_pricing_verified_at: gpuEconomics.public_pricing_verified_at,
    gpu_type_ids: gpuEconomics.gpu_type_ids,
  },
  ready_for_controlled_benchmark: true,
  safety: {
    read_only_except_signed_url_creation: true,
    shared_volume_policy_verified: true,
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
