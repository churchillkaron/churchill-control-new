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
const RUNPOD_24GB_FLEX_GPU_TYPE_IDS = new Set(["NVIDIA L4", "NVIDIA RTX A5000", "NVIDIA GeForce RTX 3090"]);

function text(value) { return String(value ?? "").trim(); }
function required(name) { const value = text(process.env[name]); if (!value) throw new Error(`${name}_REQUIRED`); return value; }
function positiveOptional(name) { const raw = text(process.env[name]); if (!raw) return null; const value = Number(raw); if (!Number.isFinite(value) || value <= 0) throw new Error(`${name}_POSITIVE_REQUIRED`); return value; }
function finite(value, fallback = 0) { const number = Number(value); return Number.isFinite(number) ? number : fallback; }
function object(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function normalizeEnv(value) { return Object.fromEntries(Object.entries(object(value)).map(([key, child]) => [String(key), String(child ?? "")])); }
function endpointVolumeIds(endpoint = {}) { return [text(endpoint.networkVolumeId), ...(Array.isArray(endpoint.networkVolumeIds) ? endpoint.networkVolumeIds.map(text) : [])].filter(Boolean); }
function endpointGpuTypeIds(endpoint = {}) { return Array.isArray(endpoint.gpuTypeIds) ? endpoint.gpuTypeIds.map(text).filter(Boolean) : []; }
function resolveGpuEconomics(endpoint = {}) {
  const override = positiveOptional("AVANTIQO_AUDIO_GPU_USD_PER_HOUR");
  const gpuTypeIds = endpointGpuTypeIds(endpoint);
  if (override !== null) return { gpu_usd_per_hour: override, gpu_usd_per_second: override / 3600, gpu_rate_source: "AVANTIQO_AUDIO_GPU_USD_PER_HOUR", gpu_rate_environment_override_used: true, gpu_type_ids: gpuTypeIds, public_pricing_verified_at: null };
  if (!gpuTypeIds.length) throw new Error("AVANTIQO_MUSIC_PREFLIGHT_GPU_TYPE_IDS_REQUIRED_FOR_RATE_RESOLUTION");
  const unsupported = gpuTypeIds.filter((gpuTypeId) => !RUNPOD_24GB_FLEX_GPU_TYPE_IDS.has(gpuTypeId));
  if (unsupported.length) throw new Error(`AVANTIQO_AUDIO_GPU_USD_PER_HOUR_REQUIRED_FOR_UNMAPPED_GPU_TYPES:${unsupported.join(",")}`);
  return { gpu_usd_per_hour: RUNPOD_24GB_FLEX_USD_PER_SECOND * 3600, gpu_usd_per_second: RUNPOD_24GB_FLEX_USD_PER_SECOND, gpu_rate_source: "RUNPOD_PUBLIC_SERVERLESS_24GB_FLEX_PRICING", gpu_rate_environment_override_used: false, gpu_type_ids: gpuTypeIds, public_pricing_verified_at: RUNPOD_PUBLIC_PRICING_VERIFIED_AT };
}
async function runpodHealth(endpointId, apiKey) { const response = await fetch(`${RUNPOD_API_BASE}/${encodeURIComponent(endpointId)}/health`, { headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" }, signal: AbortSignal.timeout(20000) }); const raw = await response.text(); let body = {}; try { body = raw ? JSON.parse(raw) : {}; } catch {} if (!response.ok) throw new Error(`AVANTIQO_MUSIC_RUNPOD_HEALTH_FAILED:${response.status}`); return body; }
async function runpodRest(path, managementKey) { const response = await fetch(`${RUNPOD_REST_BASE}${path}`, { headers: { Authorization: `Bearer ${managementKey}`, Accept: "application/json" }, signal: AbortSignal.timeout(20000) }); const raw = await response.text(); let body = null; try { body = raw ? JSON.parse(raw) : null; } catch {} if (!response.ok) throw new Error(`AVANTIQO_MUSIC_RUNPOD_MANAGEMENT_FAILED:${response.status}`); return body; }
async function resolveEndpointTemplate(endpoint, managementKey) { const inline = object(endpoint?.template); if (Object.keys(inline).length) return inline; const templateId = text(endpoint?.templateId); if (!templateId) throw new Error("AVANTIQO_MUSIC_PREFLIGHT_TEMPLATE_ID_REQUIRED"); const templates = await runpodRest("/templates?includeEndpointBoundTemplates=true&includePublicTemplates=false&includeRunpodTemplates=false", managementKey); const matches = Array.isArray(templates) ? templates.filter((template) => text(template?.id) === templateId) : []; if (matches.length !== 1) throw new Error("AVANTIQO_MUSIC_PREFLIGHT_TEMPLATE_RESOLUTION_FAILED"); return matches[0]; }

const apiKey = text(process.env.RUNPOD_AVANTIQO_AUDIO_API_KEY) || required("RUNPOD_API_KEY");
const managementKey = required("RUNPOD_MANAGEMENT_API_KEY");
const endpointId = required("RUNPOD_AVANTIQO_AUDIO_ENDPOINT_ID");
const supabaseUrl = required("NEXT_PUBLIC_SUPABASE_URL");
const serviceRoleKey = required("SUPABASE_SERVICE_ROLE_KEY");

const [health, endpoint, volumes] = await Promise.all([
  runpodHealth(endpointId, apiKey),
  runpodRest(`/endpoints/${encodeURIComponent(endpointId)}?includeTemplate=true&includeWorkers=true`, managementKey),
  runpodRest("/networkvolumes", managementKey),
]);

if (text(endpoint?.id) !== endpointId) throw new Error("AVANTIQO_MUSIC_PREFLIGHT_ENDPOINT_ID_MISMATCH");
if (text(endpoint?.name) !== AUDIO_ENDPOINT_NAME) throw new Error("AVANTIQO_MUSIC_PREFLIGHT_ENDPOINT_NAME_MISMATCH");
if (finite(endpoint?.workersMin, -1) !== 0) throw new Error("AVANTIQO_MUSIC_PREFLIGHT_SCALE_TO_ZERO_REQUIRED");
if (!Array.isArray(volumes)) throw new Error("AVANTIQO_MUSIC_PREFLIGHT_NETWORK_VOLUME_LIST_INVALID");
assertSharedVolumeGroupCompatible(volumes, AUDIO_VOICE_GROUP);
const gpuEconomics = resolveGpuEconomics(endpoint);

const attachedVolumeIds = endpointVolumeIds(endpoint);
const attachedVolumes = volumes.filter((volume) => attachedVolumeIds.includes(text(volume?.id)));
if (!attachedVolumeIds.length || attachedVolumes.length !== attachedVolumeIds.length) throw new Error("AVANTIQO_MUSIC_PREFLIGHT_AUDIO_VOLUME_REQUIRED");
if (attachedVolumes.some((volume) => classifyManagedVolumeName(volume?.name)?.id !== AUDIO_VOICE_GROUP.id)) throw new Error("AVANTIQO_MUSIC_PREFLIGHT_AUDIO_VOLUME_WRONG_GROUP");
const reusableAudioVoiceVolume = resolveReusableGroupVolume(volumes, AUDIO_VOICE_GROUP);
if (!reusableAudioVoiceVolume.volume || !attachedVolumeIds.includes(text(reusableAudioVoiceVolume.volume.id))) throw new Error("AVANTIQO_MUSIC_PREFLIGHT_AUDIO_SHARED_VOLUME_NOT_ATTACHED");

const template = await resolveEndpointTemplate(endpoint, managementKey);
const env = normalizeEnv(template?.env);
for (const [key, expected] of Object.entries({ ACESTEP_CHECKPOINTS_DIR: NETWORK_VOLUME_CHECKPOINT_ROOT, HF_HOME: `${NETWORK_VOLUME_CHECKPOINT_ROOT}/.hf-cache`, AVANTIQO_AUDIO_FOUNDATION_MODEL: EXPECTED_FOUNDATION_MODEL, AVANTIQO_AUDIO_MODEL_VARIANT: EXPECTED_VARIANT, AVANTIQO_AUDIO_CERTIFIED_CAPABILITIES: "ai.music.generate", ACESTEP_INIT_LLM: "false" })) {
  if (env[key] !== expected) throw new Error(`AVANTIQO_MUSIC_PREFLIGHT_TEMPLATE_ENV_INVALID:${key}`);
}

const jobs = object(health?.jobs);
if (finite(jobs.inQueue ?? jobs.in_queue, 0) > 0 || finite(jobs.inProgress ?? jobs.in_progress, 0) > 0) throw new Error("AVANTIQO_MUSIC_PREFLIGHT_ENDPOINT_NOT_QUIET");

const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
const probePath = `benchmark-preflight/music/${crypto.randomUUID()}.wav`;
const { data: signedUpload, error: uploadError } = await supabase.storage.from(STORAGE_BUCKET).createSignedUploadUrl(probePath, { upsert: false });
if (uploadError || !signedUpload?.signedUrl) throw new Error("AVANTIQO_MUSIC_SUPABASE_SIGN_UPLOAD_FAILED");
const { data: signedRead, error: readError } = await supabase.storage.from(STORAGE_BUCKET).createSignedUrl(probePath, 60);
if (readError || !signedRead?.signedUrl) throw new Error("AVANTIQO_MUSIC_SUPABASE_SIGN_READ_FAILED");

console.log(JSON.stringify({ success: true, contract: "AVANTIQO_MUSIC_LOCAL_PREFLIGHT_V2", endpoint: { configured: true, exact_audio_identity: true, workers_min: 0, scale_to_zero: true, quiet_for_controlled_benchmark: true, gpu_type_ids: gpuEconomics.gpu_type_ids }, model_cache: { shared_volume_group: AUDIO_VOICE_GROUP.id, shared_volume_name: text(reusableAudioVoiceVolume.volume.name), shared_volume_resolution: reusableAudioVoiceVolume.resolution, shared_volume_policy_scope: AUDIO_VOICE_GROUP.id, shared_volume_policy_compliant: true, persistent: true }, model_contract: { foundation_model: EXPECTED_FOUNDATION_MODEL, variant: EXPECTED_VARIANT, certified_capabilities: ["ai.music.generate"] }, economics: gpuEconomics, ready_for_controlled_benchmark: true, safety: { shared_volume_policy_verified: true, runpod_generation_jobs_submitted: 0, endpoint_mutations_performed: 0, production_deploy_performed: false, secret_values_printed: false } }, null, 2));
