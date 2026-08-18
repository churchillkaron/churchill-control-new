import {
  runAIService,
} from "@/lib/platform/service-runtime/ai";
import {
  ProductionTaskRuntime,
} from "@/lib/operations/tasks/runtime/ProductionTaskRuntime";

const INSTALL_FLAG = Symbol.for(
  "avantiqo.creative.approved-video-resolution-guard.v1",
);
const SINGLE_MEDIA_APPROVAL_CONTRACT =
  "CREATIVE_SINGLE_MEDIA_EXECUTION_APPROVAL_V1";

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function text(value) {
  return String(value ?? "").trim();
}

function normalizeResolution(value) {
  const normalized = text(value).toLowerCase();
  if (["4k", "2160p", "3840x2160", "2160x3840"].includes(normalized)) {
    return "4k";
  }
  if (["1080p", "1920x1080", "1080x1920"].includes(normalized)) {
    return "1080p";
  }
  if (["720p", "1280x720", "720x1280"].includes(normalized)) {
    return "720p";
  }
  return normalized || null;
}

function executionResolution(input = {}) {
  const payload = object(input.input);
  const generation = object(payload.generation);
  const providerParameters = {
    ...object(generation.provider_parameters),
    ...object(payload.provider_parameters),
  };
  const outputSpec = object(
    payload.output_spec ||
    generation.output_spec,
  );
  const shotBible = object(payload.shot_bible || payload.shotBible);
  const shotOutput = object(shotBible.output);

  return normalizeResolution(
    providerParameters.resolution ||
    outputSpec.provider_resolution ||
    outputSpec.resolution ||
    shotOutput.provider_resolution ||
    shotOutput.resolution,
  );
}

function videoExecution(input = {}) {
  const payload = object(input.input);
  const capability = text(
    input.capability ||
    payload.capability ||
    payload.generation?.capability ||
    payload.generation?.service ||
    input.service_id,
  ).toLowerCase();
  return capability.includes("video");
}

function authorization(task = {}) {
  const approval = object(task.metadata?.media_generation_authorization);
  return approval.contract === SINGLE_MEDIA_APPROVAL_CONTRACT
    ? approval
    : null;
}

function approvedResolution(approval = {}) {
  return normalizeResolution(
    approval.resolution ||
    approval.provider_resolution ||
    approval.output_spec?.provider_resolution ||
    approval.output_spec?.resolution,
  );
}

function assertApprovedResolution(task = {}, execution = {}) {
  if (!videoExecution(execution)) return null;
  const approval = authorization(task);
  if (!approval) return null;

  const approved = approvedResolution(approval);
  const requested = executionResolution(execution);
  if (!approved) {
    throw new Error("CREATIVE_VIDEO_APPROVED_RESOLUTION_REQUIRED");
  }
  if (!requested) {
    throw new Error("CREATIVE_VIDEO_EXECUTION_RESOLUTION_REQUIRED");
  }
  if (requested !== approved) {
    throw new Error(
      `CREATIVE_VIDEO_APPROVED_RESOLUTION_MISMATCH:${requested}:${approved}`,
    );
  }
  return approved;
}

if (!runAIService[INSTALL_FLAG]) {
  const executeWithoutApprovedResolutionGuard = runAIService.execute.bind(
    runAIService,
  );

  Object.defineProperty(runAIService, INSTALL_FLAG, {
    value: true,
    enumerable: false,
    configurable: false,
  });

  runAIService.execute = async function executeWithApprovedVideoResolutionGuard(
    input = {},
  ) {
    const taskId = text(input.metadata?.task_id);
    if (!taskId) return executeWithoutApprovedResolutionGuard(input);

    const task = await ProductionTaskRuntime.get(taskId);
    if (!task) throw new Error("CREATIVE_VIDEO_APPROVED_TASK_NOT_FOUND");

    const resolution = assertApprovedResolution(task, input);
    return executeWithoutApprovedResolutionGuard({
      ...input,
      metadata: {
        ...object(input.metadata),
        ...(resolution
          ? {
              approved_video_resolution: resolution,
              approved_video_resolution_contract:
                "CREATIVE_APPROVED_VIDEO_RESOLUTION_V1",
            }
          : {}),
      },
    });
  };
}

export const CreativeApprovedVideoResolutionGuardRuntime = Object.freeze({
  installed: true,
  contract: "CREATIVE_APPROVED_VIDEO_RESOLUTION_V1",
  normalizeResolution,
  executionResolution,
  approvedResolution,
  assertApprovedResolution,
});
