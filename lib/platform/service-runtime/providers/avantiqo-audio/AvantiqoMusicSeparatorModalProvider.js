import { resolveCreativeProviderAssetUrl } from "@/lib/creative/assets/storage/resolveCreativeProviderAssetUrl";
import { getServiceSupabase } from "@/lib/shared/supabase/service";

const PROVIDER_ID = "avantiqo-audio";
const CAPABILITY = "ai.audio.stems";
const ENGINE_CONTRACT = "AVANTIQO_MUSIC_SEPARATOR_ENGINE_V1";
const MODEL = "demucs-htdemucs-ft";
const QUALITY_PROFILE = "DEMUCS_HTDEMUCS_FT_4STEM_V1";
const APP_NAME = "avantiqo-music-separator-owned";
const FUNCTION_NAME = "separate";
const JOB_PREFIX = "modal-music-separator:";
const OUTPUT_BUCKET = "creative-assets";
const OUTPUTS = Object.freeze({
  backing_track_wav: "wav",
  backing_track_mp3: "mp3",
  vocals: "wav",
  drums: "wav",
  bass: "wav",
  other: "wav",
});

let modalSdkPromise = null;
function text(value) { return String(value ?? "").trim(); }
function object(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function enabled(value) { return ["1", "true", "yes", "on"].includes(text(value).toLowerCase()); }

function modalConfig() {
  if (!enabled(process.env.AVANTIQO_AUDIO_ENGINE_ENABLED)) throw new Error("AVANTIQO_AUDIO_ENGINE_DISABLED");
  if (!enabled(process.env.AVANTIQO_MUSIC_SEPARATOR_ENGINE_ENABLED)) throw new Error("AVANTIQO_MUSIC_SEPARATOR_ENGINE_DISABLED");
  if (!enabled(process.env.AVANTIQO_MUSIC_SEPARATOR_ENGINE_CERTIFIED)) throw new Error("AVANTIQO_MUSIC_SEPARATOR_ENGINE_NOT_CERTIFIED");
  const tokenId = text(process.env.MODAL_TOKEN_ID || process.env.AVANTIQO_MODAL_TOKEN_ID);
  const tokenSecret = text(process.env.MODAL_TOKEN_SECRET || process.env.AVANTIQO_MODAL_TOKEN_SECRET);
  if (!tokenId) throw new Error("AVANTIQO_MUSIC_SEPARATOR_MODAL_TOKEN_ID_REQUIRED");
  if (!tokenSecret) throw new Error("AVANTIQO_MUSIC_SEPARATOR_MODAL_TOKEN_SECRET_REQUIRED");
  return { tokenId, tokenSecret, environment: text(process.env.AVANTIQO_MUSIC_SEPARATOR_MODAL_ENVIRONMENT || process.env.MODAL_ENVIRONMENT) };
}

async function modalClient(config) {
  if (!modalSdkPromise) modalSdkPromise = import("modal");
  const sdk = await modalSdkPromise;
  return { sdk, client: new sdk.ModalClient({ tokenId: config.tokenId, tokenSecret: config.tokenSecret }) };
}

async function outputUploads({ organizationId, usageId }) {
  const supabase = getServiceSupabase();
  const uploads = {};
  for (const [key, extension] of Object.entries(OUTPUTS)) {
    const path = `${organizationId}/generated/music-separator/${usageId}/${key}.${extension}`;
    const { data, error } = await supabase.storage.from(OUTPUT_BUCKET).createSignedUploadUrl(path, { upsert: false });
    if (error) throw error;
    if (!data?.signedUrl) throw new Error(`AVANTIQO_MUSIC_SEPARATOR_UPLOAD_URL_REQUIRED:${key}`);
    uploads[key] = { signed_url: data.signedUrl, storage_reference: `storage://${OUTPUT_BUCKET}/${path}` };
  }
  return uploads;
}

function rightsAttestation(input = {}) {
  const attestation = object(input.rights_attestation || input.requirements?.rights_attestation || input.metadata?.rights_attestation || input.provider_parameters?.rights_attestation);
  return {
    contract: text(attestation.contract) || "AVANTIQO_SOURCE_AUDIO_RIGHTS_ATTESTATION_V1",
    confirmed: attestation.confirmed === true,
    content_restriction_policy: text(attestation.content_restriction_policy) || "USER_RIGHTS_ATTESTATION_ONLY",
  };
}

function processing(input = {}) {
  const parameters = object(input.provider_parameters);
  return {
    remove_vocals: true,
    preserve_arrangement: parameters.preserve_arrangement !== false,
    key_shift_semitones: Number(parameters.key_shift_semitones || 0),
    tempo_ratio: Number(parameters.tempo_ratio || 1),
    count_in_bars: Number(parameters.count_in_bars || 0),
    bpm: Number.isFinite(Number(parameters.bpm)) ? Number(parameters.bpm) : null,
    export_stems: parameters.export_stems !== false,
    vocal_cleanup_required: true,
  };
}

function zeroPollTimeout(error, sdk) {
  const code = text(error?.code || error?.name).toUpperCase();
  return code.includes("TIMEOUT") || (sdk?.FunctionCallGetTimeoutError && error instanceof sdk.FunctionCallGetTimeoutError);
}

export const AvantiqoMusicSeparatorModalProvider = {
  id: PROVIDER_ID,
  async execute(input = {}) {
    if (text(input.capability) !== CAPABILITY) throw new Error(`AVANTIQO_MUSIC_SEPARATOR_CAPABILITY_NOT_SUPPORTED:${text(input.capability)}`);
    const organizationId = text(input.context?.organization_id);
    const organizationServiceId = text(input.context?.organization_service_id);
    const usageId = text(input.context?.usage_id);
    if (!organizationId || !organizationServiceId || !usageId) throw new Error("AVANTIQO_MUSIC_SEPARATOR_GOVERNED_SERVICE_EXECUTION_REQUIRED");
    const sourceAudio = await resolveCreativeProviderAssetUrl({ organization_id: organizationId, value: input.source_audio || input.sourceAudio || input.audio });
    if (!sourceAudio) throw new Error("AVANTIQO_MUSIC_SEPARATOR_SOURCE_AUDIO_REQUIRED");
    const attestation = rightsAttestation(input);
    if (attestation.confirmed !== true) throw new Error("AVANTIQO_MUSIC_SEPARATOR_SOURCE_RIGHTS_CONFIRMATION_REQUIRED");
    const uploads = await outputUploads({ organizationId, usageId });
    const config = modalConfig();
    const { client } = await modalClient(config);
    const lookup = config.environment ? { environment: config.environment } : {};
    const worker = await client.functions.fromName(APP_NAME, FUNCTION_NAME, lookup);
    const payload = {
      contract: ENGINE_CONTRACT,
      capability: CAPABILITY,
      model: MODEL,
      quality_profile: QUALITY_PROFILE,
      source_audio: sourceAudio,
      rights_attestation: attestation,
      output_uploads: uploads,
      processing: processing(input),
    };
    const call = await worker.spawn([payload]);
    const rawJobId = text(call.functionCallId);
    if (!rawJobId) throw new Error("AVANTIQO_MUSIC_SEPARATOR_MODAL_CALL_ID_REQUIRED");
    return { success: true, provider: PROVIDER_ID, model: MODEL, output: { provider_job_id: `${JOB_PREFIX}${rawJobId}`, status: "queued", engine_contract: ENGINE_CONTRACT, capability: CAPABILITY, infrastructure_provider: "MODAL_DIRECT_ASYNC_V1", raw_reasoning_persisted: false } };
  },

  async getStatus(input = {}) {
    const organizationId = text(input.context?.organization_id);
    const jobId = text(input.job_id || input.jobId || input.provider_job_id);
    if (!organizationId) throw new Error("organization_id required");
    if (!jobId.startsWith(JOB_PREFIX)) throw new Error("AVANTIQO_MUSIC_SEPARATOR_MODAL_JOB_ID_REQUIRED");
    const rawJobId = jobId.slice(JOB_PREFIX.length);
    const config = modalConfig();
    const { sdk, client } = await modalClient(config);
    const call = await client.functionCalls.fromId(rawJobId);
    try {
      const result = await call.get({ timeoutMs: 0 });
      if (result?.success === false) return { status: "failed", provider_job_id: jobId, error: text(result?.error || "AVANTIQO_MUSIC_SEPARATOR_MODAL_EXECUTION_FAILED") };
      return { status: "completed", provider_job_id: jobId, output: result, infrastructure_provider: "MODAL_DIRECT_ASYNC_V1", raw_reasoning_persisted: false };
    } catch (error) {
      if (zeroPollTimeout(error, sdk)) return { status: "processing", provider_job_id: jobId, infrastructure_provider: "MODAL_DIRECT_ASYNC_V1", raw_reasoning_persisted: false };
      return { status: "failed", provider_job_id: jobId, error: `AVANTIQO_MUSIC_SEPARATOR_MODAL_EXECUTION_FAILED:${text(error?.message || error)}` };
    }
  },
};

export const AVANTIQO_MUSIC_SEPARATOR_MODAL_JOB_PREFIX = JOB_PREFIX;
