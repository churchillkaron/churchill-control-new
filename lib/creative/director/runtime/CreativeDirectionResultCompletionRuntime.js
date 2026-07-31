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
  "avantiqo.creative.direction-result-completion.v2",
);

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function text(value) {
  return String(value ?? "").trim();
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

function promptContext(input = {}) {
  const prompt = text(input.input?.prompt || input.prompt);
  const marker = "\nINPUT\n";
  const index = prompt.lastIndexOf(marker);
  if (index < 0) return {};
  const parsed = parseJson(prompt.slice(index + marker.length));
  return object(parsed);
}

function resultPlan(result = {}) {
  const providerResult = object(result.output);
  const payload = Object.keys(object(providerResult.output)).length
    ? object(providerResult.output)
    : providerResult;
  const parsed = parseJson(payload.text || payload.content || payload);
  return object(parsed?.result || parsed);
}

function withCompletedPlan(result = {}, completed = {}, recovery = null) {
  const providerResult = object(result.output);
  const nested = object(providerResult.output);
  const completionEvidence = {
    ...object(completed.completion),
    recovered_from_existing_usage: Boolean(recovery?.usage_id),
    recovered_usage_id: recovery?.usage_id || null,
  };

  if (Object.keys(nested).length) {
    return {
      ...result,
      output: {
        ...providerResult,
        output: {
          ...nested,
          ...completed,
          text: JSON.stringify(completed),
          direction_completion: completionEvidence,
        },
      },
    };
  }

  return {
    ...result,
    output: {
      ...providerResult,
      ...completed,
      text: JSON.stringify(completed),
      direction_completion: completionEvidence,
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

async function recoverExistingDirectionUsage(input = {}) {
  const organizationId = text(input.organization_id);
  const projectId = text(input.metadata?.creative_project_id);
  const policyVersion = text(input.metadata?.creative_quality_policy_version);
  if (!organizationId || !projectId) return null;

  const rows = await UsageRuntime.organization(organizationId);
  const usage = rows
    .filter((row) => text(row.status).toUpperCase() === "SUCCESS")
    .filter((row) => text(row.category).toUpperCase() === "CREATIVE_DIRECTION")
    .filter((row) => text(row.metadata?.creative_project_id) === projectId)
    .filter((row) =>
      !policyVersion ||
      !text(row.metadata?.creative_quality_policy_version) ||
      text(row.metadata?.creative_quality_policy_version) === policyVersion,
    )
    .filter((row) => Object.keys(object(row.metadata?.result)).length > 0)
    .sort((left, right) =>
      Date.parse(right.updated_at || right.created_at || 0) -
      Date.parse(left.updated_at || left.created_at || 0),
    )[0] || null;

  return usage
    ? {
        result: serviceResultFromUsage(usage),
        usage_id: usage.id,
      }
    : null;
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

    const recovered = await recoverExistingDirectionUsage(input);
    const result = recovered?.result || await executeWithoutCompletion(input);
    const plan = resultPlan(result);
    if (!Object.keys(plan).length) return result;

    const context = promptContext(input);
    const completed = CreativeMasterPlanCompletionRuntimeV2.complete({
      plan,
      mission: object(context.mission),
      project: object(context.project),
      brief: object(context.brief),
      assets: Array.isArray(context.assets) ? context.assets : [],
    });

    return withCompletedPlan(result, completed, recovered);
  };
}

installCreativeDirectionResultCompletion();
