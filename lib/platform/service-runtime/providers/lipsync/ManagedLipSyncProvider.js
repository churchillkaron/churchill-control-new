import {
  CredentialRuntime,
} from "@/lib/platform/service-runtime/credentials/runtime/CredentialRuntime";
import {
  resolveCreativeProviderAssetUrl,
} from "@/lib/creative/assets/storage/resolveCreativeProviderAssetUrl";

function compactObject(value = {}) {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== undefined && item !== null && item !== ""),
  );
}

function text(value) {
  return String(value ?? "").trim();
}

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

async function resolveCredential(credentialId = null) {
  const credential = credentialId
    ? await CredentialRuntime.resolve(credentialId)
    : null;
  const apiKey = credential?.secret_reference ||
    process.env.AVANTIQO_LIPSYNC_API_KEY ||
    null;
  if (!apiKey) throw new Error("MANAGED_LIPSYNC_CREDENTIAL_REQUIRED");
  return { credential, apiKey };
}

function endpoint(input = {}, purpose = "submit") {
  const configured = purpose === "status"
    ? input.status_endpoint || input.statusEndpoint || process.env.AVANTIQO_LIPSYNC_STATUS_API_URL
    : input.endpoint || input.api_url || input.apiUrl || process.env.AVANTIQO_LIPSYNC_API_URL;
  if (!configured) {
    throw new Error(
      purpose === "status"
        ? "MANAGED_LIPSYNC_STATUS_ENDPOINT_REQUIRED"
        : "MANAGED_LIPSYNC_ENDPOINT_REQUIRED",
    );
  }
  return configured;
}

function statusEndpoint(template, jobId) {
  return template.includes("{job_id}")
    ? template.replace("{job_id}", encodeURIComponent(jobId))
    : `${template.replace(/\/$/, "")}/${encodeURIComponent(jobId)}`;
}

function outputValue(result = {}) {
  return result.output || result.video_url || result.videoUrl || result.url || result.result || null;
}

function jobId(result = {}) {
  return result.id || result.job_id || result.jobId || result.task_id || result.taskId || null;
}

async function resolvedMedia({ organizationId, value, label }) {
  const resolved = await resolveCreativeProviderAssetUrl({
    organization_id: organizationId,
    value,
  });
  if (!resolved) throw new Error(`${label}_REQUIRED`);
  return resolved;
}

export const ManagedLipSyncProvider = {
  id: "managed_lipsync",

  async execute(input = {}) {
    if (input.capability !== "ai.video.lip_sync") {
      throw new Error(`Managed lip sync capability not supported: ${input.capability}`);
    }
    const organizationId = input.context?.organization_id;
    if (!organizationId) throw new Error("organization_id required");
    const { apiKey } = await resolveCredential(input.credential_id);
    const video = await resolvedMedia({
      organizationId,
      value:
        input.video ||
        input.video_source ||
        input.videoSource ||
        input.source_video ||
        input.sourceVideo,
      label: "MANAGED_LIPSYNC_VIDEO_SOURCE",
    });
    const audio = await resolvedMedia({
      organizationId,
      value:
        input.audio ||
        input.audio_source ||
        input.audioSource ||
        input.source_audio ||
        input.sourceAudio,
      label: "MANAGED_LIPSYNC_AUDIO_SOURCE",
    });
    const start = finite(input.audio_start_seconds ?? input.audioStartSeconds);
    const end = finite(input.audio_end_seconds ?? input.audioEndSeconds);
    if (start === null || end === null || end <= start) {
      throw new Error("MANAGED_LIPSYNC_AUDIO_RANGE_INVALID");
    }
    const identityProfileId = text(
      input.identity_profile_id ||
      input.identityProfileId ||
      input.identity_lock?.identity_profile_id,
    );
    if (!identityProfileId) throw new Error("MANAGED_LIPSYNC_IDENTITY_PROFILE_REQUIRED");

    const body = compactObject({
      video_url: video,
      audio_url: audio,
      audio_start_seconds: start,
      audio_end_seconds: end,
      identity_profile_id: identityProfileId,
      identity_atlas_url:
        input.identity_atlas_url ||
        input.identityAtlasUrl ||
        input.identity_lock?.identity_atlas_url ||
        null,
      preserve_identity: true,
      preserve_head_pose: input.preserve_head_pose !== false,
      preserve_camera_motion: input.preserve_camera_motion !== false,
      preserve_body_motion: input.preserve_body_motion !== false,
      mouth_visibility_required: true,
      singing_performance: true,
      output_spec: input.output_spec || input.outputSpec || {},
      provider_options: input.provider_options || input.providerOptions || {},
    });
    const response = await fetch(endpoint(input, "submit"), {
      method: input.method || "POST",
      headers: compactObject({
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        ...(input.headers || {}),
      }),
      body: JSON.stringify(body),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(
        result?.error?.message ||
        result?.message ||
        `Managed lip sync request failed with status ${response.status}`,
      );
    }
    const id = jobId(result);
    const output = outputValue(result);
    if (!id && !output) throw new Error("MANAGED_LIPSYNC_OUTPUT_OR_JOB_REQUIRED");

    return {
      success: true,
      provider: "managed_lipsync",
      model: input.model || null,
      output: {
        provider_job_id: id,
        status: id && !output ? "processing" : "completed",
        result: output,
        video_source_url: video,
        audio_source_url: audio,
        audio_start_seconds: start,
        audio_end_seconds: end,
        identity_profile_id: identityProfileId,
        audio_conditioned: true,
        preserve_identity: true,
        raw: result,
      },
    };
  },

  async getStatus(input = {}) {
    const id = input.job_id || input.jobId || input.provider_job_id;
    if (!id) throw new Error("MANAGED_LIPSYNC_JOB_ID_REQUIRED");
    const { apiKey } = await resolveCredential(input.credential_id);
    const response = await fetch(statusEndpoint(endpoint(input, "status"), id), {
      method: input.method || "GET",
      headers: compactObject({
        Authorization: `Bearer ${apiKey}`,
        ...(input.headers || {}),
      }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(
        result?.error?.message ||
        result?.message ||
        `Managed lip sync status failed with status ${response.status}`,
      );
    }
    const status = text(result.status || result.state).toLowerCase();
    const output = outputValue(result);
    const failed = ["failed", "error", "cancelled", "canceled"].includes(status);
    const completed = Boolean(output) || ["completed", "succeeded", "success", "done"].includes(status);
    return {
      success: !failed,
      failed,
      pending: !failed && !completed,
      provider: "managed_lipsync",
      provider_job_id: id,
      provider_status: status || (completed ? "completed" : "processing"),
      error: failed ? result?.error?.message || result?.message || "Managed lip sync failed" : null,
      output: completed ? output : null,
      raw: result,
    };
  },
};
