import { getServiceSupabase } from "@/lib/shared/supabase/service";
import { resolveCreativeProviderAssetUrl } from "@/lib/creative/assets/storage/resolveCreativeProviderAssetUrl";
import {
  AVANTIQO_VIDEO_STUDIO_MASTER_CONTRACT,
  AVANTIQO_VIDEO_STUDIO_MASTER_MODEL,
  renderCreativeVideoStudioMaster,
} from "@/lib/creative/video/runtime/CreativeVideoStudioMasterRuntime";
import {
  AVANTIQO_VIDEO_FLASHVSR_MODEL,
  AVANTIQO_VIDEO_STUDIO_FLASHVSR_CONTRACT,
} from "@/lib/creative/video/runtime/CreativeVideoStudioFlashVsrRuntime";
import { resolveAvantiqoVideoRoute } from "./AvantiqoVideoCapacityRouter.js";
import { AvantiqoVideoWorkflowRuntimeV2 } from "./AvantiqoVideoWorkflowRuntimeV2.js";
import {
  abortAvantiqoVideoPodGeneration,
  getAvantiqoVideoPodGenerationStatus,
  inspectAvantiqoVideoPodReadiness,
  submitAvantiqoVideoPodGeneration,
} from "./AvantiqoVideoPodRuntime.js";
import {
  abortAvantiqoVideoFlashVsrMaster,
  getAvantiqoVideoFlashVsrMasterStatus,
  submitAvantiqoVideoFlashVsrMaster,
} from "./AvantiqoVideoFlashVsrPodRuntime.js";

export const AVANTIQO_VIDEO_WORKFLOW_V3_CONTRACT = "AVANTIQO_VIDEO_EPHEMERAL_POD_MASTERING_WORKFLOW_V3";
export const AVANTIQO_VIDEO_WORKFLOW_V3_JOB_PREFIX = "video-workflow-v3:";

const BUCKET = "creative-assets";
const ROUTABLE = new Set(["ai.video.generate", "ai.video.image_to_video"]);
const LEGACY_MASTERING_STAGES = new Set(["MASTERING_SUBMITTING", "MASTERING"]);

function text(value) { return String(value ?? "").trim(); }
function object(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function safeId(value) { return text(value).replace(/[^A-Za-z0-9_-]/g, ""); }
function errorCode(error, fallback) {
  return text(error?.message || error).split(":")[0].slice(0, 180) || fallback;
}
function identity(input = {}) {
  const organizationId = text(input.context?.organization_id);
  const usageId = text(input.context?.usage_id);
  if (!organizationId) throw new Error("organization_id required");
  if (!usageId) throw new Error("usage_id required");
  return { organizationId, usageId };
}
function statePath(organizationId, usageId) {
  const org = safeId(organizationId);
  const usage = safeId(usageId);
  if (!org || !usage) throw new Error("AVANTIQO_VIDEO_WORKFLOW_V3_IDENTITY_INVALID");
  return `${org}/generated/avantiqo-video/.workflow-v3/${usage}.json`;
}
function finalVideoPath(organizationId, usageId) {
  const usage = safeId(usageId);
  if (!usage) throw new Error("AVANTIQO_VIDEO_USAGE_ID_INVALID");
  return `${organizationId}/generated/avantiqo-video/${usage}.mp4`;
}
function workflowId(usageId) { return `${AVANTIQO_VIDEO_WORKFLOW_V3_JOB_PREFIX}${usageId}`; }
function workflowUsageId(value) {
  const raw = text(value);
  return raw.startsWith(AVANTIQO_VIDEO_WORKFLOW_V3_JOB_PREFIX)
    ? raw.slice(AVANTIQO_VIDEO_WORKFLOW_V3_JOB_PREFIX.length)
    : null;
}
function deliveryResolution(input = {}) {
  const generation = object(input.generation);
  const output = object(input.output_spec || input.outputSpec || generation.output_spec || generation.outputSpec);
  const requested = text(
    input.delivery_resolution || input.deliveryResolution || output.resolution ||
    input.master_resolution || input.masterResolution || process.env.AVANTIQO_VIDEO_MASTER_RESOLUTION || "4k",
  ).toLowerCase();
  if (["4k", "2160p", "uhd"].includes(requested)) return "4k";
  if (["2k", "1440p"].includes(requested)) return "2k";
  return "1080p";
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
    if (status === 400 || status === 404 || message.includes("not found") || message.includes("object not found")) return null;
    throw error;
  }
  const parsed = JSON.parse(await data.text());
  if (parsed?.contract !== AVANTIQO_VIDEO_WORKFLOW_V3_CONTRACT) {
    throw new Error("AVANTIQO_VIDEO_WORKFLOW_V3_STATE_CONTRACT_INVALID");
  }
  return parsed;
}
async function persistFinalBuffer({ organizationId, usageId, buffer }) {
  const path = finalVideoPath(organizationId, usageId);
  const { error } = await getServiceSupabase().storage.from(BUCKET).upload(path, buffer, {
    contentType: "video/mp4",
    upsert: true,
  });
  if (error) throw error;
  const storageReference = `storage://${BUCKET}/${path}`;
  const videoUrl = await resolveCreativeProviderAssetUrl({
    organization_id: organizationId,
    value: storageReference,
  });
  if (!videoUrl) throw new Error("AVANTIQO_VIDEO_STUDIO_MASTER_SIGNED_URL_REQUIRED");
  return { storageReference, videoUrl };
}
async function runStudioMaster(state) {
  state.stage = "STUDIO_MASTERING";
  state.master_model = AVANTIQO_VIDEO_STUDIO_MASTER_MODEL;
  state.master_contract = AVANTIQO_VIDEO_STUDIO_MASTER_CONTRACT;
  state.master_job_id = null;
  state.failure_code = null;
  state.updated_at = new Date().toISOString();
  await writeState(state);

  try {
    const master = await renderCreativeVideoStudioMaster({
      organization_id: state.organization_id,
      source_url: state.foundation_storage_reference,
      target_resolution: state.master_resolution,
    });
    const persisted = await persistFinalBuffer({
      organizationId: state.organization_id,
      usageId: state.usage_id,
      buffer: master.buffer,
    });
    state.stage = "COMPLETED";
    state.final_storage_reference = persisted.storageReference;
    state.final_video_url = persisted.videoUrl;
    state.master_backend = master.backend;
    state.master_input_probe = master.input_probe;
    state.master_output_probe = master.output_probe;
    state.studio_compute_only_mastering = true;
    state.studio_final_encoding = true;
    state.learned_super_resolution_used = false;
    state.gpu_mastering_used = false;
    state.fal_contacted = false;
    state.external_mastering_provider_contacted = false;
    state.updated_at = new Date().toISOString();
    await writeState(state);
    return { success: true, state };
  } catch (error) {
    state.stage = "STUDIO_MASTERING_FAILED";
    state.failure_code = errorCode(error, "AVANTIQO_VIDEO_STUDIO_MASTER_FAILED");
    state.studio_compute_only_mastering = true;
    state.studio_final_encoding = true;
    state.learned_super_resolution_used = false;
    state.gpu_mastering_used = false;
    state.fal_contacted = false;
    state.updated_at = new Date().toISOString();
    await writeState(state).catch(() => null);
    return { success: false, state };
  }
}
async function submitFlashVsrMaster(state) {
  state.stage = "FLASHVSR_MASTER_SUBMITTING";
  state.master_model = AVANTIQO_VIDEO_FLASHVSR_MODEL;
  state.master_contract = AVANTIQO_VIDEO_STUDIO_FLASHVSR_CONTRACT;
  state.master_job_id = null;
  state.failure_code = null;
  state.studio_compute_only_mastering = false;
  state.studio_final_encoding = true;
  state.learned_super_resolution_used = true;
  state.gpu_mastering_used = true;
  state.updated_at = new Date().toISOString();
  await writeState(state);
  let masterJob = null;
  try {
    const sourceUrl = await resolveCreativeProviderAssetUrl({
      organization_id: state.organization_id,
      value: state.foundation_storage_reference,
    });
    if (!sourceUrl) throw new Error("AVANTIQO_VIDEO_FLASHVSR_FOUNDATION_URL_REQUIRED");
    masterJob = await submitAvantiqoVideoFlashVsrMaster({
      organizationId: state.organization_id,
      sourceUrl,
    });
    state.stage = "FLASHVSR_MASTER";
    state.master_job = masterJob;
    state.master_job_id = masterJob.pod_id;
    state.pod_lease_active = true;
    state.updated_at = new Date().toISOString();
    await writeState(state);
    return { success: true, state };
  } catch (error) {
    if (masterJob) await abortAvantiqoVideoFlashVsrMaster(masterJob, "VIDEO_WORKFLOW_V3_FLASHVSR_STATE_PERSIST_FAILED").catch(() => null);
    state.stage = "FLASHVSR_MASTER_FAILED";
    state.failure_code = errorCode(error, "AVANTIQO_VIDEO_FLASHVSR_MASTER_SUBMIT_FAILED");
    state.pod_lease_active = false;
    state.updated_at = new Date().toISOString();
    await writeState(state).catch(() => null);
    return { success: false, state };
  }
}
function queuedResult(state) {
  return {
    success: true,
    provider: "avantiqo-video",
    model: "avantiqo-cinema-v1",
    output: {
      provider_job_id: workflowId(state.usage_id),
      status: state.stage === "COMPLETED" ? "completed" : ["FAILED", "STUDIO_MASTERING_FAILED", "FLASHVSR_MASTER_FAILED"].includes(state.stage) ? "failed" : "queued",
      stage: state.stage,
      workflow_contract: AVANTIQO_VIDEO_WORKFLOW_V3_CONTRACT,
      route: state.route,
      route_reason: state.route_reason,
      generation_backend: state.generation_backend,
      internal_generation_resolution: "720p",
      final_master_resolution: state.master_resolution,
      master_backend: state.master_backend || state.master_model || null,
      learned_super_resolution_used: state.learned_super_resolution_used === true,
      customer_visible_provider: "avantiqo-video",
      prompt_persisted: false,
      runpod_lease_active: state.pod_lease_active === true,
      fal_contacted: false,
      ...(state.failure_code ? { error: state.failure_code } : {}),
      ...(state.final_storage_reference ? {
        storage_reference: state.final_storage_reference,
        video_url: state.final_video_url,
        result: state.final_video_url,
      } : {}),
    },
  };
}
function safePodFallbackError(error) {
  if (error?.safeFallback === true) return true;
  const code = errorCode(error, "");
  return [
    "AVANTIQO_VIDEO_POD_NOT_READY",
    "AVANTIQO_VIDEO_POD_CAPACITY_CHANGED_BEFORE_CREATE",
    "AVANTIQO_VIDEO_POD_LEASE_ACQUIRE_FAILED",
  ].includes(code) || /^AVANTIQO_VIDEO_POD_HTTP_(400|404|409|429|503)$/.test(code);
}
function completedResult(state, signedUrl = null) {
  const videoUrl = signedUrl || state.final_video_url;
  return {
    provider: "avantiqo-video",
    provider_job_id: workflowId(state.usage_id),
    status: "completed",
    stage: "COMPLETED",
    video_url: videoUrl,
    result: videoUrl,
    storage_reference: state.final_storage_reference,
    final_master_resolution: state.master_resolution,
    internal_generation_resolution: "720p",
    generation_backend: state.generation_backend,
    master_backend: state.master_backend || state.master_model || null,
    studio_compute_only_mastering: state.studio_compute_only_mastering === true,
    studio_final_encoding: state.studio_final_encoding === true,
    learned_super_resolution_used: state.learned_super_resolution_used === true,
    gpu_mastering_used: state.gpu_mastering_used === true,
    fal_contacted: false,
    external_mastering_provider_contacted: false,
    customer_visible_provider: "avantiqo-video",
    workflow_contract: AVANTIQO_VIDEO_WORKFLOW_V3_CONTRACT,
  };
}

export const AvantiqoVideoWorkflowRuntimeV3 = {
  async execute(input = {}) {
    const capability = text(input.capability);
    if (!ROUTABLE.has(capability)) return AvantiqoVideoWorkflowRuntimeV2.execute(input);
    const { organizationId, usageId } = identity(input);
    const existing = await readState(organizationId, usageId);
    if (existing) return queuedResult(existing);

    const serverlessRoute = await resolveAvantiqoVideoRoute({ capability, forceRefresh: true });
    if (serverlessRoute.route === "OWNED") return AvantiqoVideoWorkflowRuntimeV2.execute(input);

    const podReadiness = await inspectAvantiqoVideoPodReadiness();
    if (podReadiness.ready !== true) return AvantiqoVideoWorkflowRuntimeV2.execute(input);

    let podJob;
    try {
      podJob = await submitAvantiqoVideoPodGeneration({
        ...input,
        resolution: "720p",
        generation: { ...object(input.generation), resolution: "720p" },
      });
    } catch (error) {
      if (safePodFallbackError(error)) return AvantiqoVideoWorkflowRuntimeV2.execute(input);
      throw error;
    }

    const masterResolution = deliveryResolution(input);
    const state = {
      contract: AVANTIQO_VIDEO_WORKFLOW_V3_CONTRACT,
      organization_id: organizationId,
      usage_id: usageId,
      capability,
      stage: "POD_GENERATION",
      route: "OWNED_POD_FALLBACK",
      route_reason: `${serverlessRoute.reason || serverlessRoute.route}:EPHEMERAL_GPU_ONLY_TARGET`,
      prior_serverless_route: serverlessRoute.route,
      prior_serverless_reason: serverlessRoute.reason || null,
      generation_backend: "OWNED_RUNPOD_POD_V6",
      generation_model: "avantiqo-cinema-v1",
      foundation_storage_reference: podJob.foundation_storage_reference,
      pod_job: podJob,
      pod_lease_active: true,
      master_model: masterResolution === "4k" ? AVANTIQO_VIDEO_FLASHVSR_MODEL : AVANTIQO_VIDEO_STUDIO_MASTER_MODEL,
      master_contract: masterResolution === "4k" ? AVANTIQO_VIDEO_STUDIO_FLASHVSR_CONTRACT : AVANTIQO_VIDEO_STUDIO_MASTER_CONTRACT,
      master_resolution: masterResolution,
      master_job_id: null,
      master_job: null,
      final_storage_reference: null,
      final_video_url: null,
      studio_compute_only_mastering: masterResolution !== "4k",
      studio_final_encoding: true,
      learned_super_resolution_used: masterResolution === "4k",
      gpu_mastering_used: masterResolution === "4k",
      fal_contacted: false,
      external_mastering_provider_contacted: false,
      prompt_persisted: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    try {
      await writeState(state);
    } catch (error) {
      await abortAvantiqoVideoPodGeneration(podJob, "VIDEO_WORKFLOW_V3_STATE_PERSIST_FAILED");
      throw error;
    }
    return queuedResult(state);
  },

  async getStatus(input = {}) {
    const supplied = input.job_id || input.jobId || input.provider_job_id;
    const usageFromJob = workflowUsageId(supplied);
    if (!usageFromJob) return AvantiqoVideoWorkflowRuntimeV2.getStatus(input);
    const { organizationId, usageId } = identity(input);
    if (usageFromJob !== usageId) throw new Error("AVANTIQO_VIDEO_WORKFLOW_V3_JOB_USAGE_MISMATCH");
    const state = await readState(organizationId, usageId);
    if (!state) throw new Error("AVANTIQO_VIDEO_WORKFLOW_V3_STATE_MISSING");

    if (["FAILED", "STUDIO_MASTERING_FAILED", "FLASHVSR_MASTER_FAILED"].includes(state.stage)) {
      return {
        provider: "avantiqo-video",
        provider_job_id: workflowId(usageId),
        status: "failed",
        stage: state.stage,
        error: state.failure_code || "AVANTIQO_VIDEO_WORKFLOW_V3_FAILED",
        runpod_lease_active: false,
        fal_contacted: false,
      };
    }

    if (state.stage === "POD_GENERATION") {
      const result = await getAvantiqoVideoPodGenerationStatus({ organizationId, podJob: state.pod_job });
      if (result.status === "failed") {
        state.stage = "FAILED";
        state.failure_code = text(result.error) || "AVANTIQO_VIDEO_POD_GENERATION_FAILED";
        state.pod_lease_active = false;
        state.updated_at = new Date().toISOString();
        await writeState(state);
        return {
          provider: "avantiqo-video",
          provider_job_id: workflowId(usageId),
          status: "failed",
          stage: "FAILED",
          error: state.failure_code,
        };
      }
      if (result.status !== "completed") {
        if (result.lease_expires_at) state.pod_job.lease_expires_at = result.lease_expires_at;
        state.updated_at = new Date().toISOString();
        await writeState(state);
        return {
          provider: "avantiqo-video",
          provider_job_id: workflowId(usageId),
          status: "processing",
          stage: "GENERATION",
          route: state.route,
          generation_backend: state.generation_backend,
          runpod_lease_active: true,
          pod_phase: result.phase || null,
        };
      }

      state.pod_lease_active = false;
      state.foundation_storage_reference = result.storage_reference || state.foundation_storage_reference;
      if (state.master_resolution === "4k") {
        const submitted = await submitFlashVsrMaster(state);
        if (!submitted.success) {
          return {
            provider: "avantiqo-video",
            provider_job_id: workflowId(usageId),
            status: "failed",
            stage: submitted.state.stage,
            error: submitted.state.failure_code,
            runpod_lease_active: false,
            fal_contacted: false,
          };
        }
        return queuedResult(submitted.state);
      }
      const mastered = await runStudioMaster(state);
      if (!mastered.success) {
        return {
          provider: "avantiqo-video",
          provider_job_id: workflowId(usageId),
          status: "failed",
          stage: mastered.state.stage,
          error: mastered.state.failure_code,
          runpod_lease_active: false,
          fal_contacted: false,
        };
      }
      return completedResult(mastered.state);
    }

    if (state.stage === "FLASHVSR_MASTER_SUBMITTING") {
      const submitted = await submitFlashVsrMaster(state);
      if (!submitted.success) {
        return {
          provider: "avantiqo-video",
          provider_job_id: workflowId(usageId),
          status: "failed",
          stage: submitted.state.stage,
          error: submitted.state.failure_code,
          runpod_lease_active: false,
          fal_contacted: false,
        };
      }
      return queuedResult(submitted.state);
    }

    if (state.stage === "FLASHVSR_MASTER") {
      const result = await getAvantiqoVideoFlashVsrMasterStatus(state.master_job);
      if (result.status === "failed") {
        state.stage = "FLASHVSR_MASTER_FAILED";
        state.failure_code = text(result.error) || "AVANTIQO_VIDEO_FLASHVSR_MASTER_FAILED";
        state.pod_lease_active = false;
        state.updated_at = new Date().toISOString();
        await writeState(state);
        return {
          provider: "avantiqo-video",
          provider_job_id: workflowId(usageId),
          status: "failed",
          stage: state.stage,
          error: state.failure_code,
          runpod_lease_active: false,
          fal_contacted: false,
        };
      }
      if (result.status !== "completed") {
        if (result.lease_expires_at) state.master_job.lease_expires_at = result.lease_expires_at;
        state.pod_lease_active = true;
        state.updated_at = new Date().toISOString();
        await writeState(state);
        return {
          provider: "avantiqo-video",
          provider_job_id: workflowId(usageId),
          status: "processing",
          stage: "FLASHVSR_MASTER",
          master_backend: AVANTIQO_VIDEO_FLASHVSR_MODEL,
          runpod_lease_active: true,
          pod_phase: result.phase || "GPU_SUPER_RESOLUTION",
          fal_contacted: false,
        };
      }
      const persisted = await persistFinalBuffer({
        organizationId,
        usageId,
        buffer: result.final.buffer,
      });
      state.stage = "COMPLETED";
      state.pod_lease_active = false;
      state.final_storage_reference = persisted.storageReference;
      state.final_video_url = persisted.videoUrl;
      state.master_backend = result.final.backend;
      state.master_output_probe = result.final.output_probe;
      state.learned_super_resolution_used = true;
      state.gpu_mastering_used = true;
      state.studio_compute_only_mastering = false;
      state.studio_final_encoding = true;
      state.gpu_deleted_before_studio_encode = result.gpu_deleted_before_studio_encode === true;
      state.fal_contacted = false;
      state.external_mastering_provider_contacted = false;
      state.updated_at = new Date().toISOString();
      await writeState(state);
      return completedResult(state);
    }

    if (LEGACY_MASTERING_STAGES.has(state.stage) || state.stage === "STUDIO_MASTERING") {
      state.pod_lease_active = false;
      state.master_job_id = null;
      if (state.master_resolution === "4k") {
        const submitted = await submitFlashVsrMaster(state);
        if (!submitted.success) {
          return {
            provider: "avantiqo-video",
            provider_job_id: workflowId(usageId),
            status: "failed",
            stage: submitted.state.stage,
            error: submitted.state.failure_code,
            runpod_lease_active: false,
            fal_contacted: false,
          };
        }
        return queuedResult(submitted.state);
      }
      state.master_model = AVANTIQO_VIDEO_STUDIO_MASTER_MODEL;
      state.master_contract = AVANTIQO_VIDEO_STUDIO_MASTER_CONTRACT;
      const mastered = await runStudioMaster(state);
      if (!mastered.success) {
        return {
          provider: "avantiqo-video",
          provider_job_id: workflowId(usageId),
          status: "failed",
          stage: mastered.state.stage,
          error: mastered.state.failure_code,
          runpod_lease_active: false,
          fal_contacted: false,
        };
      }
      return completedResult(mastered.state);
    }

    if (state.stage === "COMPLETED") {
      const signed = await resolveCreativeProviderAssetUrl({
        organization_id: organizationId,
        value: state.final_storage_reference,
      });
      return completedResult(state, signed);
    }

    throw new Error(`AVANTIQO_VIDEO_WORKFLOW_V3_STAGE_INVALID:${text(state.stage)}`);
  },
};
