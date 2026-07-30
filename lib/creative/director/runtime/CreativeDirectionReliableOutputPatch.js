import {
  ServiceExecutionRuntime,
} from "@/lib/platform/service-runtime/execution/ServiceExecutionRuntime";
import {
  UsageRuntime,
} from "@/lib/platform/service-runtime/usage/UsageRuntime";
import {
  CreativeDirectionExecutionRepairPatch,
} from "./CreativeDirectionExecutionRepairPatch.js";

const PATCH_FLAG = Symbol.for(
  "avantiqo.creative.direction.reliable-output.v2",
);

const TRANSPORT_KEYS = new Set([
  "text",
  "content",
  "output_text",
  "raw",
  "response_status",
  "success",
  "provider",
  "model",
  "usage",
  "billing",
  "pricing",
  "reservation_pricing",
  "wallet_settlement",
  "settlement",
  "pending",
]);

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function text(value) {
  return String(value ?? "").trim();
}

function parseJson(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value;
  }

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
      // Try the next conservative extraction.
    }
  }

  return null;
}

function directPlan(candidate = {}) {
  const source = object(candidate);
  const workflowKind = text(source.workflow_kind || source.workflowKind);
  const scenes = Array.isArray(source.scenes) ? source.scenes : null;

  if (!workflowKind || !scenes) return null;

  return Object.fromEntries(
    Object.entries(source).filter(([key]) => !TRANSPORT_KEYS.has(key)),
  );
}

function findPlan(value, seen = new Set(), depth = 0) {
  if (!value || depth > 20) return null;

  if (typeof value === "string") {
    const parsed = parseJson(value);
    return parsed ? findPlan(parsed, seen, depth + 1) : null;
  }

  if (typeof value !== "object" || seen.has(value)) return null;
  seen.add(value);

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findPlan(item, seen, depth + 1);
      if (found) return found;
    }
    return null;
  }

  const direct = directPlan(value);
  if (direct) return direct;

  for (const field of ["text", "content", "output_text"]) {
    if (typeof value[field] === "string") {
      const parsed = parseJson(value[field]);
      const found = parsed ? findPlan(parsed, seen, depth + 1) : null;
      if (found) return found;
    }
  }

  for (const field of ["result", "plan", "output", "data", "raw", "response"]) {
    const found = findPlan(value[field], seen, depth + 1);
    if (found) return found;
  }

  for (const nested of Object.values(value)) {
    const found = findPlan(nested, seen, depth + 1);
    if (found) return found;
  }

  return null;
}

function outputContainer(result = {}) {
  if (result?.output?.output && typeof result.output.output === "object") {
    return result.output.output;
  }
  if (result?.output && typeof result.output === "object") {
    return result.output;
  }
  return null;
}

function recent(timestamp, maximumAgeHours = 24) {
  const parsed = Date.parse(timestamp || "");
  if (!Number.isFinite(parsed)) return false;
  return Date.now() - parsed <= maximumAgeHours * 60 * 60 * 1000;
}

function serviceResultFromUsage(usage) {
  const metadata = object(usage.metadata);
  const providerResult = metadata.result;

  return {
    success: true,
    pending: false,
    provider: usage.provider || providerResult?.provider || null,
    model: metadata.model || providerResult?.model || null,
    pricing: metadata.settled_pricing || null,
    reservation_pricing: metadata.reservation_pricing || null,
    usage,
    billing: {
      usage,
      reused_existing_billed_usage: true,
    },
    settlement: "ALREADY_CHARGED_REUSED",
    output: providerResult,
    reused_direction_usage: true,
  };
}

function directionUsageCandidates(rows, input = {}) {
  const projectId = text(input.metadata?.creative_project_id);

  return rows.filter((row) => {
    const metadata = object(row.metadata);
    return (
      text(row.status).toUpperCase() === "SUCCESS" &&
      text(row.category).toUpperCase() === "CREATIVE_DIRECTION" &&
      text(metadata.operation).toUpperCase() === "MASTER_PLAN_V3" &&
      text(metadata.creative_project_id) === projectId &&
      metadata.result &&
      recent(row.updated_at || row.created_at)
    );
  });
}

async function reusableDirectionUsage(input = {}) {
  const organizationId = input.organization_id;
  const projectId = text(input.metadata?.creative_project_id);
  if (!organizationId || !projectId) return null;

  const rows = await UsageRuntime.organization(organizationId);
  const candidates = directionUsageCandidates(rows, input);

  console.log(`CREATIVE_DIRECTION_REUSE_CANDIDATE_COUNT=${candidates.length}`);

  for (const usage of candidates) {
    const result = serviceResultFromUsage(usage);
    const plan = findPlan(result);

    if (plan) {
      return {
        usage,
        result,
        plan,
      };
    }

    console.log(`CREATIVE_DIRECTION_REUSE_SKIPPED_UNRECOVERABLE=${usage.id}`);
  }

  return null;
}

function reliableDirectionInput(input = {}) {
  return {
    ...input,
    input: {
      ...object(input.input),
      response_format: {
        type: "json_object",
      },
      max_output_tokens: Math.max(
        Number(input.input?.max_output_tokens || 0),
        32000,
      ),
    },
    metadata: {
      ...object(input.metadata),
      required_output_contract: "CREATIVE_MASTER_PLAN_JSON_OBJECT",
      reliable_direction_output_version: "V2",
    },
  };
}

function materializeReliableOutput(result, plan, evidence = {}) {
  const repaired = CreativeDirectionExecutionRepairPatch.repair(plan);
  const container = outputContainer(result);

  if (!container) {
    throw new Error("CREATIVE_DIRECTION_OUTPUT_CONTAINER_REQUIRED");
  }

  const serialized = JSON.stringify(repaired);
  container.text = serialized;
  Object.assign(container, repaired);
  container.direction_reliable_output = {
    applied: true,
    version: "CREATIVE_DIRECTION_RELIABLE_OUTPUT_V2",
    reused_existing_billed_usage: evidence.reused === true,
    source_usage_id: evidence.usage_id || null,
    repaired_scene_count: Array.isArray(repaired.scenes)
      ? repaired.scenes.length
      : 0,
    repaired_shot_count: Array.isArray(repaired.scenes)
      ? repaired.scenes.reduce(
          (sum, scene) => sum + (Array.isArray(scene?.shots) ? scene.shots.length : 0),
          0,
        )
      : 0,
  };

  result.direction_reliable_output = container.direction_reliable_output;
  return result;
}

export async function preflightCreativeDirectionOutput({
  organization_id,
  creative_project_id,
} = {}) {
  if (!organization_id) throw new Error("organization_id required");
  if (!creative_project_id) throw new Error("creative_project_id required");

  const reusable = await reusableDirectionUsage({
    organization_id,
    metadata: {
      creative_project_id,
    },
  });

  if (!reusable) {
    return {
      passed: true,
      source: "NEW_STRUCTURED_EXECUTION_REQUIRED",
      usage_id: null,
      scene_count: 0,
      shot_count: 0,
    };
  }

  const repaired = CreativeDirectionExecutionRepairPatch.repair(reusable.plan);
  const sceneCount = Array.isArray(repaired.scenes) ? repaired.scenes.length : 0;
  const shotCount = Array.isArray(repaired.scenes)
    ? repaired.scenes.reduce(
        (sum, scene) => sum + (Array.isArray(scene?.shots) ? scene.shots.length : 0),
        0,
      )
    : 0;

  if (!sceneCount || !shotCount) {
    throw new Error("CREATIVE_DIRECTION_PREFLIGHT_REPAIR_EMPTY");
  }

  return {
    passed: true,
    source: "REUSED_BILLED_USAGE",
    usage_id: reusable.usage.id,
    scene_count: sceneCount,
    shot_count: shotCount,
  };
}

export function installCreativeDirectionReliableOutputPatch() {
  if (ServiceExecutionRuntime[PATCH_FLAG]) return;

  const executeBeforeReliableOutput = ServiceExecutionRuntime.execute.bind(
    ServiceExecutionRuntime,
  );

  Object.defineProperty(ServiceExecutionRuntime, PATCH_FLAG, {
    value: true,
    enumerable: false,
    configurable: false,
  });

  ServiceExecutionRuntime.execute = async function executeReliableDirection(
    input = {},
  ) {
    if (text(input.category).toUpperCase() !== "CREATIVE_DIRECTION") {
      return executeBeforeReliableOutput(input);
    }

    const reusable = await reusableDirectionUsage(input);
    let result;
    let plan;
    let evidence;

    if (reusable) {
      result = reusable.result;
      plan = reusable.plan;
      evidence = {
        reused: true,
        usage_id: reusable.usage.id,
      };
      console.log("CREATIVE_DIRECTION_RESULT_SOURCE=REUSED_BILLED_USAGE");
      console.log(`CREATIVE_DIRECTION_SOURCE_USAGE_ID=${reusable.usage.id}`);
    } else {
      result = await executeBeforeReliableOutput(reliableDirectionInput(input));
      plan = findPlan(result);
      evidence = {
        reused: false,
        usage_id: result?.usage?.id || null,
      };
      console.log("CREATIVE_DIRECTION_RESULT_SOURCE=NEW_STRUCTURED_EXECUTION");
    }

    if (!plan) {
      throw new Error(
        "CREATIVE_DIRECTION_PROVIDER_OUTPUT_UNRECOVERABLE:WORKFLOW_AND_SCENES_NOT_FOUND",
      );
    }

    const reliable = materializeReliableOutput(result, plan, evidence);
    console.log(
      `CREATIVE_DIRECTION_REPAIRED_SHOT_COUNT=${reliable.direction_reliable_output.repaired_shot_count}`,
    );
    return reliable;
  };
}

installCreativeDirectionReliableOutputPatch();

export const CreativeDirectionReliableOutputPatch = {
  install: installCreativeDirectionReliableOutputPatch,
  preflight: preflightCreativeDirectionOutput,
};
