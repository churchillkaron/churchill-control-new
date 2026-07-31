import crypto from "node:crypto";

import {
  ServiceExecutionRuntime,
} from "@/lib/platform/service-runtime/execution/ServiceExecutionRuntime";
import {
  UsageRuntime,
} from "@/lib/platform/service-runtime/usage/UsageRuntime";
import {
  CreativeMasterPlanCompletionRuntimeV2,
} from "./CreativeMasterPlanCompletionRuntimeV2";

const INSTALL_FLAG = Symbol.for(
  "avantiqo.creative.direction-result-completion.v4",
);

const FULL_PLAN_COMPLETION_OPERATIONS = new Set([
  "MASTER_PLAN_V3",
  "TEMPORAL_MASTER_PLAN_BASE_V1",
]);

const SCENE_COMPLETION_OPERATIONS = new Set([
  "TEMPORAL_SCENE_ARCHITECTURE_V1",
]);

const SHOT_COMPLETION_OPERATIONS = new Set([
  "TEMPORAL_SCENE_SHOT_DIRECTION_V1",
]);

const REPEATABLE_OPERATIONS = new Set([
  "TEMPORAL_SCENE_SHOT_DIRECTION_V1",
]);

const ASSET_DISPOSITIONS = new Set([
  "ASSIGNED",
  "REFERENCE",
  "REGENERATE",
  "EXCLUDE",
]);

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function text(value) {
  return String(value ?? "").trim();
}

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function parseJson(value) {
  if (value && typeof value === "object") return value;
  const source = text(value).replace(/^\uFEFF/, "");
  if (!source) return null;
  const candidates = [source];
  for (const match of source.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)) {
    if (match[1]) candidates.push(match[1].trim());
  }
  const firstBrace = source.indexOf("{");
  const lastBrace = source.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    candidates.push(source.slice(firstBrace, lastBrace + 1));
  }
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed;
      }
    } catch {
      // Continue with the next conservative extraction.
    }
  }
  return null;
}

function requestIdentity(input = {}) {
  const operation = text(input.metadata?.operation).toUpperCase();
  const request = {
    operation,
    prompt: input.input?.prompt || input.input?.input || input.input?.messages || "",
    response_format: input.input?.response_format || null,
    max_output_tokens:
      input.input?.max_output_tokens ?? input.input?.maxOutputTokens ?? null,
    quantity: input.input?.quantity ?? 1,
  };
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(request))
    .digest("hex");
}

function promptContext(input = {}) {
  const prompt = text(input.input?.prompt || input.prompt);
  const marker = "\nINPUT\n";
  const index = prompt.lastIndexOf(marker);
  if (index < 0) return {};
  const parsed = parseJson(prompt.slice(index + marker.length));
  return object(parsed);
}

function resultPayload(result = {}) {
  const providerResult = object(result.output);
  const payload = Object.keys(object(providerResult.output)).length
    ? object(providerResult.output)
    : providerResult;
  const parsed = parseJson(payload.text || payload.content || payload);
  return object(parsed?.result || parsed);
}

function completeAssetManifest(plan = {}, context = {}) {
  const deliverableId = text(list(plan.deliverables)[0]?.id) || "deliverable-1";
  const sceneId = text(list(plan.scenes)[0]?.id);
  const shotId = text(list(list(plan.scenes)[0]?.shots)[0]?.id);
  const defaultAssignment = shotId || sceneId || deliverableId;
  const assetById = new Map(
    list(context.assets).map((asset) => [
      text(asset?.asset_id || asset?.id),
      asset,
    ]),
  );

  return list(plan.asset_manifest).map((entry) => {
    const source = object(entry);
    const assetId = text(source.asset_id || source.id);
    const asset = object(assetById.get(assetId));
    const suppliedDisposition = text(source.disposition).toUpperCase();
    const disposition = ASSET_DISPOSITIONS.has(suppliedDisposition)
      ? suppliedDisposition
      : "REFERENCE";
    const currentReason = text(source.reason);
    const assetName = text(asset.name || asset.title || asset.file_name) ||
      assetId || "selected asset";
    const reason = currentReason.length >= 15
      ? currentReason
      : `${currentReason ? `${currentReason}. ` : ""}Use ${assetName} only according to its verified source role, rights, quality and continuity evidence.`;
    const confidence = finite(source.confidence);
    const assignments = list(source.assignments).length
      ? source.assignments
      : disposition === "EXCLUDE" ? [] : [defaultAssignment];

    return {
      ...source,
      asset_id: assetId,
      disposition,
      reason,
      confidence: confidence !== null && confidence >= 0 && confidence <= 100
        ? confidence
        : 80,
      assignments,
      restrictions: object(source.restrictions),
      continuity_anchors: object(source.continuity_anchors),
      repair_requirements: list(source.repair_requirements).length
        ? source.repair_requirements
        : [
            "Preserve verified identity, product, location and source provenance during any bounded repair",
          ],
    };
  });
}

function completionEnvelope({ scenes = [], durationSeconds = 10 } = {}) {
  return {
    workflow_kind: "TEMPORAL",
    concept: {},
    story: {},
    deliverables: [
      {
        id: "temporal-completion-envelope",
        type: "VIDEO",
        purpose: "Complete already-directed temporal material before strict local validation.",
        output_spec: {
          duration_seconds: durationSeconds,
        },
      },
    ],
    asset_manifest: [],
    role_decisions: {},
    scenes,
    quality: {},
  };
}

function completeFullPlan(payload, context) {
  const completed = CreativeMasterPlanCompletionRuntimeV2.complete({
    plan: payload,
    mission: object(context.mission),
    project: object(context.project),
    brief: object(context.brief),
    assets: list(context.assets),
  });
  completed.asset_manifest = completeAssetManifest(completed, context);
  completed.completion = {
    ...object(completed.completion),
    operation_scope: "FULL_PLAN",
    asset_manifest_completed: true,
  };
  return completed;
}

function completeSceneArchitecture(payload, context) {
  const source = object(payload);
  const completed = CreativeMasterPlanCompletionRuntimeV2.complete({
    plan: completionEnvelope({ scenes: list(source.scenes) }),
    mission: object(context.mission),
    project: object(context.project),
    brief: object(context.brief),
  });
  return {
    ...source,
    scenes: list(completed.scenes).map((scene) => ({
      ...scene,
      shots: undefined,
    })),
    direction_completion: {
      ...object(completed.completion),
      operation_scope: "SCENE_ARCHITECTURE",
    },
  };
}

function completeShotDirection(payload, context) {
  const source = object(payload);
  const durationSeconds = list(source.shots).reduce(
    (sum, shot) => sum + Math.max(0, finite(shot?.duration_seconds) || 0),
    0,
  ) || 10;
  const completed = CreativeMasterPlanCompletionRuntimeV2.complete({
    plan: completionEnvelope({
      durationSeconds,
      scenes: [
        {
          id: "temporal-shot-completion-scene",
          title: "Temporal shot completion scene",
          objective: "Preserve the supplied scene objective while making every shot instruction executable.",
          story_state_before: "The supplied scene has not yet completed its intended visible state change.",
          state_change: "The supplied shot sequence creates the intended visible and causal scene progression.",
          story_state_after: "The supplied scene has completed its intended visible state change.",
          transition_logic: "The completed scene state motivates the following approved story beat.",
          duration_seconds: durationSeconds,
          shots: list(source.shots),
        },
      ],
    }),
    mission: object(context.mission),
    project: object(context.project),
    brief: object(context.brief),
  });
  return {
    ...source,
    shots: list(completed.scenes)[0]?.shots || list(source.shots),
    direction_completion: {
      ...object(completed.completion),
      operation_scope: "SHOT_DIRECTION",
    },
  };
}

function completeOperationPayload(operation, payload, context) {
  if (FULL_PLAN_COMPLETION_OPERATIONS.has(operation)) {
    return completeFullPlan(payload, context);
  }
  if (SCENE_COMPLETION_OPERATIONS.has(operation)) {
    return completeSceneArchitecture(payload, context);
  }
  if (SHOT_COMPLETION_OPERATIONS.has(operation)) {
    return completeShotDirection(payload, context);
  }
  return null;
}

function withCompletedPayload(result = {}, completed = {}, recovery = null) {
  const providerResult = object(result.output);
  const nested = object(providerResult.output);
  const completionEvidence = {
    ...object(completed.direction_completion || completed.completion),
    recovered_from_existing_usage: Boolean(recovery?.usage_id),
    recovered_usage_id: recovery?.usage_id || null,
    recovered_request_hash: recovery?.request_hash || null,
  };
  const payload = {
    ...completed,
    text: JSON.stringify(completed),
    direction_completion: completionEvidence,
  };

  if (Object.keys(nested).length) {
    return {
      ...result,
      output: {
        ...providerResult,
        output: {
          ...nested,
          ...payload,
        },
      },
    };
  }

  return {
    ...result,
    output: {
      ...providerResult,
      ...payload,
    },
  };
}

function serviceResultFromUsage(usage = {}) {
  const providerResult = object(usage.metadata?.result);
  return {
    success: true,
    pending: false,
    provider: usage.provider || providerResult.provider || null,
    model: usage.metadata?.model || providerResult.model || null,
    pricing: usage.metadata?.settled_pricing || null,
    reservation_pricing: usage.metadata?.reservation_pricing || null,
    usage,
    billing: {
      id: usage.billing_invoice_line_id || usage.invoice_id || null,
      usage,
    },
    settlement: "CHARGED",
    output: providerResult,
  };
}

async function recoverExistingDirectionUsage(input = {}, requestHash) {
  const organizationId = text(input.organization_id);
  const projectId = text(input.metadata?.creative_project_id);
  const operation = text(input.metadata?.operation).toUpperCase();
  if (!organizationId || !projectId || !operation) return null;

  const rows = await UsageRuntime.organization(organizationId);
  const candidates = rows
    .filter((row) => text(row.status).toUpperCase() === "SUCCESS")
    .filter((row) => text(row.category).toUpperCase() === "CREATIVE_DIRECTION")
    .filter((row) => text(row.metadata?.creative_project_id) === projectId)
    .filter((row) => text(row.metadata?.operation).toUpperCase() === operation)
    .filter((row) => Object.keys(object(row.metadata?.result)).length > 0)
    .sort((left, right) =>
      Date.parse(right.updated_at || right.created_at || 0) -
      Date.parse(left.updated_at || left.created_at || 0),
    );

  const exact = candidates.find((row) =>
    text(row.metadata?.creative_direction_request_hash) === requestHash,
  );
  if (exact) {
    return {
      result: serviceResultFromUsage(exact),
      usage_id: exact.id,
      request_hash: requestHash,
    };
  }

  const legacy = candidates.filter((row) =>
    !text(row.metadata?.creative_direction_request_hash),
  );
  if (!REPEATABLE_OPERATIONS.has(operation) && legacy.length === 1) {
    return {
      result: serviceResultFromUsage(legacy[0]),
      usage_id: legacy[0].id,
      request_hash: null,
    };
  }

  return null;
}

export function installCreativeDirectionResultCompletion() {
  if (ServiceExecutionRuntime[INSTALL_FLAG]) return;
  const executeWithoutCompletion = ServiceExecutionRuntime.execute.bind(
    ServiceExecutionRuntime,
  );

  Object.defineProperty(ServiceExecutionRuntime, INSTALL_FLAG, {
    value: true,
    enumerable: false,
    configurable: false,
  });

  ServiceExecutionRuntime.execute = async function executeWithCompletion(input = {}) {
    if (text(input.category).toUpperCase() !== "CREATIVE_DIRECTION") {
      return executeWithoutCompletion(input);
    }

    const operation = text(input.metadata?.operation).toUpperCase();
    const requestHash = requestIdentity(input);
    const recovered = await recoverExistingDirectionUsage(input, requestHash);
    const governedInput = {
      ...input,
      metadata: {
        ...object(input.metadata),
        creative_direction_request_hash: requestHash,
      },
    };
    const result = recovered?.result || await executeWithoutCompletion(governedInput);
    const payload = resultPayload(result);
    if (!Object.keys(payload).length) return result;

    const completed = completeOperationPayload(
      operation,
      payload,
      promptContext(input),
    );
    if (!completed) return result;

    return withCompletedPayload(result, completed, recovered);
  };
}

installCreativeDirectionResultCompletion();
