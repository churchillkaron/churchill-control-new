import { getServiceSupabase } from "@/lib/shared/supabase/service";
import { resolveFirstCreativeProviderAssetUrl, resolveCreativeProviderAssetUrl } from "@/lib/creative/assets/storage/resolveCreativeProviderAssetUrl";
import { AvantiqoVideoProvider } from "./AvantiqoVideoProvider.js";
import { resolveAvantiqoVideoRoute } from "./AvantiqoVideoCapacityRouter.js";
import {
  acquireVideoRunpodWebLease,
  refreshVideoRunpodWebLease,
  releaseVideoRunpodWebLease,
} from "./AvantiqoVideoRunpodLeaseRuntime.js";

const CONTRACT = "AVANTIQO_VIDEO_ROUTED_MASTERING_WORKFLOW_V1";
const JOB_PREFIX = "video-workflow:";
const BUCKET = "creative-assets";
const FAL_QUEUE = "https://queue.fal.run";
const T2V_MODEL = "fal-ai/wan/v2.2-a14b/text-to-video";
const I2V_MODEL = "fal-ai/wan/v2.2-a14b/image-to-video";
const MASTER_MODEL = "fal-ai/bytedance-upscaler/upscale/video";
const ROUTABLE = new Set(["ai.video.generate", "ai.video.image_to_video"]);
const OWNED_LEASE_TTL_SECONDS = 1800;

function text(value) { return String(value ?? "").trim(); }
function object(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function list(value) { return Array.isArray(value) ? value.filter(Boolean) : []; }
function finite(value, fallback = null) { const n = Number(value); return Number.isFinite(n) ? n : fallback; }
function compact(value) { return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined && item !== null && item !== "")); }
function errorCode(error, fallback) {
  return text(error?.message || error).split(":")[0].slice(0, 180) || fallback;
}

function falKey() {
  const value = text(process.env.FAL_KEY || process.env.FAL_API_KEY);
  if (!value) throw new Error("AVANTIQO_VIDEO_MANAGED_FALLBACK_CREDENTIAL_REQUIRED");
  return value;
}

function usageIdentity(input = {}) {
  const organizationId = text(input.context?.organization_id);
  const usageId = text(input.context?.usage_id);
  if (!organizationId) throw new Error("organization_id required");
  if (!usageId) throw new Error("usage_id required");
  return { organizationId, usageId };
}

function statePath(organizationId, usageId) {
  const safeOrg = organizationId.replace(/[^A-Za-z0-9_-]/g, "");
  const safeUsage = usageId.replace(/[^A-Za-z0-9_-]/g, "");
  if (!safeOrg || !safeUsage) throw new Error("AVANTIQO_VIDEO_WORKFLOW_IDENTITY_INVALID");
  return `${safeOrg}/generated/avantiqo-video/.workflow/${safeUsage}.json`;
}

function finalVideoPath(organizationId, usageId) {
  const safeUsage = usageId.replace(/[^A-Za-z0-9_-]/g, "");
  if (!safeUsage) throw new Error("AVANTIQO_VIDEO_USAGE_ID_INVALID");
  return `${organizationId}/generated/avantiqo-video/${safeUsage}.mp4`;
}

async function writeState(state) {
  const supabase = getServiceSupabase();
  const body = new TextEncoder().encode(JSON.stringify(state));
  const { error } = await supabase.storage.from(BUCKET).upload(
    statePath(state.organization_id, state.usage_id),
    body,
    { contentType: "application/json", upsert: true },
  );
  if (error) throw error;
}

async function readState(organizationId, usageId) {
  const supabase = getServiceSupabase();
  const { data, error } = await supabase.storage.from(BUCKET).download(statePath(organizationId, usageId));
  if (error) throw error;
  const parsed = JSON.parse(await data.text());
  if (parsed?.contract !== CONTRACT) throw new Error("AVANTIQO_VIDEO_WORKFLOW_STATE_CONTRACT_INVALID");
  return parsed;
}

async function requestJson(url, { method = "GET", body = null } = {}) {
  const response = await fetch(url, {
    method,
    headers: compact({
      Authorization: `Key ${falKey()}`,
      Accept: "application/json",
      ...(body ? { "Content-Type": "application/json" } : {}),
    }),
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(30_000),
  });
  const raw = await response.text();
  let result = {};
  try { result = raw ? JSON.parse(raw) : {}; } catch { result = {}; }
  if (!response.ok) {
    throw new Error(`AVANTIQO_VIDEO_MANAGED_FAL_HTTP_${response.status}:${text(result?.detail || result?.error || result?.message || raw).slice(0, 700)}`);
  }
  return result;
}

function falQueueUrl(model) { return `${FAL_QUEUE}/${model}`; }
function falRequestUrl(model, requestId) { return `${falQueueUrl(model)}/requests/${encodeURIComponent(requestId)}`; }
function falStatusUrl(model, requestId) { return `${falRequestUrl(model, requestId)}/status`; }

function falState(result = {}) {
  const state = text(result.status || result.state || result.phase).toUpperCase();
  if (["COMPLETED", "COMPLETE", "SUCCEEDED", "SUCCESS", "DONE"].includes(state)) return "completed";
  if (["FAILED", "ERROR", "CANCELLED", "CANCELED", "TIMED_OUT"].includes(state)) return "failed";
  return "processing";
}

function outputVideoUrl(result = {}) {
  return text(
    result?.video?.url ||
    result?.data?.video?.url ||
    result?.output?.video?.url ||
    result?.response?.video?.url ||
    result?.response?.data?.video?.url ||
    result?.url,
  ) || null;
}

function providerJobId(result = {}) {
  return text(result?.output?.provider_job_id || result?.provider_job_id || result?.job_id || result?.id);
}

function providerStatus(result = {}) {
  return text(result?.output?.status || result?.status || result?.state || result?.phase).toLowerCase();
}

function providerVideoUrl(result = {}) {
  return text(
    result?.output?.video_url ||
    result?.output?.result ||
    result?.video_url ||
    result?.result,
  ) || null;
}

function durationSeconds(input = {}) {
  const generation = object(input.generation);
  const n = finite(input.duration_seconds ?? input.duration ?? generation.duration_seconds ?? generation.duration, 5);
  return Math.max(2, Math.min(10, Math.round(n)));
}

function aspectRatio(input = {}) {
  const generation = object(input.generation);
  const value = text(input.aspect_ratio || input.aspectRatio || input.ratio || generation.aspect_ratio || generation.ratio || "16:9");
  return ["16:9", "9:16", "1:1"].includes(value) ? value : "16:9";
}

function prompt(input = {}) {
  const generation = object(input.generation);
  const value = text(input.provider_prompt || input.prompt || input.instructions_text || input.instructions || generation.instructions || generation.prompt);
  if (!value) throw new Error("AVANTIQO_VIDEO_INSTRUCTION_REQUIRED");
  return value;
}

function negativePrompt(input = {}) {
  const control = object(input.cinematic_control);
  const requirements = object(input.requirements);
  const values = [
    ...list(input.negative_constraints),
    ...list(requirements.negative_constraints),
    ...list(control.negative_constraints),
  ].map(text).filter(Boolean);
  return [...new Set(values)].join(", ");
}

function seed(input = {}) {
  const generation = object(input.generation);
  const value = input.seed ?? generation.seed;
  if (value === undefined || value === null || value === "") return undefined;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0 || n > 4294967295) throw new Error("AVANTIQO_VIDEO_SEED_INVALID");
  return n;
}

function frameCount(input = {}) {
  return Math.max(33, Math.min(161, durationSeconds(input) * 16 + 1));
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

async function firstReferenceUrl(input = {}) {
  const { organizationId } = usageIdentity(input);
  const candidates = [
    input.image,
    input.source_image,
    input.sourceImage,
    input.reference_image,
    input.referenceImage,
    ...list(input.reference_images),
    ...list(input.referenceImages),
  ].filter(Boolean);
  return resolveFirstCreativeProviderAssetUrl({ organization_id: organizationId, values: candidates });
}

async function submitFalGeneration(input) {
  const capability = text(input.capability);
  const model = capability === "ai.video.image_to_video" ? I2V_MODEL : T2V_MODEL;
  const body = compact({
    prompt: prompt(input),
    ...(capability === "ai.video.image_to_video" ? { image_url: await firstReferenceUrl(input) } : {}),
    negative_prompt: negativePrompt(input),
    num_frames: frameCount(input),
    frames_per_second: 16,
    resolution: "720p",
    aspect_ratio: aspectRatio(input),
    num_inference_steps: 40,
    enable_prompt_expansion: false,
    acceleration: "regular",
    guidance_scale: 3.5,
    guidance_scale_2: capability === "ai.video.image_to_video" ? 3.5 : 4.0,
    interpolator_model: "film",
    num_interpolated_frames: 1,
    adjust_fps_for_interpolation: true,
    video_quality: "maximum",
    video_write_mode: "balanced",
    seed: seed(input),
  });
  if (capability === "ai.video.image_to_video" && !body.image_url) {
    throw new Error("AVANTIQO_VIDEO_IMAGE_TO_VIDEO_REFERENCE_REQUIRED");
  }
  const result = await requestJson(falQueueUrl(model), { method: "POST", body });
  const requestId = text(result.request_id || result.requestId);
  if (!requestId) throw new Error("AVANTIQO_VIDEO_MANAGED_FALLBACK_REQUEST_ID_REQUIRED");
  return { model, requestId };
}

async function falResult(model, requestId) {
  const status = await requestJson(falStatusUrl(model, requestId));
  const state = falState(status);
  if (state !== "completed") return { state, status };
  const result = await requestJson(falRequestUrl(model, requestId));
  return { state: "completed", status, result };
}

async function submitMaster(videoUrl, state) {
  const result = await requestJson(falQueueUrl(MASTER_MODEL), {
    method: "POST",
    body: {
      video_url: videoUrl,
      target_resolution: state.master_resolution,
      target_fps: 30,
      enhancement_preset: "aigc",
      enhancement_tier: "standard",
      fidelity: "high",
      bit_depth: 8,
    },
  });
  const requestId = text(result.request_id || result.requestId);
  if (!requestId) throw new Error("AVANTIQO_VIDEO_MASTER_REQUEST_ID_REQUIRED");
  return requestId;
}

async function persistFinalVideo({ organizationId, usageId, videoUrl }) {
  const response = await fetch(videoUrl, { signal: AbortSignal.timeout(120_000) });
  if (!response.ok) throw new Error(`AVANTIQO_VIDEO_MASTER_DOWNLOAD_HTTP_${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  const path = finalVideoPath(organizationId, usageId);
  const supabase = getServiceSupabase();
  const { error } = await supabase.storage.from(BUCKET).upload(path, bytes, {
    contentType: "video/mp4",
    upsert: true,
  });
  if (error) throw error;
  const signed = await resolveCreativeProviderAssetUrl({
    organization_id: organizationId,
    value: `storage://${BUCKET}/${path}`,
  });
  return { storageReference: `storage://${BUCKET}/${path}`, videoUrl: signed };
}

function workflowId(usageId) { return `${JOB_PREFIX}${usageId}`; }
function workflowUsageId(value) {
  const raw = text(value);
  return raw.startsWith(JOB_PREFIX) ? raw.slice(JOB_PREFIX.length) : null;
}

async function releaseOwnedLease(state, { finalState = "RELEASED", reason, cancelExactJob = false } = {}) {
  if (state.runpod_lease_active !== true) return null;
  const released = await releaseVideoRunpodWebLease({
    leaseId: state.runpod_lease_id,
    ownerRequestId: state.runpod_lease_owner_request_id,
    endpointId: state.runpod_lease_endpoint_id,
    providerJobId: state.generation_job_id || null,
    finalState,
    reason,
    cancelExactJob,
  });
  state.runpod_lease_active = false;
  state.runpod_lease_released_at = new Date().toISOString();
  state.runpod_lease_release_state = finalState;
  state.updated_at = new Date().toISOString();
  return released;
}

export const AvantiqoVideoWorkflowRuntime = {
  async execute(input = {}) {
    const capability = text(input.capability);
    if (!ROUTABLE.has(capability)) return AvantiqoVideoProvider.execute(input);
    const { organizationId, usageId } = usageIdentity(input);
    const initialRoute = await resolveAvantiqoVideoRoute({ capability });
    if (!["OWNED", "MANAGED_FALLBACK"].includes(initialRoute.route)) {
      throw new Error(`AVANTIQO_VIDEO_NO_RUNNABLE_BACKEND:${initialRoute.reason || initialRoute.route || "UNKNOWN"}`);
    }

    const backendInput = {
      ...input,
      resolution: "720p",
      generation: {
        ...object(input.generation),
        resolution: "720p",
      },
    };

    let route = initialRoute;
    let generation_backend;
    let generation_model;
    let generation_job_id;
    let lease = null;
    let leaseFallbackErrorCode = null;

    if (route.route === "MANAGED_FALLBACK") {
      const submitted = await submitFalGeneration(backendInput);
      generation_backend = "MANAGED_FAL_WAN22";
      generation_model = submitted.model;
      generation_job_id = submitted.requestId;
    } else {
      try {
        lease = await acquireVideoRunpodWebLease({
          organizationId,
          ttlSeconds: OWNED_LEASE_TTL_SECONDS,
        });
      } catch (error) {
        if (route.fallback_ready !== true) throw error;
        leaseFallbackErrorCode = errorCode(error, "AVANTIQO_VIDEO_OWNED_LEASE_UNAVAILABLE");
        const submitted = await submitFalGeneration(backendInput);
        generation_backend = "MANAGED_FAL_WAN22";
        generation_model = submitted.model;
        generation_job_id = submitted.requestId;
        route = {
          ...route,
          route: "MANAGED_FALLBACK",
          owned_route_reason: route.reason,
          reason: "OWNED_LEASE_UNAVAILABLE_USE_FALLBACK",
          runpod_lease_required: false,
        };
      }

      if (lease) {
        try {
          const result = await AvantiqoVideoProvider.execute({
            ...backendInput,
            runpod_safe_lease: lease,
          });
          generation_backend = "OWNED_RUNPOD_V4";
          generation_model = "avantiqo-cinema-v1";
          generation_job_id = providerJobId(result);
          if (!generation_job_id) throw new Error("AVANTIQO_VIDEO_OWNED_GENERATION_JOB_ID_REQUIRED");
        } catch (error) {
          await releaseVideoRunpodWebLease({
            leaseId: lease.lease_id,
            ownerRequestId: lease.owner_request_id,
            endpointId: lease.endpoint_id,
            providerJobId: generation_job_id || null,
            finalState: "FAILED",
            reason: "VIDEO_OWNED_SUBMIT_FAILED",
            cancelExactJob: Boolean(generation_job_id),
          }).catch(() => null);
          throw error;
        }
      }
    }

    const state = {
      contract: CONTRACT,
      organization_id: organizationId,
      usage_id: usageId,
      capability,
      stage: "GENERATION",
      route_contract: route.contract,
      route: route.route,
      route_reason: route.reason,
      owned_route_reason: route.owned_route_reason || null,
      lease_fallback_error_code: leaseFallbackErrorCode,
      generation_backend,
      generation_model,
      generation_job_id,
      master_model: MASTER_MODEL,
      master_resolution: deliveryResolution(input),
      master_job_id: null,
      final_storage_reference: null,
      runpod_lease_id: lease?.lease_id || null,
      runpod_lease_owner_request_id: lease?.owner_request_id || null,
      runpod_lease_endpoint_id: lease?.endpoint_id || null,
      runpod_lease_expires_at: lease?.expires_at || null,
      runpod_lease_active: Boolean(lease),
      runpod_lease_released_at: null,
      runpod_lease_release_state: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      prompt_persisted: false,
    };

    try {
      await writeState(state);
    } catch (error) {
      if (lease) {
        await releaseVideoRunpodWebLease({
          leaseId: lease.lease_id,
          ownerRequestId: lease.owner_request_id,
          endpointId: lease.endpoint_id,
          providerJobId: generation_job_id || null,
          finalState: "FAILED",
          reason: "VIDEO_WORKFLOW_STATE_PERSIST_FAILED",
          cancelExactJob: Boolean(generation_job_id),
        }).catch(() => null);
      }
      throw error;
    }

    return {
      success: true,
      provider: "avantiqo-video",
      model: "avantiqo-cinema-v1",
      output: {
        provider_job_id: workflowId(usageId),
        status: "queued",
        workflow_contract: CONTRACT,
        stage: state.stage,
        route: state.route,
        route_reason: state.route_reason,
        generation_backend: state.generation_backend,
        runpod_lease_active: state.runpod_lease_active,
        internal_generation_resolution: "720p",
        final_master_resolution: state.master_resolution,
        customer_visible_provider: "avantiqo-video",
        prompt_persisted: false,
      },
    };
  },

  async getStatus(input = {}) {
    const { organizationId } = usageIdentity(input);
    const usageId = workflowUsageId(input.job_id || input.jobId || input.provider_job_id);
    if (!usageId) return AvantiqoVideoProvider.getStatus(input);
    const state = await readState(organizationId, usageId);

    if (state.stage === "FAILED") {
      return {
        provider: "avantiqo-video",
        provider_job_id: workflowId(usageId),
        status: "failed",
        stage: "FAILED",
        error: state.failure_code || "AVANTIQO_VIDEO_WORKFLOW_FAILED",
      };
    }

    if (state.stage === "MASTERING_SUBMITTING") {
      return {
        provider: "avantiqo-video",
        provider_job_id: workflowId(usageId),
        status: "failed",
        stage: "MASTERING_SUBMITTING",
        error: "AVANTIQO_VIDEO_MASTER_SUBMISSION_RECONCILIATION_REQUIRED",
      };
    }

    if (state.stage === "GENERATION") {
      let generationState;
      let generationUrl;
      if (state.generation_backend === "OWNED_RUNPOD_V4") {
        if (
          state.runpod_lease_active !== true ||
          !state.runpod_lease_id ||
          !state.runpod_lease_owner_request_id ||
          !state.runpod_lease_endpoint_id
        ) {
          throw new Error("AVANTIQO_VIDEO_OWNED_GENERATION_ACTIVE_LEASE_REQUIRED");
        }

        const refreshedLease = await refreshVideoRunpodWebLease({
          leaseId: state.runpod_lease_id,
          ownerRequestId: state.runpod_lease_owner_request_id,
          ttlSeconds: OWNED_LEASE_TTL_SECONDS,
        });
        state.runpod_lease_expires_at = refreshedLease.expires_at || state.runpod_lease_expires_at;

        const result = await AvantiqoVideoProvider.getStatus({
          ...input,
          job_id: state.generation_job_id,
          provider_job_id: state.generation_job_id,
          runpod_safe_lease: {
            lease_id: state.runpod_lease_id,
            owner_request_id: state.runpod_lease_owner_request_id,
            endpoint_id: state.runpod_lease_endpoint_id,
            expires_at: state.runpod_lease_expires_at,
          },
        });
        const normalized = providerStatus(result);
        if (["failed", "error", "cancelled", "canceled", "timed_out"].includes(normalized)) {
          await releaseOwnedLease(state, {
            finalState: "FAILED",
            reason: "VIDEO_OWNED_GENERATION_TERMINAL_FAILURE",
          }).catch(() => null);
          state.stage = "FAILED";
          state.failure_code = "AVANTIQO_VIDEO_OWNED_GENERATION_FAILED";
          state.updated_at = new Date().toISOString();
          await writeState(state);
          return { provider: "avantiqo-video", provider_job_id: workflowId(usageId), status: "failed", error: state.failure_code };
        }
        generationUrl = providerVideoUrl(result);
        generationState = generationUrl || ["completed", "complete", "success", "succeeded", "done"].includes(normalized)
          ? "completed"
          : "processing";
      } else {
        const result = await falResult(state.generation_model, state.generation_job_id);
        if (result.state === "failed") {
          state.stage = "FAILED";
          state.failure_code = "AVANTIQO_VIDEO_MANAGED_FALLBACK_GENERATION_FAILED";
          state.updated_at = new Date().toISOString();
          await writeState(state);
          return { provider: "avantiqo-video", provider_job_id: workflowId(usageId), status: "failed", error: state.failure_code };
        }
        generationState = result.state;
        generationUrl = result.result ? outputVideoUrl(result.result) : null;
      }

      if (generationState !== "completed" || !generationUrl) {
        state.updated_at = new Date().toISOString();
        await writeState(state);
        return {
          provider: "avantiqo-video",
          provider_job_id: workflowId(usageId),
          status: "processing",
          stage: "GENERATION",
          route: state.route,
          generation_backend: state.generation_backend,
          runpod_lease_active: state.runpod_lease_active === true,
        };
      }

      if (state.generation_backend === "OWNED_RUNPOD_V4") {
        await releaseOwnedLease(state, {
          finalState: "RELEASED",
          reason: "VIDEO_OWNED_GENERATION_COMPLETED_BEFORE_MASTERING",
        });
      }

      state.generation_output_url = generationUrl;
      state.stage = "MASTERING_SUBMITTING";
      state.updated_at = new Date().toISOString();
      await writeState(state);

      let masterJobId;
      try {
        masterJobId = await submitMaster(generationUrl, state);
      } catch (error) {
        state.failure_code = errorCode(error, "AVANTIQO_VIDEO_MASTER_SUBMISSION_FAILED");
        state.updated_at = new Date().toISOString();
        await writeState(state).catch(() => null);
        throw error;
      }

      state.master_job_id = masterJobId;
      state.stage = "MASTERING";
      state.updated_at = new Date().toISOString();
      await writeState(state);
      return {
        provider: "avantiqo-video",
        provider_job_id: workflowId(usageId),
        status: "processing",
        stage: "MASTERING",
        final_master_resolution: state.master_resolution,
        runpod_lease_active: false,
      };
    }

    if (state.stage === "MASTERING") {
      const result = await falResult(state.master_model, state.master_job_id);
      if (result.state === "failed") {
        state.stage = "FAILED";
        state.failure_code = "AVANTIQO_VIDEO_MASTERING_FAILED";
        state.updated_at = new Date().toISOString();
        await writeState(state);
        return { provider: "avantiqo-video", provider_job_id: workflowId(usageId), status: "failed", error: state.failure_code };
      }
      if (result.state !== "completed") {
        return {
          provider: "avantiqo-video",
          provider_job_id: workflowId(usageId),
          status: "processing",
          stage: "MASTERING",
          final_master_resolution: state.master_resolution,
        };
      }
      const masterUrl = outputVideoUrl(result.result);
      if (!masterUrl) throw new Error("AVANTIQO_VIDEO_MASTER_OUTPUT_URL_REQUIRED");
      const persisted = await persistFinalVideo({ organizationId, usageId, videoUrl: masterUrl });
      state.stage = "COMPLETED";
      state.final_storage_reference = persisted.storageReference;
      state.updated_at = new Date().toISOString();
      await writeState(state);
      return {
        provider: "avantiqo-video",
        provider_job_id: workflowId(usageId),
        status: "completed",
        stage: "COMPLETED",
        video_url: persisted.videoUrl,
        storage_reference: persisted.storageReference,
        result: persisted.videoUrl,
        final_master_resolution: state.master_resolution,
        internal_generation_resolution: "720p",
        generation_backend: state.generation_backend,
        customer_visible_provider: "avantiqo-video",
        workflow_contract: CONTRACT,
      };
    }

    if (state.stage === "COMPLETED") {
      const signed = await resolveCreativeProviderAssetUrl({
        organization_id: organizationId,
        value: state.final_storage_reference,
      });
      return {
        provider: "avantiqo-video",
        provider_job_id: workflowId(usageId),
        status: "completed",
        stage: "COMPLETED",
        video_url: signed,
        storage_reference: state.final_storage_reference,
        result: signed,
        final_master_resolution: state.master_resolution,
        generation_backend: state.generation_backend,
        workflow_contract: CONTRACT,
      };
    }

    throw new Error(`AVANTIQO_VIDEO_WORKFLOW_STAGE_INVALID:${text(state.stage)}`);
  },
};

export const AVANTIQO_VIDEO_WORKFLOW_JOB_PREFIX = JOB_PREFIX;
export const AVANTIQO_VIDEO_WORKFLOW_CONTRACT = CONTRACT;
