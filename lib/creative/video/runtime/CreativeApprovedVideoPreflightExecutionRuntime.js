import {
  runAIService,
} from "@/lib/platform/service-runtime/ai";
import {
  ProductionTaskRuntime,
} from "@/lib/operations/tasks/runtime/ProductionTaskRuntime";
import {
  CreativeVideoGenerationPreflightRuntime,
} from "./CreativeVideoGenerationPreflightRuntime";

const FLAG = Symbol.for(
  "avantiqo.creative.approved-video-preflight-execution.v1",
);
const APPROVAL_CONTRACT = "CREATIVE_SINGLE_MEDIA_EXECUTION_APPROVAL_V1";

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function text(value) {
  return String(value ?? "").trim();
}

function same(left, right) {
  return text(left) === text(right);
}

function approvedVideoPreflight(task = {}) {
  const approval = object(task.metadata?.media_generation_authorization);
  if (approval.contract !== APPROVAL_CONTRACT) return null;

  const preflight = object(
    approval.video_generation_preflight ||
    approval.generation_preflight,
  );
  if (!Object.keys(preflight).length) return null;

  if (
    !same(preflight.task_id, task.id) ||
    !same(preflight.creative_project_id, task.creative_project_id) ||
    !same(preflight.production_graph_id, task.production_graph_id) ||
    !same(preflight.organization_id, task.organization_id)
  ) {
    throw new Error("CREATIVE_VIDEO_APPROVED_PREFLIGHT_SCOPE_MISMATCH");
  }
  if (
    text(approval.preflight_sha256) &&
    !same(approval.preflight_sha256, preflight.preflight_sha256)
  ) {
    throw new Error("CREATIVE_VIDEO_APPROVAL_PREFLIGHT_HASH_MISMATCH");
  }

  return {
    approval,
    preflight,
    service_preflight:
      CreativeVideoGenerationPreflightRuntime.serviceExecutionPreflight(preflight),
  };
}

if (!runAIService[FLAG]) {
  const executeWithoutApprovedVideoPreflight = runAIService.execute.bind(
    runAIService,
  );

  Object.defineProperty(runAIService, FLAG, {
    value: true,
    enumerable: false,
    configurable: false,
  });

  runAIService.execute = async function executeWithApprovedVideoPreflight(
    input = {},
  ) {
    const taskId = text(input.metadata?.task_id);
    if (!taskId) return executeWithoutApprovedVideoPreflight(input);

    const task = await ProductionTaskRuntime.get(taskId);
    if (!task) throw new Error("CREATIVE_VIDEO_APPROVED_PREFLIGHT_TASK_NOT_FOUND");

    const bound = approvedVideoPreflight(task);
    if (!bound) return executeWithoutApprovedVideoPreflight(input);

    return executeWithoutApprovedVideoPreflight({
      ...input,
      provider_id: bound.preflight.provider,
      currency: bound.preflight.currency,
      quantity: bound.preflight.quantity,
      input: {
        ...object(input.input),
        quantity: bound.preflight.quantity,
        currency: bound.preflight.currency,
        pricing_dimensions: object(bound.preflight.pricing_dimensions),
      },
      approved_execution_preflight: bound.service_preflight,
      metadata: {
        ...object(input.metadata),
        approved_execution_preflight: bound.service_preflight,
        creative_video_generation_preflight_contract:
          bound.preflight.contract,
        creative_video_generation_preflight_sha256:
          bound.preflight.preflight_sha256,
      },
    });
  };
}

export const CreativeApprovedVideoPreflightExecutionRuntime = Object.freeze({
  installed: true,
  contract: "CREATIVE_APPROVED_VIDEO_PREFLIGHT_EXECUTION_V1",
  approval_contract: APPROVAL_CONTRACT,
  approvedVideoPreflight,
});
