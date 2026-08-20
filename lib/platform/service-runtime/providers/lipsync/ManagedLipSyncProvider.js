import {
  CredentialRuntime,
} from "@/lib/platform/service-runtime/credentials/runtime/CredentialRuntime";
import {
  resolveCreativeProviderAssetUrl,
} from "@/lib/creative/assets/storage/resolveCreativeProviderAssetUrl";
import {
  FalLipSyncProvider,
} from "@/lib/platform/service-runtime/providers/fal/FalLipSyncProvider";

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

function configuredEndpoint(input = {}, purpose = "submit") {
  if (purpose === "status") {
    return text(
      input.status_endpoint ||
      input.statusEndpoint ||
      process.env.AVANTIQO_LIPSYNC_STATUS_API_URL,
    ) || null;
  }
  if (purpose === "validate") {
    return text(
      input.validation_endpoint ||
      input.validationEndpoint ||
      process.env.AVANTIQO_LIPSYNC_VALIDATION_API_URL,
    ) || null;
  }
  return text(
    input.endpoint ||
    input.api_url ||
    input.apiUrl ||
    process.env.AVANTIQO_LIPSYNC_API_URL,
  ) || null;
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

function falJobId(requestId) {
  return requestId ? `fal-sync3:${requestId}` : null;
}

function falRequestId(value) {
  const source = text(value);
  return source.startsWith("fal-sync3:")
    ? source.slice("fal-sync3:".length)
    : null;
}

async function resolvedMedia({ organizationId, value, label }) {
  const resolved = await resolveCreativeProviderAssetUrl({
    organization_id: organizationId,
    value,
  });
  if (!resolved) throw new Error(`${label}_REQUIRED`);
  return resolved;
}

async function requestJson({ url, method = "POST", apiKey, headers = {}, body = null }) {
  const response = await fetch(url, {
    method,
    headers: compactObject({
      Authorization: `Bearer ${apiKey}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...headers,
    }),
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      result?.error?.message ||
      result?.message ||
      `Managed lip sync request failed with status ${response.status}`,
    );
  }
  return result;
}

async function lipSync(input = {}) {
  const organizationId = input.context?.organization_id;
  if (!organizationId) throw new Error("organization_id required");
  const video = await resolvedMedia({
    organizationId,
    value: input.video || input.video_source || input.videoSource || input.source_video || input.sourceVideo,
    label: "MANAGED_LIPSYNC_VIDEO_SOURCE",
  });
  const audio = await resolvedMedia({
    organizationId,
    value: input.audio || input.audio_source || input.audioSource || input.source_audio || input.sourceAudio,
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

  const custom = configuredEndpoint(input, "submit");
  if (!custom) {
    const result = await FalLipSyncProvider.submit({
      video_url: video,
      audio_url: audio,
      sync_mode: input.sync_mode || "cut_off",
      model: "fal-ai/sync-lipsync/v3",
      credential_id: input.credential_id || null,
      active_speaker_detection: input.active_speaker_detection !== false,
    });
    return {
      success: true,
      provider: "managed_lipsync",
      model: result.model,
      output: {
        provider_job_id: falJobId(result.request_id),
        status: result.pending ? "processing" : "completed",
        result: result.output_url || null,
        video_source_url: video,
        audio_source_url: audio,
        audio_start_seconds: start,
        audio_end_seconds: end,
        identity_profile_id: identityProfileId,
        vocal_performance_mode: input.vocal_performance_mode || null,
        audio_conditioned: true,
        preserve_identity: true,
        preserve_head_pose: true,
        preserve_camera_motion: true,
        preserve_body_motion: true,
        transport: "FAL_SYNC_V3",
        raw: result.raw,
      },
    };
  }

  const { apiKey } = await resolveCredential(input.credential_id);
  const result = await requestJson({
    url: custom,
    method: input.method || "POST",
    apiKey,
    headers: input.headers || {},
    body: compactObject({
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
      vocal_performance_mode: input.vocal_performance_mode || null,
      preserve_identity: true,
      preserve_head_pose: input.preserve_head_pose !== false,
      preserve_camera_motion: input.preserve_camera_motion !== false,
      preserve_body_motion: input.preserve_body_motion !== false,
      mouth_visibility_required: true,
      natural_face_motion_required: true,
      output_spec: input.output_spec || input.outputSpec || {},
      provider_options: input.provider_options || input.providerOptions || {},
    }),
  });
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
      vocal_performance_mode: input.vocal_performance_mode || null,
      audio_conditioned: true,
      preserve_identity: true,
      transport: "AVANTIQO_MANAGED_ENDPOINT",
      raw: result,
    },
  };
}

async function validateLipSync(input = {}) {
  const organizationId = input.context?.organization_id;
  if (!organizationId) throw new Error("organization_id required");
  const video = await resolvedMedia({
    organizationId,
    value: input.video || input.video_source || input.videoSource || input.source_video || input.sourceVideo,
    label: "MANAGED_LIPSYNC_VALIDATION_VIDEO",
  });
  const audio = await resolvedMedia({
    organizationId,
    value: input.audio || input.audio_source || input.audioSource || input.source_audio || input.sourceAudio,
    label: "MANAGED_LIPSYNC_VALIDATION_AUDIO",
  });
  const start = finite(input.audio_start_seconds ?? input.audioStartSeconds);
  const end = finite(input.audio_end_seconds ?? input.audioEndSeconds);
  if (start === null || end === null || end <= start) {
    throw new Error("MANAGED_LIPSYNC_VALIDATION_AUDIO_RANGE_INVALID");
  }

  const minimumSync = Number(input.minimum_sync_score || 88);
  const minimumIdentity = Number(input.minimum_identity_score || 90);
  const minimumPerformance = Number(input.minimum_performance_score || 82);
  const validationEndpoint = configuredEndpoint(input, "validate");

  if (!validationEndpoint) {
    return {
      success: true,
      provider: "managed_lipsync",
      model: null,
      output: {
        result: {
          passed: null,
          automated_validation_available: false,
          trusted_sync_score_available: false,
          human_review_required: true,
          mouth_visible: null,
          audio_conditioned: true,
          identity_preserved: null,
          natural_face_motion: null,
          minimum_sync_score: minimumSync,
          minimum_identity_score: minimumIdentity,
          minimum_performance_score: minimumPerformance,
        },
        video_source_url: video,
        audio_source_url: audio,
        audio_start_seconds: start,
        audio_end_seconds: end,
        validation_contract: "AUDIO_CONDITIONED_LIPSYNC_VALIDATION_V2",
        validation_mode: "HUMAN_FAIL_CLOSED_NO_TRUSTED_AUTOMATED_EVALUATOR",
      },
    };
  }

  const { apiKey } = await resolveCredential(input.credential_id);
  const result = await requestJson({
    url: validationEndpoint,
    method: input.method || "POST",
    apiKey,
    headers: input.headers || {},
    body: compactObject({
      video_url: video,
      audio_url: audio,
      audio_start_seconds: start,
      audio_end_seconds: end,
      identity_profile_id: input.identity_profile_id || input.identityProfileId || null,
      identity_atlas_url: input.identity_atlas_url || input.identityAtlasUrl || null,
      vocal_performance_mode: input.vocal_performance_mode || null,
      require_visible_mouth: true,
      require_audio_conditioned_sync: true,
      require_identity_preservation: true,
      require_natural_face_motion: true,
      minimum_sync_score: minimumSync,
      minimum_identity_score: minimumIdentity,
      minimum_performance_score: minimumPerformance,
    }),
  });
  const evidence = result.result || result.validation || result;
  const syncScore = finite(evidence.sync_score ?? evidence.syncScore);
  const identityScore = finite(evidence.identity_score ?? evidence.identityScore);
  const performanceScore = finite(evidence.performance_score ?? evidence.performanceScore);
  const passed = evidence.passed === true &&
    syncScore !== null && syncScore >= minimumSync &&
    identityScore !== null && identityScore >= minimumIdentity &&
    performanceScore !== null && performanceScore >= minimumPerformance &&
    evidence.mouth_visible !== false &&
    evidence.audio_conditioned !== false &&
    evidence.identity_preserved !== false &&
    evidence.natural_face_motion !== false;

  return {
    success: true,
    provider: "managed_lipsync",
    model: input.model || null,
    output: {
      result: {
        ...evidence,
        passed,
        automated_validation_available: true,
        trusted_sync_score_available: syncScore !== null,
        sync_score: syncScore,
        identity_score: identityScore,
        performance_score: performanceScore,
        minimum_sync_score: minimumSync,
        minimum_identity_score: minimumIdentity,
        minimum_performance_score: minimumPerformance,
      },
      video_source_url: video,
      audio_source_url: audio,
      audio_start_seconds: start,
      audio_end_seconds: end,
      validation_contract: "AUDIO_CONDITIONED_LIPSYNC_VALIDATION_V2",
      raw: result,
    },
  };
}

export const ManagedLipSyncProvider = {
  id: "managed_lipsync",

  async execute(input = {}) {
    if (
      input.capability === "ai.video.lipsync" ||
      input.capability === "ai.video.lip_sync"
    ) {
      return lipSync(input);
    }
    if (
      input.capability === "ai.video.lipsync.validate" ||
      input.capability === "ai.video.lip_sync.validate"
    ) {
      return validateLipSync(input);
    }
    throw new Error(`Managed lip sync capability not supported: ${input.capability}`);
  },

  async getStatus(input = {}) {
    const id = input.job_id || input.jobId || input.provider_job_id;
    if (!id) throw new Error("MANAGED_LIPSYNC_JOB_ID_REQUIRED");

    const falRequest = falRequestId(id);
    if (falRequest) {
      const result = await FalLipSyncProvider.poll({
        request_id: falRequest,
        model: "fal-ai/sync-lipsync/v3",
        credential_id: input.credential_id || null,
      });
      return {
        success: true,
        failed: false,
        pending: result.pending,
        provider: "managed_lipsync",
        provider_job_id: id,
        provider_status: result.status || (result.pending ? "processing" : "completed"),
        output: result.pending ? null : result.output_url,
        model: result.model,
        raw: result.raw,
      };
    }

    const statusTemplate = configuredEndpoint(input, "status");
    if (!statusTemplate) {
      throw new Error("MANAGED_LIPSYNC_STATUS_ENDPOINT_REQUIRED");
    }
    const { apiKey } = await resolveCredential(input.credential_id);
    const result = await requestJson({
      url: statusEndpoint(statusTemplate, id),
      method: input.method || "GET",
      apiKey,
      headers: input.headers || {},
    });
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