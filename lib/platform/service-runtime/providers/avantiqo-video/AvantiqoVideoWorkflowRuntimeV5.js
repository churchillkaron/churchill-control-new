import { getServiceSupabase } from "@/lib/shared/supabase/service";
import { resolveCreativeProviderAssetUrl } from "@/lib/creative/assets/storage/resolveCreativeProviderAssetUrl";
import {
  AVANTIQO_VIDEO_STUDIO_NO_UPSCALE_MASTER_CONTRACT,
  AVANTIQO_VIDEO_STUDIO_NO_UPSCALE_MASTER_MODEL,
  renderCreativeVideoStudioNoUpscaleMaster,
} from "@/lib/creative/video/runtime/CreativeVideoStudioNoUpscaleMasterRuntime";
import {
  abortAvantiqoVideoLtx25Generation,
  getAvantiqoVideoLtx25GenerationStatus,
  submitAvantiqoVideoLtx25Generation,
  AVANTIQO_VIDEO_LTX25_MODEL,
  AVANTIQO_VIDEO_LTX25_PRODUCTION_GPU,
  AVANTIQO_VIDEO_LTX25_HERO_GPU,
} from "./AvantiqoVideoLtx25PodRuntime.js";

export const AVANTIQO_VIDEO_WORKFLOW_V5_CONTRACT = "AVANTIQO_VIDEO_OWNED_LTX25_WORKFLOW_V5";
export const AVANTIQO_VIDEO_WORKFLOW_V5_JOB_PREFIX = "video-workflow-v5:";

const BUCKET = "creative-assets";
const ROUTABLE = new Set(["ai.video.generate", "ai.video.image_to_video"]);

function text(value) { return String(value ?? "").trim(); }
function object(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function safeId(value) { return text(value).replace(/[^A-Za-z0-9_-]/g, ""); }

function identity(input = {}) {
  const organizationId = text(input.context?.organization_id);
  const usageId = text(input.context?.usage_id);
  if (!organizationId) throw new Error("organization_id required");
  if (!usageId) throw new Error("usage_id required");
  return { organizationId, usageId };
}

function qualityLane(input = {}) {
  const generation = object(input.generation);
  const parameters = { ...object(generation.provider_parameters), ...object(input.provider_parameters) };
  const value = text(input.quality_lane || input.qualityLane || parameters.quality_lane || parameters.qualityLane).toLowerCase();
  return ["hero", "film"].includes(value) ? "hero" : "production";
}

function statePath(organizationId, usageId) {
  const org = safeId(organizationId);
  const usage = safeId(usageId);
  if (!org || !usage) throw new Error("AVANTIQO_VIDEO_WORKFLOW_V5_IDENTITY_INVALID");
  return `${org}/generated/avantiqo-video/.workflow-v5/${usage}.json`;
}

function finalPath(organizationId, usageId) {
  const usage = safeId(usageId);
  if (!usage) throw new Error("AVANTIQO_VIDEO_WORKFLOW_V5_USAGE_INVALID");
  return `${organizationId}/generated/avantiqo-video/${usage}.mp4`;
}

function workflowId(usageId) {
  return `${AVANTIQO_VIDEO_WORKFLOW_V5_JOB_PREFIX}${usageId}`;
}

function workflowUsageId(value) {
  const raw = text(value);
  return raw.startsWith(AVANTIQO_VIDEO_WORKFLOW_V5_JOB_PREFIX)
    ? raw.slice(AVANTIQO_VIDEO_WORKFLOW_V5_JOB_PREFIX.length)
    : null;
}

async function writeState(state) {
  const bytes = new TextEncoder().encode(JSON.stringify(state));
  const { error } = await getServiceSupabase().storage.from(BUCKET).upload(
    statePath(state.organization_id, state.usage_id),
    bytes,
    { contentType: "application/json", upsert: true },
  );
  if (error) throw error;
}

async function readState(organizationId, usageId) {
  const { data, error } = await getServiceSupabase().storage.from(BUCKET).download(statePath(organizationId, usageId));
  if (error) {
    const status = Number(error?.statusCode ?? error?.status ?? 0);
    const message = text(error?.message).toLowerCase();
    if ([400, 404].includes(status) || message.includes("not found") || message.includes("object not found")) return null;
    throw error;
  }
  const parsed = JSON.parse(await data.text());
  if (parsed?.contract !== AVANTIQO_VIDEO_WORKFLOW_V5_CONTRACT) {
    throw new Error("AVANTIQO_VIDEO_WORKFLOW_V5_STATE_CONTRACT_INVALID");
  }
  return parsed;
}

async function persistFinal({ organizationId, usageId, buffer }) {
  const path = finalPath(organizationId, usageId);
  const { error } = await getServiceSupabase().storage.from(BUCKET).upload(path, buffer, {
    contentType: "video/mp4",
    upsert: true,
  });
  if (error) throw error;
  const storageReference = `storage://${BUCKET}/${path}`;
  const videoUrl = await resolveCreativeProviderAssetUrl({ organization_id: organizationId, value: storageReference });
  if (!videoUrl) throw new Error("AVANTIQO_VIDEO_WORKFLOW_V5_SIGNED_OUTPUT_REQUIRED");
  return { storageReference, videoUrl };
}

function queued(state) {
  return {
    success: true,
    provider: "avantiqo-video",
    model: "avantiqo-ltx-2.5",
    output: {
      provider_job_id: workflowId(state.usage_id),
      status: state.stage === "COMPLETED" ? "completed" : state.stage === "FAILED" ? "failed" : "queued",
      stage: state.stage,
      workflow_contract: AVANTIQO_VIDEO_WORKFLOW_V5_CONTRACT,
      route: "OWNED_LTX25_BLACKWELL",
      generation_backend: "OWNED_LTX25_DFR",
      foundation_model: AVANTIQO_VIDEO_LTX25_MODEL,
      quality_lane: state.quality_lane,
      gpu_type_id: state.gpu_type_id,
      internal_generation_resolution: state.internal_generation_resolution || "native-4k",
      final_master_resolution: "4k",
      pixel_720p_stage_used: false,
      lanczos_upscale_used: false,
      external_provider_contacted: false,
      prompt_persisted: false,
      runpod_lease_active: state.pod_lease_active === true,
      ...(state.failure_code ? { error: state.failure_code } : {}),
      ...(state.final_storage_reference ? {
        storage_reference: state.final_storage_reference,
        video_url: state.final_video_url,
        result: state.final_video_url,
      } : {}),
    },
  };
}

function completed(state, signedUrl = null) {
  const videoUrl = signedUrl || state.final_video_url;
  return {
    provider: "avantiqo-video",
    provider_job_id: workflowId(state.usage_id),
    status: "completed",
    stage: "COMPLETED",
    video_url: videoUrl,
    result: videoUrl,
    storage_reference: state.final_storage_reference,
    workflow_contract: AVANTIQO_VIDEO_WORKFLOW_V5_CONTRACT,
    route: "OWNED_LTX25_BLACKWELL",
    generation_backend: "OWNED_LTX25_DFR",
    foundation_model: AVANTIQO_VIDEO_LTX25_MODEL,
    quality_lane: state.quality_lane,
    gpu_type_id: state.gpu_type_id,
    internal_generation_resolution: state.internal_generation_resolution,
    final_master_resolution: "4k",
    master_contract: state.master_contract,
    master_model: state.master_model,
    master_backend: state.master_backend,
    native_audio_generated: state.native_audio_generated === true,
    native_audio_preserved: state.native_audio_preserved === true,
    learned_spatial_upscaler_used: state.learned_spatial_upscaler_used === true,
    detailing_dfr_used: state.detailing_dfr_used === true,
    pixel_720p_stage_used: false,
    pixel_upscale_used: false,
    lanczos_upscale_used: false,
    external_provider_contacted: false,
    customer_visible_provider: "avantiqo-video",
  };
}

async function finalizeNative4k(state, generationOutput) {
  const sourceReference = text(generationOutput.storage_reference);
  if (!sourceReference) throw new Error("AVANTIQO_VIDEO_WORKFLOW_V5_NATIVE_4K_SOURCE_REQUIRED");
  const sourceUrl = await resolveCreativeProviderAssetUrl({ organization_id: state.organization_id, value: sourceReference });
  if (!sourceUrl) throw new Error("AVANTIQO_VIDEO_WORKFLOW_V5_NATIVE_4K_URL_REQUIRED");

  state.stage = "STUDIO_NATIVE_4K_FINALIZING";
  state.pod_lease_active = false;
  state.internal_generation_resolution = text(generationOutput.internal_generation_resolution);
  state.gpu_type_id = text(state.pod_job?.gpu_type_id) || null;
  state.native_audio_generated = generationOutput.native_audio_generated === true;
  state.learned_spatial_upscaler_used = generationOutput.learned_spatial_upscaler_used === true;
  state.detailing_dfr_used = generationOutput.detailing_dfr_used === true;
  state.master_contract = AVANTIQO_VIDEO_STUDIO_NO_UPSCALE_MASTER_CONTRACT;
  state.master_model = AVANTIQO_VIDEO_STUDIO_NO_UPSCALE_MASTER_MODEL;
  state.updated_at = new Date().toISOString();
  await writeState(state);

  const master = await renderCreativeVideoStudioNoUpscaleMaster({
    organization_id: state.organization_id,
    source_url: sourceUrl,
  });
  if (
    master?.success !== true ||
    master.pixel_upscale_used !== false ||
    master.lanczos_upscale_used !== false ||
    master.external_provider_contacted !== false ||
    !Buffer.isBuffer(master.buffer) ||
    !master.buffer.length
  ) {
    throw new Error("AVANTIQO_VIDEO_WORKFLOW_V5_MASTER_BOUNDARY_INVALID");
  }
  const persisted = await persistFinal({
    organizationId: state.organization_id,
    usageId: state.usage_id,
    buffer: master.buffer,
  });
  state.stage = "COMPLETED";
  state.final_storage_reference = persisted.storageReference;
  state.final_video_url = persisted.videoUrl;
  state.master_backend = master.backend;
  state.native_audio_preserved = master.native_audio_preserved === true;
  state.pixel_720p_stage_used = false;
  state.pixel_upscale_used = false;
  state.lanczos_upscale_used = false;
  state.external_provider_contacted = false;
  state.updated_at = new Date().toISOString();
  await writeState(state);
  return completed(state);
}

export const AvantiqoVideoWorkflowRuntimeV5 = {
  async execute(input = {}) {
    const capability = text(input.capability);
    if (!ROUTABLE.has(capability)) {
      throw new Error(`AVANTIQO_VIDEO_WORKFLOW_V5_CAPABILITY_UNSUPPORTED:${capability || "MISSING"}`);
    }
    const { organizationId, usageId } = identity(input);
    const existing = await readState(organizationId, usageId);
    if (existing) return queued(existing);

    const lane = qualityLane(input);
    let podJob = null;
    try {
      podJob = await submitAvantiqoVideoLtx25Generation({
        ...input,
        resolution: "native-4k",
        quality_lane: lane,
        generation: {
          ...object(input.generation),
          resolution: "native-4k",
        },
      });
    } catch (error) {
      // New work fails closed. No WAN, Veo, FAL, or managed-provider fallback is permitted.
      throw error;
    }

    const state = {
      contract: AVANTIQO_VIDEO_WORKFLOW_V5_CONTRACT,
      organization_id: organizationId,
      usage_id: usageId,
      capability,
      stage: "LTX25_GENERATION",
      route: "OWNED_LTX25_BLACKWELL",
      generation_backend: "OWNED_LTX25_DFR",
      foundation_model: AVANTIQO_VIDEO_LTX25_MODEL,
      quality_lane: lane,
      expected_gpu_type_id: lane === "hero" ? AVANTIQO_VIDEO_LTX25_HERO_GPU : AVANTIQO_VIDEO_LTX25_PRODUCTION_GPU,
      gpu_type_id: podJob.gpu_type_id,
      pod_job: podJob,
      pod_lease_active: true,
      internal_generation_resolution: "native-4k",
      final_master_resolution: "4k",
      master_contract: AVANTIQO_VIDEO_STUDIO_NO_UPSCALE_MASTER_CONTRACT,
      master_model: AVANTIQO_VIDEO_STUDIO_NO_UPSCALE_MASTER_MODEL,
      final_storage_reference: null,
      final_video_url: null,
      pixel_720p_stage_used: false,
      pixel_upscale_used: false,
      lanczos_upscale_used: false,
      external_provider_contacted: false,
      prompt_persisted: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    try {
      await writeState(state);
    } catch (error) {
      await abortAvantiqoVideoLtx25Generation(podJob, "VIDEO_WORKFLOW_V5_STATE_PERSIST_FAILED");
      throw error;
    }
    return queued(state);
  },

  async getStatus(input = {}) {
    const supplied = input.job_id || input.jobId || input.provider_job_id;
    const usageFromJob = workflowUsageId(supplied);
    const { organizationId, usageId } = identity(input);
    if (!usageFromJob || usageFromJob !== usageId) {
      throw new Error("AVANTIQO_VIDEO_WORKFLOW_V5_JOB_USAGE_MISMATCH");
    }
    const state = await readState(organizationId, usageId);
    if (!state) throw new Error("AVANTIQO_VIDEO_WORKFLOW_V5_STATE_MISSING");

    if (state.stage === "COMPLETED") {
      const signed = await resolveCreativeProviderAssetUrl({ organization_id: organizationId, value: state.final_storage_reference });
      return completed(state, signed);
    }
    if (state.stage === "FAILED") {
      return {
        provider: "avantiqo-video",
        provider_job_id: workflowId(usageId),
        status: "failed",
        stage: "FAILED",
        error: state.failure_code || "AVANTIQO_VIDEO_WORKFLOW_V5_FAILED",
        runpod_lease_active: false,
        external_provider_contacted: false,
      };
    }
    if (state.stage !== "LTX25_GENERATION") {
      return queued(state);
    }

    const result = await getAvantiqoVideoLtx25GenerationStatus({ organizationId, job: state.pod_job });
    if (result.status === "processing") {
      state.pod_lease_active = true;
      if (result.lease_expires_at) state.pod_job.lease_expires_at = result.lease_expires_at;
      state.updated_at = new Date().toISOString();
      await writeState(state);
      return {
        provider: "avantiqo-video",
        provider_job_id: workflowId(usageId),
        status: "processing",
        stage: "GENERATION",
        phase: result.phase || "LTX25_DFR_GENERATION",
        route: "OWNED_LTX25_BLACKWELL",
        quality_lane: state.quality_lane,
        gpu_type_id: state.gpu_type_id,
        runpod_lease_active: true,
        external_provider_contacted: false,
      };
    }
    if (result.status === "failed") {
      state.stage = "FAILED";
      state.failure_code = text(result.error) || "AVANTIQO_VIDEO_LTX25_GENERATION_FAILED";
      state.pod_lease_active = false;
      state.updated_at = new Date().toISOString();
      await writeState(state);
      return {
        provider: "avantiqo-video",
        provider_job_id: workflowId(usageId),
        status: "failed",
        stage: "FAILED",
        error: state.failure_code,
        runpod_lease_active: false,
        external_provider_contacted: false,
      };
    }
    if (result.status !== "completed" || !result.output?.storage_reference) {
      throw new Error("AVANTIQO_VIDEO_WORKFLOW_V5_COMPLETION_INVALID");
    }
    try {
      return await finalizeNative4k(state, result.output);
    } catch (error) {
      state.stage = "FAILED";
      state.failure_code = text(error?.message || error).split(":")[0] || "AVANTIQO_VIDEO_WORKFLOW_V5_MASTER_FAILED";
      state.pod_lease_active = false;
      state.updated_at = new Date().toISOString();
      await writeState(state).catch(() => null);
      return {
        provider: "avantiqo-video",
        provider_job_id: workflowId(usageId),
        status: "failed",
        stage: "FAILED",
        error: state.failure_code,
        runpod_lease_active: false,
        external_provider_contacted: false,
      };
    }
  },
};
