import { defineCapability } from "@/lib/ubte/runtime/contracts/CapabilityManifest";
import { loadCapability } from "@/lib/ubte/runtime/loaders/CapabilityLoader";
import { execute as executeUbteCapability } from "@/lib/ubte/runtime/ExecutionEngine";

const CHAIN_KEY = "platform.operator_read_chain.execute";
const MAX_STEPS = 4;
const SAMPLE_SIZE = 3;

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

function permissionMatches(granted, required) {
  const actual = text(granted).toLowerCase();
  const needed = text(required).toLowerCase();
  if (!actual || !needed) return false;
  if (actual === "*" || actual === needed) return true;
  if (actual.endsWith(".*")) return needed.startsWith(actual.slice(0, -1));
  return false;
}

function grantedPermissions(context) {
  return [
    ...list(context?.permissions),
    ...list(context?.actor?.permissions),
  ]
    .map(text)
    .filter(Boolean);
}

function actorHasFullAccess(context) {
  const actor = object(context?.actor);
  return (
    actor.fullAccess === true ||
    actor.full_access === true ||
    grantedPermissions(context).includes("*")
  );
}

function hasRequiredPermissions(context, permissions = []) {
  const required = list(permissions).map(text).filter(Boolean);
  if (!required.length || actorHasFullAccess(context)) return true;

  const granted = grantedPermissions(context);
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

function operatorMode(manifest = {}) {
  const explicit = text(
    manifest.operatorMode || manifest.operator_mode || manifest.mode,
  ).toLowerCase();
  return ["read", "draft", "write", "approve", "navigate"].includes(explicit)
    ? explicit
    : null;
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

function inputSchema(manifest = {}) {
  return manifest.inputSchema || manifest.input_schema || null;
}

function outputSchema(manifest = {}) {
  return manifest.outputSchema || manifest.output_schema || null;
}

function normalizeVerificationRead(value) {
  if (value === null || value === undefined) {
    return { error: null, verificationRead: null };
  }

  const candidate = object(value);
  const capabilityKey = text(candidate.capability_key);
  if (!capabilityKey) {
    return {
      error: "OPERATOR_READ_CHAIN_VERIFY_AFTER_CAPABILITY_KEY_REQUIRED",
      verificationRead: null,
    };
  }

  return {
    error: null,
    verificationRead: {
      capability_key: capabilityKey,
      description:
        text(candidate.description || candidate.label) ||
        "Verify the requested action took effect",
      payload: object(candidate.payload),
    },
  };
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

  const normalizedVerification = normalizeVerificationRead(candidate.verify_after);
  if (normalizedVerification.error) {
    return {
      error: normalizedVerification.error,
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
      verify_after: normalizedVerification.verificationRead,
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

  if (operatorMode(manifest) !== "read") {
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

  return {
    ok: true,
    target,
    manifest,
    step,
    input_schema: inputSchema(manifest),
    output_schema: outputSchema(manifest),
  };
}

async function preflightVerificationRead(verificationRead, context) {
  if (!verificationRead) return { ok: true, verificationRead: null };

  const step = {
    id: "verify_after",
    label: verificationRead.description,
    capability_key: verificationRead.capability_key,
    payload: verificationRead.payload,
  };
  const preflight = await preflightStep(step, context);
  if (!preflight.ok) {
    return {
      ...preflight,
      reason: `OPERATOR_READ_CHAIN_VERIFY_AFTER_${preflight.reason}`,
      verificationRead,
    };
  }

  return {
    ok: true,
    verificationRead: {
      capability_key: verificationRead.capability_key,
      description: verificationRead.description,
      payload: verificationRead.payload,
      contract: {
        mode: "read",
        risk: riskLevel(preflight.manifest),
        context_scope: contextScope(preflight.manifest),
      },
    },
  };
}

async function preflightFollowUp(followUp, context) {
  if (!followUp) return { ok: true, followUp: null };

  const loaded = await loadTarget(
    followUp,
    "OPERATOR_READ_CHAIN_FOLLOW_UP_NOT_AVAILABLE",
  );
  if (!loaded.ok) return { ...loaded, followUp };

  const { manifest } = loaded;
  const mode = operatorMode(manifest);

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

  const verificationPreflight = await preflightVerificationRead(
    followUp.verify_after,
    context,
  );
  if (!verificationPreflight.ok) {
    return {
      ...verificationPreflight,
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
      ...(verificationPreflight.verificationRead
        ? { verify_after: verificationPreflight.verificationRead }
        : {}),
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

function arraySchemaPaths(schema, path = [], depth = 0) {
  if (!schema || typeof schema !== "object" || depth > 4) return [];
  const output = [];
  if (schema.type === "array") output.push(path);

  const properties = object(schema.properties);
  for (const [key, definition] of Object.entries(properties)) {
    output.push(...arraySchemaPaths(definition, [...path, key], depth + 1));
  }

  for (const key of ["items", "oneOf", "anyOf", "allOf"]) {
    const candidate = schema[key];
    if (Array.isArray(candidate)) {
      for (const definition of candidate) {
        output.push(...arraySchemaPaths(definition, path, depth + 1));
      }
    } else if (candidate && typeof candidate === "object") {
      output.push(...arraySchemaPaths(candidate, path, depth + 1));
    }
  }

  return output;
}

function valueAtPath(value, path = []) {
  let current = value;
  for (const key of path) {
    if (!current || typeof current !== "object") return undefined;
    current = current[key];
  }
  return current;
}

function collectionOf(value, schema = null, depth = 0, path = []) {
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

  const schemaArrays = arraySchemaPaths(schema);
  const schemaCandidates = schemaArrays
    .map((schemaPath) => ({
      schemaPath,
      rows: valueAtPath(value, schemaPath),
    }))
    .filter((candidate) => Array.isArray(candidate.rows))
    .sort((a, b) => b.rows.length - a.rows.length);
  if (schemaCandidates.length) {
    const selected = schemaCandidates[0];
    return {
      rows: selected.rows,
      path: selected.schemaPath,
      key: selected.schemaPath.length
        ? selected.schemaPath[selected.schemaPath.length - 1]
        : null,
      container: value,
    };
  }

  const arrays = Object.entries(value)
    .filter(([, candidate]) => Array.isArray(candidate))
    .sort((a, b) => b[1].length - a[1].length);
  if (arrays.length) {
    const [key, rows] = arrays[0];
    return {
      rows,
      path: [...path, key],
      key,
      container: value,
    };
  }

  for (const [key, candidate] of Object.entries(value)) {
    if (!candidate || typeof candidate !== "object") continue;
    const found = collectionOf(candidate, null, depth + 1, [...path, key]);
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

function compactExecutionEvidence(executionResult, schema = null) {
  const candidate =
    executionResult && typeof executionResult === "object" &&
    Object.prototype.hasOwnProperty.call(executionResult, "result")
      ? executionResult.result
      : executionResult;
  const collection = collectionOf(candidate, schema);

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
      "Run bounded Operator-enabled reads for a multi-part question or an evidence-first user-requested action. Use 2 to 4 reads for comparison or diagnosis. When the user explicitly asks for a downstream action whose correctness depends on current evidence, use 1 to 4 reads and include follow_up with the exact registered non-read capability, payload, description, and reason. When a registered read can verify the effect after that action, also include follow_up.verify_after={capability_key,payload,description}; it is preflighted now and executed only after the user confirms and the write completes. The follow-up is staged only: this capability never executes it. Verification must support it and the user must confirm before the normal Operator governance path can execute it. Read steps and verify_after remain strictly read-only; recursive chains, transactional reads, high-risk reads, and confirmation-requiring reads are rejected.",
    permissions: [],
    events: [],
    tags: [
      "platform",
      "operator",
      "read",
      "read-chain",
      "multi-step",
      "comparison",
      "diagnosis",
      "evidence-first",
      "conditional",
      "post-action-verification",
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
            "Optional exact non-read action explicitly requested by the user and dependent on the read evidence. It is staged for verification and confirmation only; it is never executed by this capability. verify_after may name one exact registered read that should confirm the action's effect after execution.",
          required: ["capability_key"],
          properties: {
            capability_key: { type: "string" },
            description: { type: "string" },
            reason: { type: "string" },
            payload: {
              type: "object",
              additionalProperties: true,
            },
            verify_after: {
              type: "object",
              required: ["capability_key"],
              properties: {
                capability_key: { type: "string" },
                description: { type: "string" },
                payload: {
                  type: "object",
                  additionalProperties: true,
                },
              },
              additionalProperties: false,
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

    const [followUpPreflight, preflight] = await Promise.all([
      preflightFollowUp(normalizedFollowUp.followUp, context),
      Promise.all(
        normalized.steps.map((step) => preflightStep(step, context)),
      ),
    ]);

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

    const results = await Promise.all(
      preflight.map(async (entry) => {
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

          return {
            id: step.id,
            label: step.label,
            capability_key: step.capability_key,
            status: "completed",
            requested_payload: boundedValue(step.payload),
            evidence: compactExecutionEvidence(result, entry.output_schema),
          };
        } catch (error) {
          return {
            id: step.id,
            label: step.label,
            capability_key: step.capability_key,
            status: "failed",
            requested_payload: boundedValue(step.payload),
            error: text(error?.message) || "Read failed",
          };
        }
      }),
    );

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
