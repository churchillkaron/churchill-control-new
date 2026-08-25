const REST_BASE = "https://rest.runpod.io/v1";
const AUDIO_ENDPOINT_NAME = "avantiqo-audio-v1";
const AUDIO_VOICE_VOLUME_NAME = "avantiqo-shared-audio-voice-cache";
const MINIMUM_CAPACITY_GB = 80;

function text(value) {
  return String(value ?? "").trim();
}

function finite(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function required(name) {
  const value = text(process.env[name]);
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
}

function endpointVolumeIds(endpoint = {}) {
  return [...new Set([
    text(endpoint.networkVolumeId),
    ...list(endpoint.networkVolumeIds).map(text),
  ].filter(Boolean))];
}

async function rest(path, credential) {
  const response = await fetch(`${REST_BASE}${path}`, {
    headers: {
      Authorization: `Bearer ${credential}`,
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
      `AVANTIQO_MUSIC_XL_LM_CAPACITY_RUNPOD_HTTP_${response.status}:${text(body?.message || body?.error || body?.detail || raw).slice(0, 800)}`,
    );
  }
  return body;
}

const managementKey = required("RUNPOD_MANAGEMENT_API_KEY");
const endpointId = required("RUNPOD_AVANTIQO_AUDIO_ENDPOINT_ID");

const [endpoint, volumes] = await Promise.all([
  rest(`/endpoints/${encodeURIComponent(endpointId)}?includeTemplate=true&includeWorkers=true`, managementKey),
  rest("/networkvolumes", managementKey),
]);
if (!Array.isArray(volumes)) throw new Error("AVANTIQO_MUSIC_XL_LM_CAPACITY_VOLUME_LIST_INVALID");
if (text(endpoint?.id) !== endpointId || text(endpoint?.name) !== AUDIO_ENDPOINT_NAME) {
  throw new Error("AVANTIQO_MUSIC_XL_LM_CAPACITY_AUDIO_ENDPOINT_IDENTITY_INVALID");
}
const attachedIds = endpointVolumeIds(endpoint);
if (attachedIds.length !== 1) {
  throw new Error(`AVANTIQO_MUSIC_XL_LM_CAPACITY_SINGLE_VOLUME_REQUIRED:count=${attachedIds.length}`);
}
const attached = volumes.filter((volume) => attachedIds.includes(text(volume?.id)));
if (attached.length !== 1) throw new Error("AVANTIQO_MUSIC_XL_LM_CAPACITY_ATTACHED_VOLUME_UNRESOLVED");
const volume = attached[0];
if (text(volume?.name) !== AUDIO_VOICE_VOLUME_NAME) {
  throw new Error(`AVANTIQO_MUSIC_XL_LM_CAPACITY_CANONICAL_VOLUME_REQUIRED:actual=${text(volume?.name) || "MISSING"}`);
}
const actualSizeGb = finite(volume?.size, 0);
if (actualSizeGb < MINIMUM_CAPACITY_GB) {
  throw new Error(
    `AVANTIQO_MUSIC_XL_LM_CACHE_CAPACITY_INSUFFICIENT:actual_gb=${actualSizeGb}:minimum_gb=${MINIMUM_CAPACITY_GB}:next_action=EXPAND_AUDIO_VOICE_VOLUME`,
  );
}

console.log(JSON.stringify({
  success: true,
  contract: "AVANTIQO_MUSIC_XL_LM_STORAGE_CAPACITY_V1",
  endpoint_id: endpointId,
  volume_id: text(volume?.id),
  volume_name: text(volume?.name),
  actual_size_gb: actualSizeGb,
  minimum_required_size_gb: MINIMUM_CAPACITY_GB,
  capacity_sufficient: true,
  source_failure_guarded: "ACE_STEP_XL_LM_DISK_QUOTA_EXCEEDED",
  generation_submitted: false,
  endpoint_mutation_performed: false,
  production_deploy_performed: false,
  secret_values_printed: false,
}, null, 2));
