import { getServiceSupabase } from "@/lib/shared/supabase/service";
import { AvantiqoVideoWorkflowRuntime as LegacyWorkflow } from "./AvantiqoVideoWorkflowRuntime.js";
import { resolveAvantiqoVideoRoute } from "./AvantiqoVideoCapacityRouter.js";
import {
  getAvantiqoVideoGoogleNative4kStatus,
  inspectAvantiqoVideoGoogleNative4kReadiness,
  isAvantiqoVideoGoogleNative4kSafeFallbackError,
  submitAvantiqoVideoGoogleNative4k,
} from "./AvantiqoVideoGoogleNative4kRuntime.js";

export const AVANTIQO_VIDEO_WORKFLOW_V2_CONTRACT =
  "AVANTIQO_VIDEO_RESILIENT_ROUTED_WORKFLOW_V2";
export const AVANTIQO_VIDEO_WORKFLOW_V2_JOB_PREFIX = "video-workflow-v2:";

const BUCKET = "creative-assets";
const T2V = "ai.video.generate";

function text(value) { return String(value ?? "").trim(); }
function safeId(value) { return text(value).replace(/[^A-Za-z0-9_-]/g, ""); }

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
  if (!org || !usage) throw new Error("AVANTIQO_VIDEO_WORKFLOW_V2_IDENTITY_INVALID");
  return `${org}/generated/avantiqo-video/.workflow-v2/${usage}.json`;
}

function workflowId(usageId) {
  return `${AVANTIQO_VIDEO_WORKFLOW_V2_JOB_PREFIX}${usageId}`;
}

function workflowUsageId(value) {
  const jobId = text(value);
  return jobId.startsWith(AVANTIQO_VIDEO_WORKFLOW_V2_JOB_PREFIX)
    ? jobId.slice(AVANTIQO_VIDEO_WORKFLOW_V2_JOB_PREFIX.length)
    : null;
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
  const { data, error } = await supabase.storage.from(BUCKET).download(
    statePath(organizationId, usageId),
  );
  if (error) {
    const status = Number(error?.statusCode ?? error?.status ?? 0);
    const message = text(error?.message).toLowerCase();
    if (status === 400 || status === 404 || message.includes("not found") || message.includes("object not found")) {
      return null;
    }
    throw error;
  }
  const parsed = JSON.parse(await data.text());
  if (parsed?.contract !== AVANTIQO_VIDEO_WORKFLOW_V2_CONTRACT) {
    throw new Error("AVANTIQO_VIDEO_WORKFLOW_V2_STATE_CONTRACT_INVALID");
  }
  return parsed;
}

function queuedResult(state) {
  return {
    success: true,
    provider: "avantiqo-video",
    model: "avantiqo-cinema-v1",
    output: {
      provider_job_id: workflowId(state.usage_id),
      status: state.stage === "COMPLETED" ? "completed" : "queued",
      stage: state.stage,
      workflow_contract: AVANTIQO_VIDEO_WORKFLOW_V2_CONTRACT,
      route: state.route,
      route_reason: state.route_reason,
      generation_backend: state.generation_backend,
      internal_generation_resolution: state.internal_generation_resolution,
      final_master_resolution: state.final_master_resolution,
      customer_visible_provider: "avantiqo-video",
      prompt_persisted: false,
      runpod_lease_active: false,
      ...(state.final_storage_reference ? {
        storage_reference: state.final_storage_reference,
        video_url: state.final_video_url,
        result: state.final_video_url,
      } : {}),
    },
  };
}

function fallbackInput(input = {}) {
  return {
    ...input,
    capability: T2V,
    duration_seconds: 8,
    delivery_resolution: "4k",
  };
}

export const AvantiqoVideoWorkflowRuntimeV2 = {
  async execute(input = {}) {
    const capability = text(input.capability);
    if (capability !== T2V) return LegacyWorkflow.execute(input);

    const { organizationId, usageId } = identity(input);
    const existing = await readState(organizationId, usageId);
    if (existing) {
      if (existing.stage === "GOOGLE_SUBMITTING") {
        throw new Error("AVANTIQO_VIDEO_GOOGLE_SUBMISSION_RECONCILIATION_REQUIRED");
      }
      return queuedResult(existing);
    }

    const route = await resolveAvantiqoVideoRoute({ capability, forceRefresh: true });
    if (route.route === "OWNED") return LegacyWorkflow.execute(input);
    if (route.route !== "MANAGED_FALLBACK") return LegacyWorkflow.execute(input);

    const googleInput = fallbackInput(input);
    try {
      await inspectAvantiqoVideoGoogleNative4kReadiness(googleInput);
    } catch (error) {
      if (isAvantiqoVideoGoogleNative4kSafeFallbackError(error)) {
        return LegacyWorkflow.execute(input);
      }
      throw error;
    }

    const state = {
      contract: AVANTIQO_VIDEO_WORKFLOW_V2_CONTRACT,
      organization_id: organizationId,
      usage_id: usageId,
      capability,
      stage: "GOOGLE_SUBMITTING",
      route: "MANAGED_FALLBACK",
      route_reason: `${route.reason}:GOOGLE_VEO_NATIVE_4K`,
      generation_backend: "MANAGED_GOOGLE_VEO_3_1_FAST_NATIVE_4K",
      generation_model: "veo-3.1-fast-generate-preview",
      generation_job_id: null,
      internal_generation_resolution: "4k",
      final_master_resolution: "4k",
      mastering_backend: "NATIVE_GOOGLE_VEO_4K",
      final_storage_reference: null,
      final_video_url: null,
      prompt_persisted: false,
      runpod_lease_active: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    await writeState(state);

    let submitted;
    try {
      submitted = await submitAvantiqoVideoGoogleNative4k(googleInput);
    } catch (error) {
      if (isAvantiqoVideoGoogleNative4kSafeFallbackError(error)) {
        state.stage = "FAILED_PRE_SUBMISSION";
        state.failure_code = text(error?.message || error).split(":")[0];
        state.updated_at = new Date().toISOString();
        await writeState(state);
        return LegacyWorkflow.execute(input);
      }
      state.failure_code = "AVANTIQO_VIDEO_GOOGLE_SUBMISSION_AMBIGUOUS";
      state.updated_at = new Date().toISOString();
      await writeState(state).catch(() => null);
      throw error;
    }

    state.generation_job_id = submitted.provider_job_id;
    state.stage = "GOOGLE_GENERATION";
    state.updated_at = new Date().toISOString();
    await writeState(state);
    return queuedResult(state);
  },

  async getStatus(input = {}) {
    const supplied = input.job_id || input.jobId || input.provider_job_id;
    const usageFromJob = workflowUsageId(supplied);
    if (!usageFromJob) return LegacyWorkflow.getStatus(input);

    const { organizationId, usageId } = identity(input);
    if (usageFromJob !== usageId) {
      throw new Error("AVANTIQO_VIDEO_WORKFLOW_V2_JOB_USAGE_MISMATCH");
    }
    const state = await readState(organizationId, usageId);
    if (!state) throw new Error("AVANTIQO_VIDEO_WORKFLOW_V2_STATE_MISSING");

    if (state.stage === "GOOGLE_SUBMITTING") {
      return {
        provider: "avantiqo-video",
        provider_job_id: workflowId(usageId),
        status: "failed",
        stage: state.stage,
        error: "AVANTIQO_VIDEO_GOOGLE_SUBMISSION_RECONCILIATION_REQUIRED",
      };
    }

    if (state.stage === "FAILED_PRE_SUBMISSION" || state.stage === "FAILED") {
      return {
        provider: "avantiqo-video",
        provider_job_id: workflowId(usageId),
        status: "failed",
        stage: state.stage,
        error: state.failure_code || "AVANTIQO_VIDEO_WORKFLOW_V2_FAILED",
      };
    }

    if (state.stage === "COMPLETED") {
      return {
        provider: "avantiqo-video",
        provider_job_id: workflowId(usageId),
        status: "completed",
        stage: "COMPLETED",
        video_url: state.final_video_url,
        result: state.final_video_url,
        storage_reference: state.final_storage_reference,
        final_master_resolution: "4k",
        internal_generation_resolution: "4k",
        generation_backend: state.generation_backend,
        mastering_backend: state.mastering_backend,
        customer_visible_provider: "avantiqo-video",
        workflow_contract: AVANTIQO_VIDEO_WORKFLOW_V2_CONTRACT,
      };
    }

    if (state.stage !== "GOOGLE_GENERATION" || !state.generation_job_id) {
      throw new Error(`AVANTIQO_VIDEO_WORKFLOW_V2_STAGE_INVALID:${text(state.stage)}`);
    }

    const googleInput = fallbackInput({
      ...input,
      capability: T2V,
      context: {
        ...(input.context || {}),
        organization_id: organizationId,
        usage_id: usageId,
      },
    });
    const result = await getAvantiqoVideoGoogleNative4kStatus({
      input: googleInput,
      jobId: state.generation_job_id,
    });

    if (result.status === "processing") {
      return {
        provider: "avantiqo-video",
        provider_job_id: workflowId(usageId),
        status: "processing",
        stage: "GENERATION",
        route: state.route,
        generation_backend: state.generation_backend,
        final_master_resolution: "4k",
        runpod_lease_active: false,
      };
    }

    if (result.status === "failed") {
      state.stage = "FAILED";
      state.failure_code = text(result.error) || "AVANTIQO_VIDEO_GOOGLE_NATIVE4K_FAILED";
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

    if (result.status !== "completed" || !result.storage_reference || !result.video_url) {
      throw new Error("AVANTIQO_VIDEO_GOOGLE_NATIVE4K_COMPLETION_INVALID");
    }

    state.stage = "COMPLETED";
    state.final_storage_reference = result.storage_reference;
    state.final_video_url = result.video_url;
    state.updated_at = new Date().toISOString();
    await writeState(state);

    return {
      provider: "avantiqo-video",
      provider_job_id: workflowId(usageId),
      status: "completed",
      stage: "COMPLETED",
      video_url: result.video_url,
      result: result.video_url,
      storage_reference: result.storage_reference,
      final_master_resolution: "4k",
      internal_generation_resolution: "4k",
      generation_backend: state.generation_backend,
      mastering_backend: state.mastering_backend,
      customer_visible_provider: "avantiqo-video",
      workflow_contract: AVANTIQO_VIDEO_WORKFLOW_V2_CONTRACT,
    };
  },
};
