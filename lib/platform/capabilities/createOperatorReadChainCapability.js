import { defineCapability } from "@/lib/ubte/runtime/contracts/CapabilityManifest";
import { loadCapability } from "@/lib/ubte/runtime/loaders/CapabilityLoader";
import { execute as executeUbteCapability } from "@/lib/ubte/runtime/ExecutionEngine";

const CHAIN_KEY = "platform.operator_read_chain.execute";
const MAX_STEPS = 4;
const SAMPLE_SIZE = 3;
const FULL_ACCESS_ROLES = new Set([
  "OWNER",
  "ORGANIZATION_OWNER",
  "ORG_OWNER",
  "PLATFORM_OWNER",
  "SUPER_ADMIN",
]);
const COLLECTION_KEYS = Object.freeze([
  "rows",
  "records",
  "items",
  "sessions",
  "orders",
  "events",
  "receipts",
  "lines",
  "entries",
  "transactions",
  "results",
]);
const COLLECTION_WRAPPER_KEYS = Object.freeze([
  "data",
  "result",
  "response",
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

function contextScope(manifest = {}) {
  const scope = text(
    manifest.contextScope || manifest.context_scope || manifest.scope,
  ).toLowerCase();
  return ["organization", "entity"].includes(scope) ? scope : null;
}

function riskLevel(manifest = {}) {
  const risk = text(
    manifest.risk || manifest.riskLevel || manifest.risk_level,
  ).toLowerCase();
  return ["low", "medium", "high", "critical"].includes(risk)
    ? risk
    : "medium";
}

function normalizeFollowUp(payload = {}) {
  const raw = payload?.follow_up;
  if (raw === null || raw === undefined) {
    return { error: null, followUp: null };
  }

  const candidate = object(raw);
  const capabilityKey = text(candidate.capability_key);
  if (!capabilityKey) {
    return {
      error: "OPERATOR_READ_CHAIN_FOLLOW_UP_CAPABILITY_KEY_REQUIRED",
      followUp: null,
    };
  }

  return {
    error: null,
    followUp: {
      capability_key: capabilityKey,
      description:
        text(candidate.description || candidate.label) ||
        "Run the requested follow-up action",
      payload: object(candidate.payload),
      reason: text(candidate.reason) || null,
    },
  };
}

function normalizeSteps(payload = {}, followUp = null) {
  const requested = list(payload.steps);
  const minimum = followUp ? 1 : 2;

  if (requested.length < minimum || requested.length > MAX_STEPS) {
    return {
      error: followUp
        ? "OPERATOR_READ_CHAIN_REQUIRES_1_TO_4_STEPS_WITH_FOLLOW_UP"
        : "OPERATOR_READ_CHAIN_REQUIRES_2_TO_4_STEPS",
      steps: [],
    };
  }

  const steps = requested.map((step, index) => ({
    id: text(step?.id) || `step_${index + 1}`,
    label:
      text(step?.label || step?.description) ||
      `Read step ${index + 1}`,
    capability_key: text(step?.capability_key),
    payload: object(step?.payload),
  }));

  if (steps.some((step) => !step.capability_key)) {
    return {
      error: "OPERATOR_READ_CHAIN_CAPABILITY_KEY_REQUIRED",
      steps: [],
    };
  }

  return { error: null, steps };
}

async function loadTarget(step, unavailableReason) {
  const target = parseCapabilityKey(step.capability_key);
  if (!target) {
    return {
      ok: false,
      reason: "OPERATOR_READ_CHAIN_INVALID_CAPABILITY_KEY",
      step,
    };
  }

  if (target.key === CHAIN_KEY) {
    return {
      ok: false,
      reason: "OPERATOR_READ_CHAIN_RECURSION_BLOCKED",
      step,
    };
  }

  try {
    const loaded = await loadCapability(target);
    return {
      ok: true,
      target,
      manifest: loaded.manifest || {},
      step,
    };
  } catch (error) {
    return {
      ok: false,
      reason: unavailableReason,
      detail: text(error?.message) || null,
      step,
    };
  }
}

async function preflightStep(step, context) {
  const loaded = await loadTarget(
    step,
    "OPERATOR_READ_CHAIN_CAPABILITY_NOT_AVAILABLE",
  );
  if (!loaded.ok) return loaded;

  const { target, manifest } = loaded;
  if (!operatorEnabled(manifest)) {
    return {
      ok: false,
      reason: "OPERATOR_READ_CHAIN_OPERATOR_CAPABILITY_REQUIRED",
      step,
    };
  }

  if (inferredMode(manifest, target) !== "read") {
    return {
      ok: false,
      reason: "OPERATOR_READ_CHAIN_READ_ONLY",
      step,
    };
  }

  if (manifest.transactional === true) {
    return {
      ok: false,
      reason: "OPERATOR_READ_CHAIN_TRANSACTIONAL_CHILD_BLOCKED",
      step,
    };
  }

  if (
    manifest.operatorRequiresConfirmation === true ||
    manifest.operator_requires_confirmation === true ||
    ["high", "critical"].includes(riskLevel(manifest))
  ) {
    return {
      ok: false,
      reason: "OPERATOR_READ_CHAIN_CONFIRMATION_CHILD_BLOCKED",
      step,
    };
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
      reason: "OPERATOR_READ_CHAIN_PERMISSION_REQUIRED",
      required_permissions: list(manifest.permissions).map(text).filter(Boolean),
      step,
    };
  }

  return { ok: true, target, manifest, step };
}

async function preflightFollowUp(followUp, context) {
  if (!followUp) return { ok: true, followUp: null };

  const loaded = await loadTarget(
    followUp,
    "OPERATOR_READ_CHAIN_FOLLOW_UP_NOT_AVAILABLE",
  );
  if (!loaded.ok) return { ...loaded, followUp };

  const { target, manifest } = loaded;
  const mode = inferredMode(manifest, target);

  if (!operatorEnabled(manifest)) {
    return {
      ok: false,
      reason: "OPERATOR_READ_CHAIN_FOLLOW_UP_OPERATOR_REQUIRED",
      followUp,
    };
  }

  if (!["draft", "write", "approve"].includes(mode)) {
    return {
      ok: false,
      reason: "OPERATOR_READ_CHAIN_FOLLOW_UP_MUST_BE_ACTION",
      followUp,
    };
  }

  if (contextScope(manifest) === "entity" && !text(context?.entityId)) {
    return {
      ok: false,
      reason: "OPERATOR_ENTITY_CONTEXT_REQUIRED",
      followUp,
    };
  }

  if (!hasRequiredPermissions(context, manifest.permissions)) {
    return {
      ok: false,
      reason: "OPERATOR_READ_CHAIN_FOLLOW_UP_PERMISSION_REQUIRED",
      required_permissions: list(manifest.permissions).map(text).filter(Boolean),
      followUp,
    };
  }

  return {
    ok: true,
    followUp: {
      capability_key: followUp.capability_key,
      description: followUp.description,
      payload: followUp.payload,
      reason: followUp.reason,
      contract: {
        mode,
        risk: riskLevel(manifest),
        context_scope: contextScope(manifest),
        requires_confirmation: true,
      },
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
      showing: Math.min(value.length, SAMPLE_SIZE),
      complete_collection: value.length <= SAMPLE_SIZE,
      sample: value
        .slice(0, SAMPLE_SIZE)
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

function collectionOf(value, depth = 0, path = []) {
  if (depth > 4 || value === null || value === undefined) return null;
  if (Array.isArray(value)) {
    return {
      rows: value,
      path,
      key: path.length ? path[path.length - 1] : null,
      container: null,
    };
  }
  if (typeof value !== "object") return null;

  for (const key of COLLECTION_KEYS) {
    if (Array.isArray(value[key])) {
      return {
        rows: value[key],
        path: [...path, key],
        key,
        container: value,
      };
    }
  }

  for (const key of COLLECTION_WRAPPER_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) continue;
    const found = collectionOf(value[key], depth + 1, [...path, key]);
    if (found) return found;
  }

  return null;
}

function rootMetadata(value, collection) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};

  const output = {};
  const firstCollectionKey = collection?.path?.[0] || null;
  for (const [key, candidate] of Object.entries(value)) {
    if (Object.keys(output).length >= 14) break;
    if (key === firstCollectionKey) continue;
    if (candidate === undefined || typeof candidate === "function") continue;
    if (Array.isArray(candidate)) continue;
    output[key] = boundedValue(candidate, 1);
  }
  return output;
}

function compactExecutionEvidence(executionResult) {
  const candidate =
    executionResult && typeof executionResult === "object" &&
    Object.prototype.hasOwnProperty.call(executionResult, "result")
      ? executionResult.result
      : executionResult;
  const collection = collectionOf(candidate);

  if (!collection) return boundedValue(candidate);

  const sample = collection.rows
    .slice(0, SAMPLE_SIZE)
    .map((row) => boundedValue(row, 1));

  return {
    ...rootMetadata(candidate, collection),
    collection_path: collection.path.length
      ? collection.path.join(".")
      : "root",
    rows_key: text(candidate?.rows_key) || text(collection.key) || null,
    total_count: collection.rows.length,
    showing: sample.length,
    complete_collection: collection.rows.length <= SAMPLE_SIZE,
    ...(collection.rows.length > SAMPLE_SIZE
      ? {
          note:
            "Representative sample only; do not infer dataset-wide totals or trends from sample rows.",
        }
      : {}),
    sample,
  };
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
      source: "AVANTIQO_OPERATOR_READ_CHAIN",
      parentCapabilityKey: CHAIN_KEY,
      readChainStepId: step.id,
      readChainCapabilityKey: step.capability_key,
    },
  };
}

export function createOperatorReadChainCapability() {
  const manifest = defineCapability({
    domain: "platform",
    capability: "operator_read_chain",
    action: "execute",
    description:
      "Run bounded Operator-enabled reads for a multi-part business question or an evidence-first user-requested action. Use 2 to 4 reads for comparisons or diagnosis. When the user explicitly asks for a downstream business action whose correctness depends on current evidence, use 1 to 4 reads and include follow_up with the exact registered non-read capability, payload, description, and reason. The follow-up is staged only: this capability never executes it. Verification must support it and the user must confirm before the normal Operator governance path can execute it. Read steps remain strictly read-only; recursive chains, transactional reads, high-risk reads, and confirmation-requiring reads are rejected.",
    permissions: [],
    events: [],
    tags: [
      "platform",
      "operator",
      "read",
      "read-chain",
      "multi-step",
      "compare",
      "comparison",
      "diagnosis",
      "evidence-first",
      "conditional",
      "before-action",
      "create",
      "send",
      "submit",
      "purchase",
      "sales",
      "inventory",
      "receivables",
      "analytics",
    ],
    transactional: false,
    aiEnabled: true,
    operatorEnabled: true,
    operatorMode: "read",
    operatorAutoExecute: true,
    operatorRequiresConfirmation: false,
    risk: "low",
    contextScope: "organization",
    inputSchema: {
      type: "object",
      properties: {
        steps: {
          type: "array",
          minItems: 1,
          maxItems: MAX_STEPS,
          description:
            "Ordered independent read steps. Pure read chains require at least 2 steps; an evidence-first staged follow-up may use 1 to 4.",
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
        follow_up: {
          type: "object",
          description:
            "Optional exact non-read action explicitly requested by the user and dependent on the read evidence. It is staged for verification and confirmation only; it is never executed by this capability.",
          required: ["capability_key"],
          properties: {
            capability_key: { type: "string" },
            description: { type: "string" },
            reason: { type: "string" },
            payload: {
              type: "object",
              additionalProperties: true,
            },
          },
          additionalProperties: false,
        },
      },
      required: ["steps"],
      additionalProperties: false,
    },
  });

  async function execute({ context, payload = {} }) {
    const normalizedFollowUp = normalizeFollowUp(payload);
    if (normalizedFollowUp.error) {
      return {
        status: "blocked",
        read_only: true,
        reason: normalizedFollowUp.error,
        total_steps: 0,
        completed_steps: 0,
        failed_steps: 0,
        steps: [],
      };
    }

    const normalized = normalizeSteps(payload, normalizedFollowUp.followUp);
    if (normalized.error) {
      return {
        status: "blocked",
        read_only: true,
        reason: normalized.error,
        total_steps: 0,
        completed_steps: 0,
        failed_steps: 0,
        steps: [],
      };
    }

    const followUpPreflight = await preflightFollowUp(
      normalizedFollowUp.followUp,
      context,
    );
    if (!followUpPreflight.ok) {
      return {
        status: "blocked",
        read_only: true,
        reason: followUpPreflight.reason,
        detail: followUpPreflight.detail || null,
        blocked_follow_up: normalizedFollowUp.followUp
          ? {
              capability_key: normalizedFollowUp.followUp.capability_key,
              description: normalizedFollowUp.followUp.description,
              required_permissions:
                followUpPreflight.required_permissions || [],
            }
          : null,
        total_steps: normalized.steps.length,
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
        read_only: true,
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
      const { step, target } = entry;
      try {
        const result = await executeUbteCapability({
          organizationId: context.organizationId,
          domain: target.domain,
          capability: target.capability,
          action: target.action,
          payload: scopedPayload(context, step.payload),
          actor: context.actor,
          runtime: childRuntime(context, step),
        });

        results.push({
          id: step.id,
          label: step.label,
          capability_key: step.capability_key,
          status: "completed",
          requested_payload: boundedValue(step.payload),
          evidence: compactExecutionEvidence(result),
        });
      } catch (error) {
        results.push({
          id: step.id,
          label: step.label,
          capability_key: step.capability_key,
          status: "failed",
          requested_payload: boundedValue(step.payload),
          error: text(error?.message) || "Read failed",
        });
      }
    }

    const failedSteps = results.filter((step) => step.status === "failed").length;

    return {
      status: failedSteps ? "partial" : "completed",
      read_only: true,
      total_steps: results.length,
      completed_steps: results.length - failedSteps,
      failed_steps: failedSteps,
      ...(followUpPreflight.followUp
        ? { staged_follow_up: followUpPreflight.followUp }
        : {}),
      steps: results,
    };
  }

  return { manifest, execute };
}

export default createOperatorReadChainCapability;
