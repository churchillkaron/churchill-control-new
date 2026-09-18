import { resolveCreativeProviderAssetUrl } from "@/lib/creative/assets/storage/resolveCreativeProviderAssetUrl";
import { getServiceSupabase } from "@/lib/shared/supabase/service";

const PROVIDER_ID = "avantiqo-audio";
const NODE_ID = "avantiqo-node-01";
const JOB_PREFIX = "local-node01-music:";
const OUTPUT_BUCKET = "creative-assets";
const NODE_FRESHNESS_MS = 120_000;
const CAPABILITIES = Object.freeze({
  "ai.music.generate": Object.freeze({
    workload: "music_generation",
    lane: "cpu",
    model: "ACE-Step/Ace-Step1.5",
    contract: "AVANTIQO_AUDIO_ENGINE_V1",
    quality_profile: "ACE_STEP_1_5_CPU_FLOAT32_LOCAL_V1",
    outputs: Object.freeze({ audio_wav: "wav" }),
  }),
  "ai.audio.stems": Object.freeze({
    workload: "music_separator",
    model: "demucs-htdemucs-ft",
    contract: "AVANTIQO_MUSIC_SEPARATOR_ENGINE_V1",
    quality_profile: "DEMUCS_HTDEMUCS_FT_4STEM_V1",
    outputs: Object.freeze({ backing_track_wav: "wav", backing_track_mp3: "mp3", vocals: "wav", drums: "wav", bass: "wav", other: "wav" }),
  }),
  "ai.audio.vocal-role-separate": Object.freeze({
    workload: "music_vocal_role_separator",
    model: "demucs-htdemucs-ft+UVR_MDXNET_KARA_2",
    contract: "AVANTIQO_MUSIC_VOCAL_ROLE_SEPARATOR_ENGINE_V1",
    quality_profile: "DEMUCS_HTDEMUCS_FT_PLUS_UVR_KARA2_VOCAL_ROLE_RESEARCH_V1",
    outputs: Object.freeze({ lead_vocal: "wav", supporting_vocals: "wav", instrumental: "wav", role_report_json: "json" }),
  }),
  "ai.audio.vocal-correct": Object.freeze({
    workload: "music_vocal_correction",
    model: "torchcrepe-full",
    contract: "AVANTIQO_MUSIC_VOCAL_CORRECTION_ENGINE_V2",
    quality_profile: "TORCHCREPE_SIGNALSMITH_VOCAL_CORRECTION_V2",
    outputs: Object.freeze({ corrected_vocal_wav: "wav", correction_report_json: "json" }),
  }),
});

function text(value) { return String(value ?? "").trim(); }
function object(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function enabled(value) { return ["1", "true", "yes", "on"].includes(text(value).toLowerCase()); }
function capabilityConfig(capability) { return CAPABILITIES[text(capability)] || null; }

function localLaneEnabled() {
  if (!enabled(process.env.AVANTIQO_MUSIC_LOCAL_NODE_ENABLED)) return false;
  if (process.env.NODE_ENV === "production") return enabled(process.env.AVANTIQO_MUSIC_LOCAL_NODE_PRODUCTION_CERTIFIED);
  return enabled(process.env.AVANTIQO_MUSIC_LOCAL_NODE_LIVE_ACCEPTANCE_ENABLED) || enabled(process.env.AVANTIQO_MUSIC_LOCAL_NODE_PRODUCTION_CERTIFIED);
}

async function healthyNodeFor(capability) {
  if (!localLaneEnabled()) return null;
  const supabase = getServiceSupabase();
  const { data, error } = await supabase
    .from("avantiqo_local_compute_nodes")
    .select("id,enabled,capabilities,last_seen_at,metadata")
    .eq("id", NODE_ID)
    .maybeSingle();
  if (error || !data?.enabled || !Array.isArray(data.capabilities) || !data.capabilities.includes(capability)) return null;
  const seen = Date.parse(data.last_seen_at || "");
  if (!Number.isFinite(seen) || Date.now() - seen > NODE_FRESHNESS_MS) return null;
  return data;
}

async function outputUploads({ organizationId, usageId, config }) {
  const supabase = getServiceSupabase();
  const safeUsage = text(usageId).replace(/[^A-Za-z0-9_-]/g, "");
  if (!organizationId || !safeUsage) throw new Error("AVANTIQO_MUSIC_LOCAL_NODE_STORAGE_SCOPE_REQUIRED");
  const uploads = {};
  for (const [key, extension] of Object.entries(config.outputs)) {
    const path = `${organizationId}/generated/local-node01-music/${safeUsage}/${key}.${extension}`;
    const { data, error } = await supabase.storage.from(OUTPUT_BUCKET).createSignedUploadUrl(path, { upsert: false });
    if (error) throw error;
    if (!data?.signedUrl) throw new Error(`AVANTIQO_MUSIC_LOCAL_NODE_UPLOAD_URL_REQUIRED:${key}`);
    uploads[key] = { signed_url: data.signedUrl, storage_reference: `storage://${OUTPUT_BUCKET}/${path}` };
  }
  return uploads;
}

function rightsAttestation(input = {}) {
  const parameters = object(input.provider_parameters);
  const source = object(parameters.rights_attestation || input.requirements?.rights_attestation || input.metadata?.rights_attestation);
  return {
    contract: text(source.contract) || "AVANTIQO_SOURCE_AUDIO_RIGHTS_ATTESTATION_V1",
    confirmed: source.confirmed === true,
    content_restriction_policy: text(source.content_restriction_policy) || "USER_RIGHTS_ATTESTATION_ONLY",
  };
}

function separatorPayload({ input, sourceAudio, uploads, config }) {
  const parameters = object(input.provider_parameters);
  const attestation = rightsAttestation(input);
  if (attestation.confirmed !== true) throw new Error("AVANTIQO_MUSIC_LOCAL_NODE_SOURCE_RIGHTS_CONFIRMATION_REQUIRED");
  return {
    contract: config.contract,
    capability: "ai.audio.stems",
    model: config.model,
    quality_profile: config.quality_profile,
    source_audio: sourceAudio,
    rights_attestation: attestation,
    output_uploads: uploads,
    processing: {
      remove_vocals: true,
      preserve_arrangement: parameters.preserve_arrangement !== false,
      key_shift_semitones: Number(parameters.key_shift_semitones || 0),
      tempo_ratio: Number(parameters.tempo_ratio || 1),
      count_in_bars: Number(parameters.count_in_bars || 0),
      bpm: Number.isFinite(Number(parameters.bpm)) ? Number(parameters.bpm) : null,
      export_stems: parameters.export_stems !== false,
      vocal_cleanup_required: true,
    },
  };
}

function vocalRolePayload({ input, sourceAudio, uploads, config }) {
  const attestation = rightsAttestation(input);
  if (attestation.confirmed !== true) throw new Error("AVANTIQO_MUSIC_LOCAL_NODE_SOURCE_RIGHTS_CONFIRMATION_REQUIRED");
  return { contract: config.contract, capability: "ai.audio.vocal-role-separate", model: config.model, quality_profile: config.quality_profile, source_audio: sourceAudio, rights_attestation: attestation, output_uploads: uploads, certification: { research_candidate: true, production_certified: false, production_routing_allowed: false, human_listening_review_required: true, model_license_verified: false } };
}

function generationPayload({ input, uploads, config }) {
  return {
    contract: config.contract,
    capability: "ai.music.generate",
    model: config.model,
    quality_profile: config.quality_profile,
    generation: object(input.generation),
    output_spec: object(input.output_spec),
    requirements: object(input.requirements),
    provider_parameters: object(input.provider_parameters),
    metadata: object(input.metadata),
    output_uploads: uploads,
  };
}

function vocalPayload({ input, sourceAudio, uploads, config }) {
  return {
    contract: config.contract,
    capability: "ai.audio.vocal-correct",
    model: config.model,
    structured_specification: {
      requirements: object(input.requirements),
      output_spec: object(input.output_spec),
      provider_parameters: object(input.provider_parameters),
      metadata: object(input.metadata),
    },
    source_asset_roles: { source_audio: sourceAudio },
    source_assets: [sourceAudio],
    output_uploads: uploads,
  };
}

export const AvantiqoMusicLocalNodeProvider = {
  id: PROVIDER_ID,
  async available(capability) {
    return Boolean(capabilityConfig(capability) && await healthyNodeFor(text(capability)));
  },
  async execute(input = {}) {
    const capability = text(input.capability);
    const config = capabilityConfig(capability);
    if (!config) throw new Error(`AVANTIQO_MUSIC_LOCAL_NODE_CAPABILITY_NOT_SUPPORTED:${capability || "UNKNOWN"}`);
    const organizationId = text(input.context?.organization_id);
    const organizationServiceId = text(input.context?.organization_service_id);
    const usageId = text(input.context?.usage_id);
    if (!organizationId || !organizationServiceId || !usageId) throw new Error("AVANTIQO_MUSIC_LOCAL_NODE_GOVERNED_SERVICE_EXECUTION_REQUIRED");
    const node = await healthyNodeFor(capability);
    if (!node) throw new Error("AVANTIQO_MUSIC_LOCAL_NODE_UNAVAILABLE");
    const generation = capability === "ai.music.generate";
    const sourceAudio = generation ? null : await resolveCreativeProviderAssetUrl({ organization_id: organizationId, value: input.source_audio || input.sourceAudio || input.audio });
    if (!generation && !sourceAudio) throw new Error("AVANTIQO_MUSIC_LOCAL_NODE_SOURCE_AUDIO_REQUIRED");
    const uploads = await outputUploads({ organizationId, usageId, config });
    const payload = generation
      ? generationPayload({ input, uploads, config })
      : capability === "ai.audio.stems"
        ? separatorPayload({ input, sourceAudio, uploads, config })
        : capability === "ai.audio.vocal-role-separate"
          ? vocalRolePayload({ input, sourceAudio, uploads, config })
          : vocalPayload({ input, sourceAudio, uploads, config });
    const supabase = getServiceSupabase();
    const { data, error } = await supabase.from("avantiqo_local_compute_jobs").insert({
      organization_id: organizationId,
      usage_id: usageId,
      capability,
      lane: config.lane || "gpu",
      workload: config.workload,
      model: config.model,
      payload,
      status: "QUEUED",
      priority: 50,
      max_attempts: 2,
    }).select("id").single();
    if (error) throw error;
    if (!data?.id) throw new Error("AVANTIQO_MUSIC_LOCAL_NODE_JOB_ID_REQUIRED");
    return {
      success: true,
      provider: PROVIDER_ID,
      model: config.model,
      output: {
        provider_job_id: `${JOB_PREFIX}${data.id}`,
        status: "queued",
        engine_contract: config.contract,
        capability,
        infrastructure_provider: "AVANTIQO_LOCAL_NODE_V1",
        node_id: node.id,
        raw_reasoning_persisted: false,
      },
    };
  },
  async getStatus(input = {}) {
    const organizationId = text(input.context?.organization_id);
    const jobId = text(input.job_id || input.jobId || input.provider_job_id);
    if (!organizationId) throw new Error("organization_id required");
    if (!jobId.startsWith(JOB_PREFIX)) throw new Error("AVANTIQO_MUSIC_LOCAL_NODE_JOB_ID_REQUIRED");
    const id = jobId.slice(JOB_PREFIX.length);
    const supabase = getServiceSupabase();
    const { data, error } = await supabase.from("avantiqo_local_compute_jobs")
      .select("id,organization_id,capability,status,result,metrics,error_code,node_id")
      .eq("id", id).eq("organization_id", organizationId).maybeSingle();
    if (error) throw error;
    if (!data) throw new Error("AVANTIQO_MUSIC_LOCAL_NODE_JOB_NOT_FOUND");
    const status = text(data.status).toUpperCase();
    if (["QUEUED", "LEASED", "RUNNING", "PROCESSING"].includes(status)) {
      return { status: status === "QUEUED" ? "queued" : "processing", provider_job_id: jobId, infrastructure_provider: "AVANTIQO_LOCAL_NODE_V1", node_id: data.node_id || NODE_ID, raw_reasoning_persisted: false };
    }
    if (status === "COMPLETED") {
      return { status: "completed", provider_job_id: jobId, output: object(data.result), metrics: object(data.metrics), infrastructure_provider: "AVANTIQO_LOCAL_NODE_V1", node_id: data.node_id || NODE_ID, raw_reasoning_persisted: false };
    }
    return { status: "failed", provider_job_id: jobId, error: text(data.error_code) || `AVANTIQO_MUSIC_LOCAL_NODE_${status || "FAILED"}`, infrastructure_provider: "AVANTIQO_LOCAL_NODE_V1", node_id: data.node_id || NODE_ID, raw_reasoning_persisted: false };
  },
};

export const AVANTIQO_MUSIC_LOCAL_NODE_JOB_PREFIX = JOB_PREFIX;
