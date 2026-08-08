import crypto from "node:crypto";

import {
  ServiceExecutionRuntime,
} from "@/lib/platform/service-runtime/execution/ServiceExecutionRuntime";
import {
  UsageRuntime,
} from "@/lib/platform/service-runtime/usage/UsageRuntime";
import {
  CreativeProjectRuntime,
} from "@/lib/creative/projects/runtime/CreativeProjectRuntime";

const INSTALL_FLAG = Symbol.for(
  "avantiqo.creative.direction-exact-resume.v2",
);
const CONTRACT = "CREATIVE_DIRECTION_EXACT_RESUME_V2";

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

function hash(value) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(value))
    .digest("hex");
}

function replaySlot(input = {}) {
  const operation = text(input.metadata?.operation).toUpperCase();
  const prompt = text(
    input.input?.prompt ||
    input.input?.input ||
    input.input?.messages ||
    "",
  );

  if (operation === "TEMPORAL_SCENE_SHOT_DIRECTION_V1") {
    const match = prompt.match(/SCENE INDEX:\s*(\d+)/i);
    return match ? `scene-${match[1]}` : "scene-unknown";
  }

  if (operation === "CREATIVE_CINEMATIC_IMPACT_CRITIQUE_V1") {
    const match = prompt.match(/"round"\s*:\s*(\d+)/i);
    return match ? `round-${match[1]}` : "round-unknown";
  }

  if (operation === "CREATIVE_CINEMATIC_IMPACT_REPAIR_V1") {
    const match = prompt.match(/repair round\s+(\d+)/i);
    return match ? `round-${match[1]}` : "round-unknown";
  }

  return "default";
}

function stableProjectScope(project = {}, input = {}, policy = {}) {
  const metadata = object(project.metadata);
  return {
    contract: CONTRACT,
    scope_revision: Number(policy.scope_revision || 1),
    organization_id: text(project.organization_id || input.organization_id),
    creative_project_id: text(project.id || input.metadata?.creative_project_id),
    creative_mission_id: text(
      project.creative_mission_id || input.metadata?.creative_mission_id,
    ),
    objective: project.objective || null,
    production_type: project.production_type || metadata.production_type || null,
    target_duration: project.target_duration ?? metadata.target_duration ?? null,
    target_channels: project.target_channels || null,
    target_languages: project.target_languages || metadata.target_languages || null,
    test_contract: metadata.test_contract || null,
    workflow_kind: metadata.workflow_kind || null,
    creative_medium: metadata.creative_medium || null,
    selected_asset_ids: metadata.selected_asset_ids || [],
    source_asset_id: metadata.source_asset_id || null,
    scene_count: metadata.scene_count ?? null,
    shot_count: metadata.shot_count ?? null,
    single_continuous_shot: metadata.single_continuous_shot === true,
    desired_outcome: metadata.desired_outcome || null,
    communication_goal: metadata.communication_goal || null,
    tone: metadata.tone || null,
    emotion: metadata.emotion || null,
    provider_strategy: metadata.provider_strategy || {},
    creative_quality_policy: metadata.creative_quality_policy || {},
    semantic_quality_policy: metadata.semantic_quality_policy || {},
  };
}

function requestIdentity(input = {}, project = {}, policy = {}) {
  const operation = text(input.metadata?.operation).toUpperCase();
  const slot = replaySlot(input);
  const scope = stableProjectScope(project, input, policy);
  const scopeHash = hash(scope);
  return {
    operation,
    slot,
    scope_hash: scopeHash,
    key: hash({
      contract: CONTRACT,
      operation,
      slot,
      scope_hash: scopeHash,
    }),
  };
}

function conceptDirectorLabel(operation) {
  const current = text(operation).toUpperCase();
  if (current.includes("CONCEPT-A")) return "Narrative World";
  if (current.includes("CONCEPT-B")) return "Performance Energy";
  if (current.includes("CONCEPT-C")) return "Cultural Brand";
  return "Creative Direction";
}

function normalizeRecoveredProviderResult(providerResult = {}, operation = "") {
  if (!text(operation).startsWith("CREATIVE_CONCEPT_DIRECTOR_")) {
    return providerResult;
  }

  const output = object(providerResult.output);
  const concept = object(output.concept);
  const title = text(concept.title);
  if (!Object.keys(concept).length || !title || title.length >= 20) {
    return providerResult;
  }

  return {
    ...providerResult,
    output: {
      ...output,
      concept: {
        ...concept,
        title: `${title} — ${conceptDirectorLabel(operation)}`,
      },
    },
  };
}

function serviceResultFromUsage(usage = {}, operation = "") {
  const providerResult = normalizeRecoveredProviderResult(
    object(usage.metadata?.result),
    operation,
  );
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
    exact_resume: true,
    exact_resume_contract: CONTRACT,
    exact_resume_usage_id: usage.id || null,
    output: providerResult,
  };
}

function policyFor(project = {}) {
  const policy = object(project.metadata?.creative_direction_resume);
  if (policy.contract !== CONTRACT || policy.enabled !== true) return null;
  return policy;
}

function usageValidForScope({
  usage,
  input,
  project,
  operation,
  expectedApprovalId = "",
  expectedUsageId = "",
}) {
  if (!usage) return false;
  if (expectedUsageId && text(usage.id) !== expectedUsageId) return false;
  if (text(usage.status).toUpperCase() !== "SUCCESS") return false;
  if (text(usage.category).toUpperCase() !== "CREATIVE_DIRECTION") return false;
  if (text(usage.organization_id) !== text(input.organization_id)) return false;
  if (
    text(usage.metadata?.creative_project_id) !==
    text(project.id)
  ) return false;
  if (
    text(usage.metadata?.creative_mission_id) !==
    text(project.creative_mission_id || input.metadata?.creative_mission_id)
  ) return false;
  if (
    text(usage.metadata?.operation).toUpperCase() !== operation
  ) return false;
  if (
    expectedApprovalId &&
    text(usage.metadata?.direction_approval_id) !== expectedApprovalId
  ) return false;
  if (!Object.keys(object(usage.metadata?.result)).length) return false;
  return true;
}

async function recoverExactResult(input = {}, project, policy, identity) {
  const organizationId = text(input.organization_id);
  const operation = identity.operation;
  const rows = await UsageRuntime.organization(organizationId);
  const usageById = new Map(rows.map((row) => [text(row.id), row]));

  const explicit = list(policy.recovery_entries).find((entry) =>
    text(entry.operation).toUpperCase() === operation &&
    text(entry.slot || "default") === identity.slot,
  );

  if (explicit) {
    const usage = usageById.get(text(explicit.usage_id));
    if (!usageValidForScope({
      usage,
      input,
      project,
      operation,
      expectedApprovalId: text(explicit.source_approval_id),
      expectedUsageId: text(explicit.usage_id),
    })) {
      throw new Error(
        `CREATIVE_DIRECTION_EXACT_RESUME_RECOVERY_ENTRY_INVALID:${operation}:${identity.slot}`,
      );
    }
    if (
      text(explicit.pricing_id) &&
      text(usage.pricing_id) !== text(explicit.pricing_id)
    ) {
      throw new Error(
        `CREATIVE_DIRECTION_EXACT_RESUME_RECOVERY_PRICING_MISMATCH:${operation}:${identity.slot}`,
      );
    }
    return usage;
  }

  const candidates = rows
    .filter((row) => usageValidForScope({
      usage: row,
      input,
      project,
      operation,
    }))
    .filter((row) =>
      text(row.metadata?.creative_direction_resume_contract) === CONTRACT &&
      text(row.metadata?.creative_direction_resume_key) === identity.key &&
      text(row.metadata?.creative_direction_resume_slot) === identity.slot,
    )
    .sort((left, right) =>
      Date.parse(right.updated_at || right.created_at || 0) -
      Date.parse(left.updated_at || left.created_at || 0),
    );

  return candidates[0] || null;
}

export function installCreativeDirectionExactResume() {
  if (ServiceExecutionRuntime[INSTALL_FLAG]) return;

  const executeWithoutExactResume =
    ServiceExecutionRuntime.execute.bind(ServiceExecutionRuntime);

  Object.defineProperty(ServiceExecutionRuntime, INSTALL_FLAG, {
    value: true,
    enumerable: false,
    configurable: false,
  });

  ServiceExecutionRuntime.execute =
    async function executeWithExactResume(input = {}) {
      if (text(input.category).toUpperCase() !== "CREATIVE_DIRECTION") {
        return executeWithoutExactResume(input);
      }

      const projectId = text(input.metadata?.creative_project_id);
      const operation = text(input.metadata?.operation).toUpperCase();
      if (!projectId) throw new Error("creative_project_id required");
      if (!operation) {
        throw new Error("CREATIVE_DIRECTION_EXACT_RESUME_OPERATION_REQUIRED");
      }

      const project = await CreativeProjectRuntime.get(projectId);
      if (
        !project ||
        text(project.organization_id) !== text(input.organization_id)
      ) {
        throw new Error("CREATIVE_DIRECTION_EXACT_RESUME_PROJECT_SCOPE_INVALID");
      }

      const policy = policyFor(project);
      if (!policy) return executeWithoutExactResume(input);

      const identity = requestIdentity(input, project, policy);
      const recovered = await recoverExactResult(
        input,
        project,
        policy,
        identity,
      );

      if (recovered) {
        console.log(
          `CREATIVE_DIRECTION_EXACT_RESUME_RECOVERED=${operation}:${identity.slot}:${recovered.id}`,
        );
        return serviceResultFromUsage(recovered, operation);
      }

      console.log(
        `CREATIVE_DIRECTION_EXACT_RESUME_MISS=${operation}:${identity.slot}:${identity.key}`,
      );

      return executeWithoutExactResume({
        ...input,
        metadata: {
          ...object(input.metadata),
          creative_direction_resume_contract: CONTRACT,
          creative_direction_resume_key: identity.key,
          creative_direction_resume_slot: identity.slot,
          creative_direction_resume_scope_hash: identity.scope_hash,
          creative_direction_resume_enabled: true,
        },
      });
    };
}

installCreativeDirectionExactResume();

export const CreativeDirectionExactResumeRuntime = Object.freeze({
  installed: true,
  contract: CONTRACT,
  requestIdentity,
  replaySlot,
});
