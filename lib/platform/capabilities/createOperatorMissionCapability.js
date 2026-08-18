import { defineCapability } from "@/lib/ubte/runtime/contracts/CapabilityManifest";
import { loadCapability } from "@/lib/ubte/runtime/loaders/CapabilityLoader";
import { execute as executeUbteCapability } from "@/lib/ubte/runtime/ExecutionEngine";
import {
  recordOperatorExecutionAudit,
  requiresDurableApproval,
  resolveOperatorExecutionApproval,
} from "@/lib/operator/governance/operatorExecutionGovernance";

const MISSION_KEY = "platform.operator_mission.execute";
const READ_CHAIN_KEY = "platform.operator_read_chain.execute";
const MAX_STEPS = 6;
const SAMPLE_SIZE = 3;
const FULL_ACCESS_ROLES = new Set([
  "OWNER",
  "ORGANIZATION_OWNER",
  "ORG_OWNER",
  "PLATFORM_OWNER",
  "SUPER_ADMIN",
]);
const TERMINAL_APPROVAL_FAILURE_REASONS = new Set([
  "APPROVAL_REJECTED",
  "APPROVAL_REQUEST_NOT_FOUND",
  "APPROVAL_REQUEST_MISMATCH",
  "APPROVAL_REQUEST_LOOKUP_FAILED",
]);

function text(value) {
  return String(value ?? "").trim();
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
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

function hasPermissions(context, permissions = []) {
  const actor = object(context?.actor);
  const role = normalizeRole(actor.role || actor.role_code || actor.roleCode);
  if (FULL_ACCESS_ROLES.has(role)) return true;
  const required = list(permissions).map(text).filter(Boolean);
  if (!required.length) return true;
  const granted = list(context?.permissions).map(text).filter(Boolean);
  return required.every((needed) =>
    granted.some((candidate) => permissionMatches(candidate, needed)),
  );
}

function parseCapabilityKey(value) {
  const key = text(value);
  const parts = key.split(".");
  if (parts.length !== 3 || parts.some((part) => !text(part))) return null;
  return { key, domain: parts[0], capability: parts[1], action: parts[2] };
}

function operatorEnabled(manifest = {}) {
  return (
    manifest.operatorEnabled === true ||
    manifest.operator_enabled === true ||
    manifest.aiEnabled === true
  );
}

function riskLevel(manifest = {}) {
  const value = text(manifest.risk || manifest.riskLevel || manifest.risk_level).toLowerCase();
  return ["low", "medium", "high", "critical"].includes(value) ? value : "medium";
}

function contextScope(manifest = {}) {
  const value = text(
    manifest.contextScope || manifest.context_scope || manifest.scope,
  ).toLowerCase();
  return ["organization", "entity"].includes(value) ? value : null;
}

function inferredMode(manifest = {}, target = {}) {
  const explicit = text(manifest.operatorMode || manifest.operator_mode).toLowerCase();
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
  return "write";
}

function approvalPolicy(manifest = {}) {
  return manifest.approval || manifest.approvalPolicy || manifest.approval_policy || null;
}

function autoExecute(manifest = {}, mode) {
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
    ["high", "critical"].includes(riskLevel(manifest)) ||
    !autoExecute(manifest, mode)
  );
}

function dynamicReference(value, depth = 0) {
  if (depth > 6 || value === null || value === undefined) return false;
  if (typeof value === "string") {
    const source = value.toLowerCase();
    return (
      /\$\{?\s*(?:step|result|previous_result|prior_result)/.test(source) ||
      /\{\{[^}]*\b(?:step|result|previous_result|prior_result)\b/.test(source) ||
      /\b(?:previous|prior)_?(?:step_?)?result\b/.test(source)
    );
  }
  if (Array.isArray(value)) return value.some((item) => dynamicReference(item, depth + 1));
  if (typeof value !== "object") return false;
  return Object.values(value).some((item) => dynamicReference(item, depth + 1));
}

function normalizeVerification(value) {
  const candidate = object(value);
  const capabilityKey = text(candidate.capability_key);
  if (!capabilityKey) return null;
  return {
    capability_key: capabilityKey,
    description:
      text(candidate.description || candidate.label) || "Verify the business effect",
    payload: object(candidate.payload),
  };
}

function normalizeSteps(payload = {}) {
  const requested = list(payload.steps);
  if (requested.length < 2 || requested.length > MAX_STEPS) {
    return { error: "OPERATOR_MISSION_REQUIRES_2_TO_6_STEPS", steps: [] };
  }
  const ids = new Set();
  const steps = requested.map((step, index) => ({
    id: text(step?.id) || `step_${index + 1}`,
    label: text(step?.label || step?.description) || `Mission step ${index + 1}`,
    capability_key: text(step?.capability_key),
    payload: object(step?.payload),
    verify_after: normalizeVerification(step?.verify_after),
  }));
  if (steps.some((step) => !step.capability_key)) {
    return { error: "OPERATOR_MISSION_CAPABILITY_KEY_REQUIRED", steps: [] };
  }
  for (const step of steps) {
    if (ids.has(step.id)) {
      return { error: "OPERATOR_MISSION_STEP_IDS_MUST_BE_UNIQUE", steps: [] };
    }
    ids.add(step.id);
  }
  if (steps.some((step) => dynamicReference(step.payload))) {
    return { error: "OPERATOR_MISSION_DYNAMIC_RESULT_CHAINING_BLOCKED", steps: [] };
  }
  if (steps.some((step) => step.verify_after && dynamicReference(step.verify_after.payload))) {
    return { error: "OPERATOR_MISSION_DYNAMIC_VERIFICATION_CHAINING_BLOCKED", steps: [] };
  }
  return { error: null, steps };
}

async function loadTarget(capabilityKey, unavailableReason) {
  const target = parseCapabilityKey(capabilityKey);
  if (!target) return { ok: false, reason: "OPERATOR_MISSION_INVALID_CAPABILITY_KEY" };
  if (target.key === MISSION_KEY) return { ok: false, reason: "OPERATOR_MISSION_RECURSION_BLOCKED" };
  if (target.key === READ_CHAIN_KEY) {
    return { ok: false, reason: "OPERATOR_MISSION_READ_CHAIN_NESTING_BLOCKED" };
  }
  try {
    const loaded = await loadCapability(target);
    return { ok: true, target, manifest: loaded.manifest || {} };
  } catch (error) {
    return {
      ok: false,
      reason: unavailableReason,
      detail: text(error?.message) || null,
    };
  }
}

async function preflightRead(verification, context) {
  const loaded = await loadTarget(
    verification.capability_key,
    "OPERATOR_MISSION_VERIFY_CAPABILITY_NOT_AVAILABLE",
  );
  if (!loaded.ok) return loaded;
  const mode = inferredMode(loaded.manifest, loaded.target);
  if (!operatorEnabled(loaded.manifest) || mode !== "read") {
    return { ok: false, reason: "OPERATOR_MISSION_VERIFY_READ_REQUIRED" };
  }
  if (loaded.manifest.transactional === true || ["high", "critical"].includes(riskLevel(loaded.manifest))) {
    return { ok: false, reason: "OPERATOR_MISSION_VERIFY_UNSAFE_READ_BLOCKED" };
  }
  if (contextScope(loaded.manifest) === "entity" && !text(context?.entityId)) {
    return { ok: false, reason: "OPERATOR_ENTITY_CONTEXT_REQUIRED" };
  }
  if (!hasPermissions(context, loaded.manifest.permissions)) {
    return { ok: false, reason: "OPERATOR_MISSION_VERIFY_PERMISSION_REQUIRED" };
  }
  return { ok: true, ...loaded, verification };
}

async function preflightStep(step, context) {
  const loaded = await loadTarget(
    step.capability_key,
    "OPERATOR_MISSION_CAPABILITY_NOT_AVAILABLE",
  );
  if (!loaded.ok) return { ...loaded, step };
  const { target, manifest } = loaded;
  const mode = inferredMode(manifest, target);
  const risk = riskLevel(manifest);
  const capability = {
    key: target.key,
    domain: target.domain,
    capability: target.capability,
    action: target.action,
    mode,
    risk,
    approval: approvalPolicy(manifest),
    reversible:
      manifest.reversible === true ||
      Boolean(manifest.compensatingCapability || manifest.compensating_capability),
    transactional: manifest.transactional === true,
  };
  if (!operatorEnabled(manifest)) {
    return { ok: false, reason: "OPERATOR_MISSION_OPERATOR_CAPABILITY_REQUIRED", step };
  }
  if (!["read", "draft", "write", "approve"].includes(mode)) {
    return { ok: false, reason: "OPERATOR_MISSION_NAVIGATION_STEP_BLOCKED", step };
  }
  if (contextScope(manifest) === "entity" && !text(context?.entityId)) {
    return { ok: false, reason: "OPERATOR_ENTITY_CONTEXT_REQUIRED", step };
  }
  if (!hasPermissions(context, manifest.permissions)) {
    return { ok: false, reason: "OPERATOR_MISSION_PERMISSION_REQUIRED", step };
  }
  let verification = null;
  if (mode !== "read") {
    if (!step.verify_after) {
      return { ok: false, reason: "OPERATOR_MISSION_ACTION_REQUIRES_VERIFY_AFTER", step };
    }
    verification = await preflightRead(step.verify_after, context);
    if (!verification.ok) return { ...verification, step };
  }
  return {
    ok: true,
    step,
    target,
    manifest,
    capability,
    verification,
    contract: {
      mode,
      risk,
      context_scope: contextScope(manifest),
      auto_execute: autoExecute(manifest, mode),
      requires_confirmation: mode === "read" ? false : requiresConfirmation(manifest, mode),
      durable_approval_required: mode === "read" ? false : requiresDurableApproval(capability),
    },
  };
}

function bounded(value, depth = 0) {
  if (value === null || value === undefined) return value ?? null;
  if (typeof value === "string") return value.slice(0, 300);
  if (["number", "boolean"].includes(typeof value)) return value;
  if (depth >= 3) return "[bounded]";
  if (Array.isArray(value)) {
    return {
      total_count: value.length,
      showing: Math.min(value.length, SAMPLE_SIZE),
      sample: value.slice(0, SAMPLE_SIZE).map((item) => bounded(item, depth + 1)),
    };
  }
  if (typeof value !== "object") return text(value).slice(0, 300);
  return Object.fromEntries(
    Object.entries(value)
      .slice(0, 18)
      .filter(([, candidate]) => candidate !== undefined && typeof candidate !== "function")
      .map(([key, candidate]) => [key, bounded(candidate, depth + 1)]),
  );
}

function scopedPayload(context, payload = {}) {
  const partyId = text(context?.metadata?.partyId) || null;
  return {
    ...object(payload),
    organizationId: context.organizationId,
    organization_id: context.organizationId,
    ...(context.entityId ? { entityId: context.entityId, entity_id: context.entityId } : {}),
    ...(context.periodId ? { periodId: context.periodId, period_id: context.periodId } : {}),
    ...(partyId ? { partyId, party_id: partyId } : {}),
  };
}

function missionScope(context = {}) {
  const actor = object(context?.actor);
  return {
    organization_id: text(context?.organizationId) || null,
    entity_id: text(context?.entityId) || null,
    period_id: text(context?.periodId) || null,
    party_id: text(context?.metadata?.partyId) || null,
    actor_id: text(actor.id || actor.user_id) || null,
  };
}

function missionScopeMatches(expected, context) {
  const actual = missionScope(context);
  return (
    text(expected?.organization_id) === text(actual.organization_id) &&
    text(expected?.entity_id) === text(actual.entity_id) &&
    text(expected?.period_id) === text(actual.period_id) &&
    text(expected?.party_id) === text(actual.party_id) &&
    text(expected?.actor_id) === text(actual.actor_id)
  );
}

function childRuntime(context, step, source) {
  return {
    entityId: context.entityId,
    periodId: context.periodId,
    permissions: context.permissions,
    callerRequest: context.callerRequest,
    metadata: {
      ...object(context.metadata),
      source,
      parentCapabilityKey: MISSION_KEY,
      missionStepId: step.id,
      missionCapabilityKey: step.capability_key,
    },
  };
}

async function executeEntry(entry, context) {
  const payload = scopedPayload(context, entry.step.payload);
  const result = await executeUbteCapability({
    organizationId: context.organizationId,
    domain: entry.target.domain,
    capability: entry.target.capability,
    action: entry.target.action,
    payload,
    actor: context.actor,
    runtime: childRuntime(context, entry.step, "AVANTIQO_OPERATOR_MISSION"),
  });
  return { result, payload };
}

async function executeVerification(entry, context) {
  const verification = entry.verification;
  const payload = scopedPayload(context, verification.verification.payload);
  const result = await executeUbteCapability({
    organizationId: context.organizationId,
    domain: verification.target.domain,
    capability: verification.target.capability,
    action: verification.target.action,
    payload,
    actor: context.actor,
    runtime: childRuntime(
      context,
      { id: entry.step.id, capability_key: verification.verification.capability_key },
      "AVANTIQO_OPERATOR_MISSION_VERIFY",
    ),
  });
  return result;
}

function actorIdentity(context) {
  const actor = object(context?.actor);
  return {
    actorId: text(actor.id || actor.user_id) || null,
    actorName: text(actor.name || actor.email) || null,
  };
}

async function auditStep({ context, capability, payload, outcome, result = null, error = null, approval = null }) {
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
    approval,
  });
}

function normalizeResume(payload, preflight, context) {
  const trusted = context?.metadata?.operatorMissionResume === true;
  if (!trusted) {
    return {
      completed_step_ids: [],
      current_step_id: preflight[0]?.step.id || null,
      current_step_confirmed: false,
      approval_request_id: null,
      verification_pending: null,
    };
  }
  const resume = object(payload.resume);
  const resumeScope = object(resume.scope);
  if (
    !text(resumeScope.organization_id) ||
    !text(resumeScope.party_id) ||
    !text(resumeScope.actor_id) ||
    !missionScopeMatches(resumeScope, context)
  ) {
    return { error: "OPERATOR_MISSION_RESUME_SCOPE_INVALID" };
  }
  const orderedIds = preflight.map((entry) => entry.step.id);
  const validIds = new Set(orderedIds);
  const rawCompleted = list(resume.completed_step_ids).map(text).filter(Boolean);
  const completed = Array.from(new Set(rawCompleted));
  if (
    rawCompleted.length !== completed.length ||
    completed.some((id) => !validIds.has(id))
  ) {
    return { error: "OPERATOR_MISSION_RESUME_CHECKPOINT_INVALID" };
  }
  const currentStepId = text(resume.current_step_id);
  if (!currentStepId || !validIds.has(currentStepId)) {
    return { error: "OPERATOR_MISSION_RESUME_STEP_INVALID" };
  }
  const currentIndex = orderedIds.indexOf(currentStepId);
  const expectedCompleted = orderedIds.slice(0, currentIndex);
  if (
    completed.length !== expectedCompleted.length ||
    completed.some((id, index) => id !== expectedCompleted[index])
  ) {
    return { error: "OPERATOR_MISSION_RESUME_CHECKPOINT_INVALID" };
  }

  const currentEntry = preflight[currentIndex];
  const currentStepConfirmed = resume.current_step_confirmed === true;
  const approvalRequestId = text(resume.approval_request_id) || null;
  const verification = object(resume.verification_pending);
  const verificationStepId = text(verification.step_id);
  const registeredVerification = currentEntry?.verification?.verification || null;

  if (
    verificationStepId &&
    (
      verificationStepId !== currentStepId ||
      currentEntry?.contract?.mode === "read" ||
      !registeredVerification ||
      text(verification.capability_key) !== text(registeredVerification.capability_key)
    )
  ) {
    return { error: "OPERATOR_MISSION_RESUME_VERIFICATION_INVALID" };
  }

  if (
    currentEntry?.contract?.mode === "read" &&
    (currentStepConfirmed || approvalRequestId || verificationStepId)
  ) {
    return { error: "OPERATOR_MISSION_RESUME_GATE_STATE_INVALID" };
  }

  if (
    approvalRequestId &&
    (!currentEntry?.contract?.durable_approval_required || !currentStepConfirmed)
  ) {
    return { error: "OPERATOR_MISSION_RESUME_GATE_STATE_INVALID" };
  }

  if (verificationStepId && (!currentStepConfirmed || approvalRequestId)) {
    return { error: "OPERATOR_MISSION_RESUME_VERIFICATION_INVALID" };
  }

  return {
    completed_step_ids: completed,
    current_step_id: currentStepId,
    current_step_confirmed: currentStepConfirmed,
    approval_request_id: approvalRequestId,
    verification_pending: verificationStepId ? verification : null,
  };
}

function stateSteps(preflight, completedIds, currentStepId, status, approvalRequestId = null) {
  const completed = new Set(completedIds);
  return preflight.map((entry) => ({
    id: entry.step.id,
    kind: entry.contract.mode === "read" ? "read" : "action",
    description: entry.step.label,
    capability_key: entry.step.capability_key,
    payload: entry.step.payload,
    status: completed.has(entry.step.id)
      ? "completed"
      : entry.step.id === currentStepId
        ? status
        : "planned",
    gate:
      entry.step.id === currentStepId && status === "awaiting_confirmation"
        ? "confirmation"
        : entry.step.id === currentStepId && status === "awaiting_approval"
          ? "approval"
          : "none",
    ...(entry.step.verify_after ? { verify_after: entry.step.verify_after } : {}),
    ...(entry.step.id === currentStepId && approvalRequestId
      ? { approval_request_id: approvalRequestId }
      : {}),
  }));
}

function resultState({ preflight, completedIds, currentStepId, status, blocker = null, approvalRequestId = null }) {
  return {
    status,
    completed_step_ids: completedIds,
    current_step_id: currentStepId || null,
    blocker,
    steps: stateSteps(preflight, completedIds, currentStepId, status, approvalRequestId),
  };
}

function resumePayload({ steps, completedIds, currentStepId, confirmed, approvalRequestId = null, verificationPending = null, context }) {
  return {
    steps,
    resume: {
      scope: missionScope(context),
      completed_step_ids: completedIds,
      current_step_id: currentStepId,
      current_step_confirmed: confirmed === true,
      approval_request_id: approvalRequestId,
      verification_pending: verificationPending,
    },
  };
}

function paused({ preflight, steps, completedIds, currentStepId, pauseReason, confirmed, results, blocker, approvalRequest = null, verificationPending = null, context }) {
  const status =
    pauseReason === "confirmation"
      ? "awaiting_confirmation"
      : pauseReason === "approval"
        ? "awaiting_approval"
        : pauseReason === "verification"
          ? "verifying"
          : "blocked";
  const approvalRequestId = text(approvalRequest?.id) || null;
  return {
    status: "paused",
    pause_reason: pauseReason,
    reason: blocker || null,
    mission_mode: "durable_registered_sequence",
    all_steps_preflighted: true,
    total_steps: steps.length,
    completed_steps: completedIds.length,
    remaining_steps: Math.max(0, steps.length - completedIds.length),
    current_step_id: currentStepId,
    approval_request: approvalRequest,
    steps: results,
    mission_state: resultState({
      preflight,
      completedIds,
      currentStepId,
      status,
      blocker,
      approvalRequestId,
    }),
    resume_payload: resumePayload({
      steps,
      completedIds,
      currentStepId,
      confirmed,
      approvalRequestId,
      verificationPending,
      context,
    }),
  };
}

function blocked({ preflight, steps, completedIds, currentStepId, reason, detail = null, results = [] }) {
  return {
    status: "blocked",
    reason,
    detail,
    mission_mode: "durable_registered_sequence",
    all_steps_preflighted: true,
    total_steps: steps.length,
    completed_steps: completedIds.length,
    remaining_steps: Math.max(0, steps.length - completedIds.length),
    current_step_id: currentStepId,
    steps: results,
    mission_state: resultState({
      preflight,
      completedIds,
      currentStepId,
      status: "blocked",
      blocker: reason,
    }),
  };
}

export function createOperatorMissionCapability() {
  const manifest = defineCapability({
    domain: "platform",
    capability: "operator_mission",
    action: "execute",
    description:
      "Run a bounded 2 to 6 step Operator mission whose exact registered capabilities and payloads are known before execution. All steps are preflighted before the first side effect. Reads may run automatically. Writes require a registered read verification and respect confirmation and durable approval gates. Paused missions return exact resumable state; verification resumes before any write replay. Dynamic result-to-next-step chaining, recursive missions, nested read chains, unregistered capabilities, permission bypasses, and unsafe scope changes are blocked.",
    permissions: [],
    events: [],
    tags: [
      "platform",
      "operator",
      "mission",
      "autonomous",
      "multi-step",
      "resumable",
      "approval",
      "confirmation",
      "verification",
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
      required: ["steps"],
      properties: {
        steps: {
          type: "array",
          minItems: 2,
          maxItems: MAX_STEPS,
          items: {
            type: "object",
            required: ["capability_key"],
            properties: {
              id: { type: "string" },
              label: { type: "string" },
              capability_key: { type: "string" },
              payload: { type: "object", additionalProperties: true },
              verify_after: { type: "object", additionalProperties: true },
            },
            additionalProperties: false,
          },
        },
        resume: {
          type: "object",
          description: "Trusted runtime resume state; ignored for ordinary user-planned calls.",
          additionalProperties: true,
        },
      },
      additionalProperties: false,
    },
  });

  async function execute({ context, payload = {} }) {
    const normalized = normalizeSteps(payload);
    if (normalized.error) {
      return {
        status: "blocked",
        mission_mode: "durable_registered_sequence",
        all_steps_preflighted: false,
        reason: normalized.error,
        total_steps: 0,
        completed_steps: 0,
        remaining_steps: 0,
        steps: [],
      };
    }

    const preflight = [];
    for (const step of normalized.steps) {
      preflight.push(await preflightStep(step, context));
    }
    const invalid = preflight.find((entry) => !entry.ok);
    if (invalid) {
      return {
        status: "blocked",
        mission_mode: "durable_registered_sequence",
        all_steps_preflighted: false,
        reason: invalid.reason,
        detail: invalid.detail || null,
        blocked_step: {
          id: invalid.step?.id || null,
          label: invalid.step?.label || null,
          capability_key: invalid.step?.capability_key || null,
        },
        total_steps: normalized.steps.length,
        completed_steps: 0,
        remaining_steps: normalized.steps.length,
        steps: [],
      };
    }

    const resume = normalizeResume(payload, preflight, context);
    if (resume.error) {
      return blocked({
        preflight,
        steps: normalized.steps,
        completedIds: [],
        currentStepId: normalized.steps[0]?.id || null,
        reason: resume.error,
      });
    }

    const completedIds = [...resume.completed_step_ids];
    const results = [];
    let currentStepId = resume.current_step_id;
    let currentStepConfirmed = resume.current_step_confirmed;
    let approvalRequestId = resume.approval_request_id;
    let verificationPending = resume.verification_pending;
    const confirmedStepId =
      context?.metadata?.operatorMissionResume === true &&
      context?.metadata?.operatorMissionConfirmed === true
        ? currentStepId
        : null;

    for (
      let index = preflight.findIndex((entry) => entry.step.id === currentStepId);
      index >= 0 && index < preflight.length;
      index += 1
    ) {
      const entry = preflight[index];
      const { step, contract, capability } = entry;
      currentStepId = step.id;

      // Verification retry is intentionally handled before the action path.
      // A failed verification never causes the already-completed write to replay.
      if (verificationPending) {
        try {
          const verificationResult = await executeVerification(entry, context);
          results.push({
            id: step.id,
            capability_key: step.capability_key,
            status: "verification_completed",
            verification: bounded(verificationResult),
          });
          completedIds.push(step.id);
          verificationPending = null;
          currentStepConfirmed = false;
          approvalRequestId = null;
          currentStepId = preflight[index + 1]?.step.id || null;
          continue;
        } catch (error) {
          return paused({
            preflight,
            steps: normalized.steps,
            completedIds,
            currentStepId: step.id,
            pauseReason: "verification",
            confirmed: true,
            verificationPending,
            results,
            blocker: text(error?.message) || "OPERATOR_MISSION_VERIFICATION_FAILED",
            context,
          });
        }
      }

      if (contract.mode === "read") {
        try {
          const execution = await executeEntry(entry, context);
          results.push({
            id: step.id,
            capability_key: step.capability_key,
            status: "completed",
            result: bounded(execution.result),
          });
          completedIds.push(step.id);
          currentStepConfirmed = false;
          approvalRequestId = null;
          verificationPending = null;
          currentStepId = preflight[index + 1]?.step.id || null;
          continue;
        } catch (error) {
          return blocked({
            preflight,
            steps: normalized.steps,
            completedIds,
            currentStepId: step.id,
            reason: text(error?.message) || "OPERATOR_MISSION_READ_FAILED",
            results,
          });
        }
      }

      const confirmationSatisfied =
        !contract.requires_confirmation ||
        currentStepConfirmed ||
        confirmedStepId === step.id;
      if (!confirmationSatisfied) {
        return paused({
          preflight,
          steps: normalized.steps,
          completedIds,
          currentStepId: step.id,
          pauseReason: "confirmation",
          confirmed: false,
          results,
          blocker: "CONFIRMATION_REQUIRED",
          context,
        });
      }
      currentStepConfirmed = true;

      let approval = {
        allowed: true,
        governed: true,
        approvalRequest: null,
        reason: null,
      };
      if (contract.durable_approval_required) {
        const identity = actorIdentity(context);
        approval = await resolveOperatorExecutionApproval({
          capability,
          organizationId: context.organizationId,
          entityId: context.entityId,
          actorId: identity.actorId,
          approvalRequestId,
        });
        if (!approval.allowed) {
          const normalizedPayload = scopedPayload(context, step.payload);
          await auditStep({
            context,
            capability,
            payload: normalizedPayload,
            outcome: "blocked",
            approval,
          });
          if (TERMINAL_APPROVAL_FAILURE_REASONS.has(text(approval.reason))) {
            return blocked({
              preflight,
              steps: normalized.steps,
              completedIds,
              currentStepId: step.id,
              reason: approval.reason,
              detail: approval.error || null,
              results,
            });
          }
          return paused({
            preflight,
            steps: normalized.steps,
            completedIds,
            currentStepId: step.id,
            pauseReason: "approval",
            confirmed: true,
            approvalRequest: approval.approvalRequest,
            results,
            blocker: approval.reason || "APPROVAL_REQUIRED",
            context,
          });
        }
      }

      let action;
      try {
        action = await executeEntry(entry, context);
        await auditStep({
          context,
          capability,
          payload: action.payload,
          outcome: "executed",
          result: action.result,
          approval,
        });
        results.push({
          id: step.id,
          capability_key: step.capability_key,
          status: "action_completed",
          result: bounded(action.result),
        });
      } catch (error) {
        const normalizedPayload = scopedPayload(context, step.payload);
        await auditStep({
          context,
          capability,
          payload: normalizedPayload,
          outcome: "failed",
          error: text(error?.message) || "Mission step failed",
          approval,
        });
        return blocked({
          preflight,
          steps: normalized.steps,
          completedIds,
          currentStepId: step.id,
          reason: text(error?.message) || "OPERATOR_MISSION_ACTION_FAILED",
          results,
        });
      }

      try {
        const verificationResult = await executeVerification(entry, context);
        results.push({
          id: step.id,
          capability_key: step.capability_key,
          status: "completed",
          verification: bounded(verificationResult),
        });
        completedIds.push(step.id);
        currentStepConfirmed = false;
        approvalRequestId = null;
        verificationPending = null;
        currentStepId = preflight[index + 1]?.step.id || null;
      } catch (error) {
        verificationPending = {
          step_id: step.id,
          capability_key: entry.verification.verification.capability_key,
          description: entry.verification.verification.description,
          payload: entry.verification.verification.payload,
        };
        return paused({
          preflight,
          steps: normalized.steps,
          completedIds,
          currentStepId: step.id,
          pauseReason: "verification",
          confirmed: true,
          verificationPending,
          results,
          blocker: text(error?.message) || "OPERATOR_MISSION_VERIFICATION_FAILED",
          context,
        });
      }
    }

    return {
      status: "completed",
      mission_mode: "durable_registered_sequence",
      all_steps_preflighted: true,
      total_steps: normalized.steps.length,
      completed_steps: completedIds.length,
      remaining_steps: 0,
      current_step_id: null,
      steps: results,
      mission_state: resultState({
        preflight,
        completedIds,
        currentStepId: null,
        status: "completed",
      }),
    };
  }

  return { manifest, execute };
}

export default createOperatorMissionCapability;