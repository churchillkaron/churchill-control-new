import { getServiceSupabase } from "@/lib/shared/supabase/service";
import { resolveCreativeProviderAssetUrl } from "@/lib/creative/assets/storage/resolveCreativeProviderAssetUrl";
import { resolveAvantiqoVideoRoute } from "./AvantiqoVideoCapacityRouter.js";
import {
  AvantiqoVideoWorkflowRuntimeV2,
} from "./AvantiqoVideoWorkflowRuntimeV2.js";
import {
  abortAvantiqoVideoPodGeneration,
  getAvantiqoVideoPodGenerationStatus,
  inspectAvantiqoVideoPodReadiness,
  submitAvantiqoVideoPodGeneration,
} from "./AvantiqoVideoPodRuntime.js";

export const AVANTIQO_VIDEO_WORKFLOW_V3_CONTRACT = "AVANTIQO_VIDEO_EPHEMERAL_POD_MASTERING_WORKFLOW_V3";
export const AVANTIQO_VIDEO_WORKFLOW_V3_JOB_PREFIX = "video-workflow-v3:";

const BUCKET = "creative-assets";
const FAL_QUEUE = "https://queue.fal.run";
const MASTER_MODEL = "fal-ai/bytedance-upscaler/upscale/video";
const ROUTABLE = new Set(["ai.video.generate", "ai.video.image_to_video"]);

function text(value) { return String(value ?? "").trim(); }
function object(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function finite(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}
function safeId(value) { return text(value).replace(/[^A-Za-z0-9_-]/g, ""); }
function compact(value) { return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined && item !== null && item !== "")); }
function errorCode(error, fallback) {
  return text(error?.message || error).split(":")[0].slice(0, 180) || fallback;
}
function masteringSubmissionFailureCode(error) {
  const message = text(error?.message || error).toLowerCase();
  const balanceBlocked =
    (message.includes("avantiqo_video_mastering_http_402") || message.includes("avantiqo_video_mastering_http_403")) &&
    (message.includes("exhausted balance") || message.includes("user is locked") || message.includes("balance"));
  return balanceBlocked ? "AVANTIQO_VIDEO_MASTERING_FUNDS_REQUIRED" : errorCode(error, "AVANTIQO_VIDEO_MASTER_SUBMISSION_FAILED");
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
function falKey() {
  const value = text(process.env.FAL_KEY || process.env.FAL_API_KEY);
  if (!value) throw new Error("AVANTIQO_VIDEO_MASTERING_CREDENTIAL_REQUIRED");
  return value;
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
  let parsed = {};
  try { parsed = raw ? JSON.parse(raw) : {}; } catch { parsed = {}; }
  if (!response.ok) {
    throw new Error(`AVANTIQO_VIDEO_MASTERING_HTTP_${response.status}:${text(parsed?.detail || parsed?.error || parsed?.message || raw).slice(0, 700)}`);
  }
  return parsed;
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
    result?.video?.url || result?.data?.video?.url || result?.output?.video?.url ||
    result?.response?.video?.url || result?.response?.data?.video?.url || result?.url,
  ) || null;
}
async function falResult(model, requestId) {
  const status = await requestJson(falStatusUrl(model, requestId));
  const state = falState(status);
  if (state !== "completed") return { state, status };
  const result = await requestJson(falRequestUrl(model, requestId));
  return { state: "completed", status, result };
}
async function submitMaster(videoUrl, resolution) {
  const result = await requestJson(falQueueUrl(MASTER_MODEL), {
    method: "POST",
    body: {
      video_url: videoUrl,
      target_resolution: resolution,
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
  const reference = `storage://${BUCKET}/${path}`;
  const signed = await resolveCreativeProviderAssetUrl({ organization_id: organizationId, value: reference });
  return { storageReference: reference, videoUrl: signed };
}
async function writeState(state) {
  const supabase = getServiceSupabase();
  const bytes = new TextEncoder().encode(JSON.stringify(state));
  const { error } = await supabase.storage.from(BUCKET).upload(
    statePath(state.organization_id, state.usage_id),
    bytes,
    { contentType: "application/json", upsert: true },
  );
  if (error) throw error;
}
async function readState(organizationId, usageId) {
  const supabase = getServiceSupabase();
  const { data, error } = await supabase.storage.from(BUCKET).download(statePath(organizationId, usageId));
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
async function foundationVideoUrl(state) {
  const reference = text(state.foundation_storage_reference);
  if (!reference) throw new Error("AVANTIQO_VIDEO_FOUNDATION_STORAGE_REFERENCE_REQUIRED");
  const url = await resolveCreativeProviderAssetUrl({ organization_id: state.organization_id, value: reference });
  if (!url) throw new Error("AVANTIQO_VIDEO_FOUNDATION_SIGNED_URL_REQUIRED");
  return url;
}
async function retryMasterSubmission(state) {
  try {
    const videoUrl = await foundationVideoUrl(state);
    const masterJobId = await submitMaster(videoUrl, state.master_resolution);
    state.master_job_id = masterJobId;
    state.stage = "MASTERING";
    state.failure_code = null;
    state.updated_at = new Date().toISOString();
    await writeState(state);
    return { submitted: true, masterJobId };
  } catch (error) {
    state.stage = "MASTERING_SUBMITTING";
    state.failure_code = masteringSubmissionFailureCode(error);
    state.updated_at = new Date().toISOString();
    await writeState(state).catch(() => null);
    return { submitted: false, error: state.failure_code };
  }
}
function queuedResult(state) {
  return {
    success: true,
    provider: "avantiqo-video",
    model: "avantiqo-cinema-v1",
    output: {
      provider_job_id: workflowId(state.usage_id),
      status: state.stage === "COMPLETED" ? "completed" : state.stage === "FAILED" ? "failed" : "queued",
      stage: state.stage,
      workflow_contract: AVANTIQO_VIDEO_WORKFLOW_V3_CONTRACT,
      route: state.route,
      route_reason: state.route_reason,
      generation_backend: state.generation_backend,
      internal_generation_resolution: "720p",
      final_master_resolution: state.master_resolution,
      customer_visible_provider: "avantiqo-video",
      prompt_persisted: false,
      runpod_lease_active: state.pod_lease_active === true,
      ...(state.stage === "FAILED" ? { error: state.failure_code || "AVANTIQO_VIDEO_WORKFLOW_V3_FAILED" } : {}),
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

export const AvantiqoVideoWorkflowRuntimeV3 = {
  async execute(input = {}) {
    const capability = text(input.capability);
    if (!ROUTABLE.has(capability)) return AvantiqoVideoWorkflowRuntimeV2.execute(input);
    const { organizationId, usageId } = identity(input);
    const existing = await readState(organizationId, usageId);
    if (existing) return queuedResult(existing);

    const serverlessRoute = await resolveAvantiqoVideoRoute({ capability, forceRefresh: true });
    if (serverlessRoute.route === "OWNED") {
      return AvantiqoVideoWorkflowRuntimeV2.execute(input);
    }

    const podReadiness = await inspectAvantiqoVideoPodReadiness();
    if (podReadiness.ready !== true) {
      return AvantiqoVideoWorkflowRuntimeV2.execute(input);
    }

    // Never spend on a full-quality owned foundation render unless the mandatory
    // mastering leg is already credentialed. V2 can still choose its Google-native
    // path if FAL mastering is unavailable.
    try {
      falKey();
    } catch {
      return AvantiqoVideoWorkflowRuntimeV2.execute(input);
    }

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

    const state = {
      contract: AVANTIQO_VIDEO_WORKFLOW_V3_CONTRACT,
      organization_id: organizationId,
      usage_id: usageId,
      capability,
      stage: "POD_GENERATION",
      route: "OWNED_POD_FALLBACK",
      route_reason: `${serverlessRoute.reason || serverlessRoute.route}:RTX_PRO_4500_EPHEMERAL_POD`,
      prior_serverless_route: serverlessRoute.route,
      prior_serverless_reason: serverlessRoute.reason || null,
      generation_backend: "OWNED_RUNPOD_POD_V5",
      generation_model: "avantiqo-cinema-v1",
      foundation_storage_reference: podJob.foundation_storage_reference,
      pod_job: podJob,
      pod_lease_active: true,
      master_model: MASTER_MODEL,
      master_resolution: deliveryResolution(input),
      master_job_id: null,
      final_storage_reference: null,
      final_video_url: null,
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

    if (state.stage === "FAILED") {
      return {
        provider: "avantiqo-video",
        provider_job_id: workflowId(usageId),
        status: "failed",
        stage: "FAILED",
        error: state.failure_code || "AVANTIQO_VIDEO_WORKFLOW_V3_FAILED",
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
      state.stage = "MASTERING_SUBMITTING";
      state.updated_at = new Date().toISOString();
      await writeState(state);

      const submission = await retryMasterSubmission(state);
      if (!submission.submitted) {
        return {
          provider: "avantiqo-video",
          provider_job_id: workflowId(usageId),
          status: "failed",
          stage: "MASTERING_SUBMITTING",
          error: submission.error,
          final_master_resolution: state.master_resolution,
          runpod_lease_active: false,
        };
      }
      return {
        provider: "avantiqo-video",
        provider_job_id: workflowId(usageId),
        status: "processing",
        stage: "MASTERING",
        final_master_resolution: state.master_resolution,
        runpod_lease_active: false,
      };
    }

    if (state.stage === "MASTERING_SUBMITTING") {
      const submission = await retryMasterSubmission(state);
      if (!submission.submitted) {
        return {
          provider: "avantiqo-video",
          provider_job_id: workflowId(usageId),
          status: "failed",
          stage: "MASTERING_SUBMITTING",
          error: submission.error,
          final_master_resolution: state.master_resolution,
          runpod_lease_active: false,
        };
      }
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
        return {
          provider: "avantiqo-video",
          provider_job_id: workflowId(usageId),
          status: "failed",
          stage: "FAILED",
          error: state.failure_code,
        };
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
      state.final_video_url = persisted.videoUrl;
      state.updated_at = new Date().toISOString();
      await writeState(state);
      return {
        provider: "avantiqo-video",
        provider_job_id: workflowId(usageId),
        status: "completed",
        stage: "COMPLETED",
        video_url: persisted.videoUrl,
        result: persisted.videoUrl,
        storage_reference: persisted.storageReference,
        final_master_resolution: state.master_resolution,
        internal_generation_resolution: "720p",
        generation_backend: state.generation_backend,
        customer_visible_provider: "avantiqo-video",
        workflow_contract: AVANTIQO_VIDEO_WORKFLOW_V3_CONTRACT,
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
        result: signed,
        storage_reference: state.final_storage_reference,
        final_master_resolution: state.master_resolution,
        internal_generation_resolution: "720p",
        generation_backend: state.generation_backend,
        customer_visible_provider: "avantiqo-video",
        workflow_contract: AVANTIQO_VIDEO_WORKFLOW_V3_CONTRACT,
      };
    }

    throw new Error(`AVANTIQO_VIDEO_WORKFLOW_V3_STAGE_INVALID:${text(state.stage)}`);
  },
};
