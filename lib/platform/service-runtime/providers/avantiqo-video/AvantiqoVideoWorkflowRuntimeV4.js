import { getServiceSupabase } from "@/lib/shared/supabase/service";
import { resolveCreativeProviderAssetUrl } from "@/lib/creative/assets/storage/resolveCreativeProviderAssetUrl";
import {
  AVANTIQO_VIDEO_STUDIO_MASTER_CONTRACT,
  AVANTIQO_VIDEO_STUDIO_MASTER_MODEL,
  renderCreativeVideoStudioMaster,
} from "@/lib/creative/video/runtime/CreativeVideoStudioMasterRuntime";
import {
  AvantiqoVideoWorkflowRuntimeV3,
  AVANTIQO_VIDEO_WORKFLOW_V3_CONTRACT,
  AVANTIQO_VIDEO_WORKFLOW_V3_JOB_PREFIX,
} from "./AvantiqoVideoWorkflowRuntimeV3.js";

export const AVANTIQO_VIDEO_WORKFLOW_V4_CONTRACT = "AVANTIQO_VIDEO_MASTERING_RECOVERY_WORKFLOW_V4";
export { AVANTIQO_VIDEO_WORKFLOW_V3_JOB_PREFIX as AVANTIQO_VIDEO_WORKFLOW_V4_JOB_PREFIX };

const BUCKET = "creative-assets";

function text(value) { return String(value ?? "").trim(); }
function safeId(value) { return text(value).replace(/[^A-Za-z0-9_-]/g, ""); }
function workflowUsageId(value) {
  const raw = text(value);
  return raw.startsWith(AVANTIQO_VIDEO_WORKFLOW_V3_JOB_PREFIX)
    ? raw.slice(AVANTIQO_VIDEO_WORKFLOW_V3_JOB_PREFIX.length)
    : null;
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
  if (!org || !usage) throw new Error("AVANTIQO_VIDEO_WORKFLOW_V4_IDENTITY_INVALID");
  return `${org}/generated/avantiqo-video/.workflow-v3/${usage}.json`;
}
function finalVideoPath(organizationId, usageId) {
  const usage = safeId(usageId);
  if (!usage) throw new Error("AVANTIQO_VIDEO_WORKFLOW_V4_USAGE_INVALID");
  return `${organizationId}/generated/avantiqo-video/${usage}.mp4`;
}
async function readState(organizationId, usageId) {
  const { data, error } = await getServiceSupabase().storage.from(BUCKET).download(statePath(organizationId, usageId));
  if (error) throw error;
  const state = JSON.parse(await data.text());
  if (state?.contract !== AVANTIQO_VIDEO_WORKFLOW_V3_CONTRACT) {
    throw new Error("AVANTIQO_VIDEO_WORKFLOW_V4_STATE_CONTRACT_INVALID");
  }
  return state;
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
async function persistFinalBuffer({ organizationId, usageId, buffer }) {
  const path = finalVideoPath(organizationId, usageId);
  const { error } = await getServiceSupabase().storage.from(BUCKET).upload(path, buffer, {
    contentType: "video/mp4",
    upsert: true,
  });
  if (error) throw error;
  const storageReference = `storage://${BUCKET}/${path}`;
  const videoUrl = await resolveCreativeProviderAssetUrl({ organization_id: organizationId, value: storageReference });
  if (!videoUrl) throw new Error("AVANTIQO_VIDEO_WORKFLOW_V4_SIGNED_URL_REQUIRED");
  return { storageReference, videoUrl };
}
function completedResult(state) {
  return {
    provider: "avantiqo-video",
    provider_job_id: `${AVANTIQO_VIDEO_WORKFLOW_V3_JOB_PREFIX}${state.usage_id}`,
    status: "completed",
    stage: "COMPLETED",
    video_url: state.final_video_url,
    result: state.final_video_url,
    storage_reference: state.final_storage_reference,
    final_master_resolution: state.master_resolution,
    internal_generation_resolution: "720p",
    generation_backend: state.generation_backend,
    master_backend: state.master_backend,
    studio_compute_only_mastering: true,
    studio_final_encoding: true,
    learned_super_resolution_used: false,
    learned_mastering_attempted: true,
    learned_mastering_failure_code: state.learned_mastering_failure_code || null,
    gpu_mastering_used: false,
    fal_contacted: false,
    external_mastering_provider_contacted: false,
    customer_visible_provider: "avantiqo-video",
    workflow_contract: AVANTIQO_VIDEO_WORKFLOW_V3_CONTRACT,
    recovery_contract: AVANTIQO_VIDEO_WORKFLOW_V4_CONTRACT,
  };
}
async function recoverWithStudio(input, failedResult) {
  const { organizationId, usageId } = identity(input);
  const supplied = input.job_id || input.jobId || input.provider_job_id;
  if (workflowUsageId(supplied) !== usageId) throw new Error("AVANTIQO_VIDEO_WORKFLOW_V4_JOB_USAGE_MISMATCH");
  const state = await readState(organizationId, usageId);
  if (state.stage !== "FLASHVSR_MASTER_FAILED") return failedResult;
  if (!state.foundation_storage_reference) throw new Error("AVANTIQO_VIDEO_WORKFLOW_V4_FOUNDATION_REQUIRED");

  const foundationUrl = await resolveCreativeProviderAssetUrl({
    organization_id: organizationId,
    value: state.foundation_storage_reference,
  });
  if (!foundationUrl) throw new Error("AVANTIQO_VIDEO_WORKFLOW_V4_FOUNDATION_URL_REQUIRED");

  state.learned_mastering_attempted = true;
  state.learned_mastering_failure_code = state.failure_code || failedResult?.error || "AVANTIQO_VIDEO_LEARNED_MASTER_FAILED";
  state.stage = "STUDIO_MASTERING";
  state.master_model = AVANTIQO_VIDEO_STUDIO_MASTER_MODEL;
  state.master_contract = AVANTIQO_VIDEO_STUDIO_MASTER_CONTRACT;
  state.master_job = null;
  state.master_job_id = null;
  state.pod_lease_active = false;
  state.failure_code = null;
  state.updated_at = new Date().toISOString();
  await writeState(state);

  const master = await renderCreativeVideoStudioMaster({
    organization_id: organizationId,
    source_url: foundationUrl,
    target_resolution: state.master_resolution || "4k",
  });
  if (master?.success !== true || !Buffer.isBuffer(master.buffer) || !master.buffer.length) {
    throw new Error("AVANTIQO_VIDEO_WORKFLOW_V4_STUDIO_MASTER_FAILED");
  }
  const persisted = await persistFinalBuffer({ organizationId, usageId, buffer: master.buffer });

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
  state.gpu_deleted_before_studio_encode = true;
  state.fal_contacted = false;
  state.external_mastering_provider_contacted = false;
  state.recovery_contract = AVANTIQO_VIDEO_WORKFLOW_V4_CONTRACT;
  state.updated_at = new Date().toISOString();
  await writeState(state);
  return completedResult(state);
}

export const AvantiqoVideoWorkflowRuntimeV4 = {
  async execute(input = {}) {
    return AvantiqoVideoWorkflowRuntimeV3.execute(input);
  },

  async getStatus(input = {}) {
    const result = await AvantiqoVideoWorkflowRuntimeV3.getStatus(input);
    if (result?.status === "failed" && result?.stage === "FLASHVSR_MASTER_FAILED") {
      return recoverWithStudio(input, result);
    }
    return result;
  },
};
