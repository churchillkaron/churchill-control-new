import { defineCapability } from "@/lib/ubte/runtime/contracts/CapabilityManifest";
import { loadCapability } from "@/lib/ubte/runtime/loaders/CapabilityLoader";
import { execute as executeUbteCapability } from "@/lib/ubte/runtime/ExecutionEngine";
import {
  recordOperatorExecutionAudit,
  requiresDurableApproval,
} from "@/lib/operator/governance/operatorExecutionGovernance";

const MISSION_KEY = "platform.operator_mission.execute";
const READ_CHAIN_KEY = "platform.operator_read_chain.execute";
const MAX_STEPS = 6;
const RESULT_SAMPLE_SIZE = 3;
const FULL_ACCESS_ROLES = new Set([
  "OWNER",
  "ORGANIZATION_OWNER",
  "ORG_OWNER",
  "PLATFORM_OWNER",
  "SUPER_ADMIN",
]);

function text(value) {
  return String(value ?? "").trim();
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeRole(value) {
  return text(value).toUpperCase();
}

function permissionMatches(granted, required) {
  const actual = text(granted).toLowerCase();
  const needed = text(required).toLowerCase();
  if (!actual || !needed) return false;
  if (actual === "*" || actual === needed) return true;
  if (actual.endsWith(".*")) return needed.startsWith(actual.slice(0, -1));
  return false;
}

function actorHasFullAccess(context) {
  const actor = object(context?.actor);
  return FULL_ACCESS_ROLES.has(
    normalizeRole(actor.role || actor.role_code || actor.roleCode),
  );
}

function hasRequiredPermissions(context, permissions = []) {
  const required = list(permissions).map(text).filter(Boolean);
  if (!required.length || actorHasFullAccess(context)) return true;

  const granted = list(context?.permissions).map(text).filter(Boolean);
  return required.every((permission) =>
    granted.some((candidate) => permissionMatches(candidate, permission)),
  );
}

function parseCapabilityKey(value) {
  const key = text(value);
  const parts = key.split(".");
  if (parts.length !== 3 || parts.some((part) => !text(part))) return null;
  const [domain, capability, action] = parts;
  return { key, domain, capability, action };
}

function operatorEnabled(manifest = {}) {
  return (
    manifest.operatorEnabled === true ||
    manifest.operator_enabled === true ||
    manifest.aiEnabled === true
  );
}

function inferredMode(manifest = {}, target = {}) {
  const explicit = text(
    manifest.operatorMode || manifest.operator_mode,
  ).toLowerCase();
  if (["read", "draft", "write", "approve", "navigate"].includes(explicit)) {
    return explicit;
  }

  const key = `${target.capability || ""}.${target.action || ""}`.toLowerCase();
  if (/^(get|list|read|find|search|view|summarize|analyse|analyze|report)/.test(key)) {
    return "read";
  }
  if (/(approve|post|close|delete|archive|pay|release|refund|reversal|lock|reopen)/.test(key)) {
    return "approve";
  }
  if (/(create|update|change|move|transfer|merge|upsert|send|submit|queue|start)/.test(key)) {
    return "write";
  }
  return "write";
}

function riskLevel(manifest = {}) {
  const risk = text(
    manifest.risk || manifest.riskLevel || manifest.risk_level,
  ).toLowerCase();
  return ["low", "medium", "high", "critical"].includes(risk)
    ? risk
    : "medium";
}

function contextScope(manifest = {}) {
  const scope = text(
    manifest.contextScope || manifest.context_scope || manifest.scope,
  ).toLowerCase();
  return ["organization", "entity"].includes(scope) ? scope : null;
}

function approvalPolicy(manifest = {}) {
  return (
    manifest.approval ||
    manifest.approvalPolicy ||
    manifest.approval_policy ||
    null
  );
}

function autoExecutable(manifest = {}, mode) {
  return (
    mode === "read" ||
    manifest.operatorAutoExecute === true ||
    manifest.operator_auto_execute === true
  );
}

function requiresConfirmation(manifest = {}, mode) {
  return (
    manifest.operatorRequiresConfirmation === true ||
    manifest.operator_requires_confirmation === true ||
    mode === "approve" ||
    ["high", "critical"].includes(riskLevel(manifest))
  );
}

function containsDynamicResultReference(value, depth = 0) {
  if (depth > 6 || value === null || value === undefined) return false;
  if (typeof value === "string") {
    const source = value.toLowerCase();
    return (
      /\$\{?\s*(?:step|result|previous_result|prior_result)/.test(source) ||
      /\{\{[^}]*\b(?:step|result|previous_result|prior_result)\b/.test(source) ||
      /\b(?:previous|prior)_?(?:step_?)?result\b/.test(source)
    );
  }
  if (Array.isArray(value)) {
    return value.some((item) => containsDynamicResultReference(item, depth + 1));
  }
  if (typeof value !== "object") return false;
  return Object.values(value).some((item) =>
    containsDynamicResultReference(item, depth + 1),
  );
}

function normalizeSteps(payload = {}) {
  const requested = list(payload.steps);
  if (requested.length < 2 || requested.length > MAX_STEPS) {
    return {
      error: "OPERATOR_MISSION_REQUIRES_2_TO_6_STEPS",
      steps: [],
    };
  }

  const seenIds = new Set();
  const steps = requested.map((step, index) => ({
    id: text(step?.id) || `step_${index + 1}`,
    label:
      text(step?.label || step?.description) || `Mission step ${index + 1}`,
    capability_key: text(step?.capability_key),
    payload: object(step?.payload),
  }));

  if (steps.some((step) => !step.capability_key)) {
    return {
      error: "OPERATOR_MISSION_CAPABILITY_KEY_REQUIRED",
      steps: [],
    };
  }

  for (const step of steps) {
    if (seenIds.has(step.id)) {
      return {
        error: "OPERATOR_MISSION_STEP_IDS_MUST_BE_UNIQUE",
        steps: [],
      };
    }
    seenIds.add(step.id);
  }

  if (steps.some((step) => containsDynamicResultReference(step.payload))) {
    return {
      error: "OPERATOR_MISSION_DYNAMIC_RESULT_CHAINING_BLOCKED",
      steps: [],
    };
  }

  return { error: null, steps };
}

async function preflightStep(step, context) {
  const target = parseCapabilityKey(step.capability_key);
  if (!target) {
    return {
      ok: false,
      reason: "OPERATOR_MISSION_INVALID_CAPABILITY_KEY",
      step,
    };
  }

  if (target.key === MISSION_KEY) {
    return {
      ok: false,
      reason: "OPERATOR_MISSION_RECURSION_BLOCKED",
      step,
    };
  }

  if (target.key === READ_CHAIN_KEY) {
    return {
      ok: false,
      reason: "OPERATOR_MISSION_READ_CHAIN_NESTING_BLOCKED",
      step,
    };
  }

  let loaded;
  try {
    loaded = await loadCapability(target);
  } catch (error) {
    return {
      ok: false,
      reason: "OPERATOR_MISSION_CAPABILITY_NOT_AVAILABLE",
      detail: text(error?.message) || null,
      step,
    };
  }

  const manifest = loaded.manifest || {};
  const mode = inferredMode(manifest, target);
  const risk = riskLevel(manifest);
  const approval = approvalPolicy(manifest);
  const normalizedCapability = {
    key: target.key,
    domain: target.domain,
    capability: target.capability,
    action: target.action,
    mode,
    risk,
    approval,
    reversible:
      manifest.reversible === true ||
      Boolean(manifest.compensatingCapability || manifest.compensating_capability),
    transactional: manifest.transactional === true,
  };

  if (!operatorEnabled(manifest)) {
    return {
      ok: false,
      reason: "OPERATOR_MISSION_OPERATOR_CAPABILITY_REQUIRED",
      step,
    };
  }

  if (!["read", "draft", "write"].includes(mode)) {
    return {
      ok: false,
      reason: "OPERATOR_MISSION_APPROVAL_OR_NAVIGATION_STEP_BLOCKED",
      step,
    };
  }

  if (requiresConfirmation(manifest, mode)) {
    return {
      ok: false,
      reason: "OPERATOR_MISSION_CONFIRMATION_STEP_BLOCKED",
      step,
    };
  }

  if (mode !== "read") {
    if (risk !== "low") {
      return {
        ok: false,
        reason: "OPERATOR_MISSION_ACTION_REQUIRES_LOW_RISK",
        step,
      };
    }
    if (!autoExecutable(manifest, mode)) {
      return {
        ok: false,
        reason: "OPERATOR_MISSION_ACTION_REQUIRES_AUTO_EXECUTE",
        step,
      };
    }
    if (requiresDurableApproval(normalizedCapability)) {
      return {
        ok: false,
        reason: "OPERATOR_MISSION_DURABLE_APPROVAL_STEP_BLOCKED",
        step,
      };
    }
  }

  if (contextScope(manifest) === "entity" && !text(context?.entityId)) {
    return {
      ok: false,
      reason: "OPERATOR_ENTITY_CONTEXT_REQUIRED",
      step,
    };
  }

  if (!hasRequiredPermissions(context, manifest.permissions)) {
    return {
      ok: false,
      reason: "OPERATOR_MISSION_PERMISSION_REQUIRED",
      required_permissions: list(manifest.permissions).map(text).filter(Boolean),
      step,
    };
  }

  return {
    ok: true,
    step,
    target,
    manifest,
    capability: normalizedCapability,
    contract: {
      mode,
      risk,
      context_scope: contextScope(manifest),
      auto_execute: autoExecutable(manifest, mode),
      durable_approval_required: false,
    },
  };
}

function boundedValue(value, depth = 0) {
  if (value === null || value === undefined) return value ?? null;
  if (typeof value === "string") return value.slice(0, 300);
  if (["number", "boolean"].includes(typeof value)) return value;
  if (depth >= 3) return "[bounded]";

  if (Array.isArray(value)) {
    return {
      total_count: value.length,
      showing: Math.min(value.length, RESULT_SAMPLE_SIZE),
      complete_collection: value.length <= RESULT_SAMPLE_SIZE,
      sample: value
        .slice(0, RESULT_SAMPLE_SIZE)
        .map((item) => boundedValue(item, depth + 1)),
    };
  }

  if (typeof value !== "object") return text(value).slice(0, 300);

  const output = {};
  for (const [key, candidate] of Object.entries(value).slice(0, 18)) {
    if (typeof candidate === "function" || candidate === undefined) continue;
    output[key] = boundedValue(candidate, depth + 1);
  }
  return output;
}

function scopedPayload(context, payload = {}) {
  const partyId = text(context?.metadata?.partyId) || null;
  return {
    ...object(payload),
    organizationId: context.organizationId,
    organization_id: context.organizationId,
    ...(context.entityId
      ? { entityId: context.entityId, entity_id: context.entityId }
      : {}),
    ...(context.periodId
      ? { periodId: context.periodId, period_id: context.periodId }
      : {}),
    ...(partyId ? { partyId, party_id: partyId } : {}),
  };
}

function childRuntime(context, step) {
  return {
    entityId: context.entityId,
    periodId: context.periodId,
    country: context.country,
    workspace: context.workspace,
    permissions: context.permissions,
    installedModules: context.installedModules,
    featureFlags: context.featureFlags,
    locale: context.locale,
    currency: context.currency,
    timezone: context.timezone,
    correlationId: context.correlationId,
    callerRequest: context.callerRequest,
    metadata: {
      ...object(context.metadata),
      source: "AVANTIQO_OPERATOR_MISSION",
      parentCapabilityKey: MISSION_KEY,
      missionStepId: step.id,
      missionCapabilityKey: step.capability_key,
    },
  };
}

function actorIdentity(context) {
  const actor = object(context?.actor);
  return {
    actorId: text(actor.id || actor.user_id) || null,
    actorName: text(actor.name || actor.email) || null,
  };
}

async function auditMissionStep({
  context,
  capability,
  payload,
  outcome,
  result = null,
  error = null,
}) {
  if (capability.mode === "read") return;
  const identity = actorIdentity(context);
  await recordOperatorExecutionAudit({
    capability,
    organizationId: context.organizationId,
    entityId: context.entityId,
    actorId: identity.actorId,
    actorName: identity.actorName,
    payload,
    source: "mission",
    outcome,
    result,
    error,
    approval: {
      allowed: true,
      governed: true,
      approvalRequest: null,
      reason: null,
    },
  });
}

export function createOperatorMissionCapability() {
  const manifest = defineCapability({
    domain: "platform",
    capability: "operator_mission",
    action: "execute",
    description:
      "Run one bounded autonomous mission containing 2 to 6 independent registered operations in order. Use this when the user's explicit request asks Avantiqo to complete several already-specified steps and every material payload is known before execution. Every child is preflighted before the first side effect. Reads are allowed. Non-read children are allowed only when their own capability is Operator-enabled, low-risk, explicitly auto-executable, confirmation-free, durable-approval-free, in scope, and permitted. Never use this mission when a later step depends on a value or decision produced by an earlier step; use evidence-first reasoning/read-chain for that pattern. Recursive missions, nested read chains, approval/navigation children, dynamic result references, and automatic retries are blocked. Execution stops on the first runtime failure.",
    permissions: [],
    events: [],
    tags: [
      "platform",
      "operator",
      "autonomous",
      "autonomy",
      "mission",
      "multi-step",
      "multiple",
      "several",
      "sequence",
      "one-command",
      "then",
      "after",
      "complete-all",
      "execute",
      "safe",
      "business",
      "read",
      "write",
      "verify",
    ],
    transactional: false,
    aiEnabled: true,
    operatorEnabled: true,
    operatorMode: "write",
    operatorAutoExecute: true,
    operatorRequiresConfirmation: false,
    risk: "low",
    approval: "none",
    contextScope: "organization",
    inputSchema: {
      type: "object",
      properties: {
        steps: {
          type: "array",
          minItems: 2,
          maxItems: MAX_STEPS,
          description:
            "Ordered independent registered operations. Every payload must be complete before execution; later steps cannot depend on earlier results.",
          items: {
            type: "object",
            required: ["capability_key"],
            properties: {
              id: { type: "string" },
              label: { type: "string" },
              capability_key: { type: "string" },
              payload: {
                type: "object",
                additionalProperties: true,
              },
            },
            additionalProperties: false,
          },
        },
      },
      required: ["steps"],
      additionalProperties: false,
    },
  });

  async function execute({ context, payload = {} }) {
    const normalized = normalizeSteps(payload);
    if (normalized.error) {
      return {
        status: "blocked",
        mission_mode: "safe_registered_sequence",
        all_steps_preflighted: false,
        reason: normalized.error,
        total_steps: 0,
        completed_steps: 0,
        failed_steps: 0,
        steps: [],
      };
    }

    const preflight = [];
    for (const step of normalized.steps) {
      preflight.push(await preflightStep(step, context));
    }

    const blocked = preflight.find((entry) => !entry.ok);
    if (blocked) {
      return {
        status: "blocked",
        mission_mode: "safe_registered_sequence",
        all_steps_preflighted: false,
        reason: blocked.reason,
        detail: blocked.detail || null,
        blocked_step: {
          id: blocked.step.id,
          label: blocked.step.label,
          capability_key: blocked.step.capability_key,
          required_permissions: blocked.required_permissions || [],
        },
        total_steps: normalized.steps.length,
        completed_steps: 0,
        failed_steps: 0,
        steps: [],
      };
    }

    const results = [];

    for (const entry of preflight) {
      const { step, target, contract, capability } = entry;
      const normalizedPayload = scopedPayload(context, step.payload);

      try {
        const result = await executeUbteCapability({
          organizationId: context.organizationId,
          domain: target.domain,
          capability: target.capability,
          action: target.action,
          payload: normalizedPayload,
          actor: context.actor,
          runtime: childRuntime(context, step),
        });

        await auditMissionStep({
          context,
          capability,
          payload: normalizedPayload,
          outcome: "executed",
          result,
        });

        results.push({
          id: step.id,
          label: step.label,
          capability_key: step.capability_key,
          status: "completed",
          contract,
          requested_payload: boundedValue(step.payload),
          result: boundedValue(result),
        });
      } catch (error) {
        await auditMissionStep({
          context,
          capability,
          payload: normalizedPayload,
          outcome: "failed",
          error: text(error?.message) || "Mission step failed",
        });

        results.push({
          id: step.id,
          label: step.label,
          capability_key: step.capability_key,
          status: "failed",
          contract,
          requested_payload: boundedValue(step.payload),
          error: text(error?.message) || "Mission step failed",
        });
        break;
      }
    }

    const failedSteps = results.filter((step) => step.status === "failed").length;
    const completedSteps = results.filter((step) => step.status === "completed").length;

    return {
      status: failedSteps ? "partial" : "completed",
      mission_mode: "safe_registered_sequence",
      all_steps_preflighted: true,
      total_steps: normalized.steps.length,
      completed_steps: completedSteps,
      failed_steps: failedSteps,
      remaining_steps: Math.max(0, normalized.steps.length - results.length),
      stopped_on_first_failure: failedSteps > 0,
      steps: results,
    };
  }

  return { manifest, execute };
}

export default createOperatorMissionCapability;
