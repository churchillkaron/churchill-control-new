import crypto from "node:crypto";
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
const EXTERNAL_WAIT_KEY = "platform.business_partner_external_wait.execute";
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

function normalizeExternalWait(value, payload = {}) {
  const candidate = object(value);
  const data = object(payload);
  const eventSource = text(candidate.event_source || candidate.eventSource || data.event_source || data.eventSource);
  const eventType = text(candidate.event_type || candidate.eventType || data.event_type || data.eventType);
  const correlationKey = text(candidate.correlation_key || candidate.correlationKey || data.correlation_key || data.correlationKey);
  const correlationFrom = object(candidate.correlation_from || candidate.correlationFrom);
  const sourceStepId = text(correlationFrom.step_id || correlationFrom.stepId);
  const resultPath = text(correlationFrom.result_path || correlationFrom.resultPath);
  const prefix = text(correlationFrom.prefix);
  const hasBinding = Boolean(sourceStepId || resultPath || prefix);
  if (!eventSource && !eventType && !correlationKey && !hasBinding) return null;
  if (!eventSource || !eventType || (!correlationKey && !(sourceStepId && resultPath))) {
    return { error: "OPERATOR_MISSION_EXTERNAL_WAIT_CONTRACT_INCOMPLETE" };
  }
  if (correlationKey && hasBinding) return { error: "OPERATOR_MISSION_EXTERNAL_WAIT_CORRELATION_AMBIGUOUS" };
  if (hasBinding && (!/^[A-Za-z0-9_.]+$/.test(resultPath) || resultPath.split(".").length > 8)) {
    return { error: "OPERATOR_MISSION_EXTERNAL_WAIT_RESULT_PATH_INVALID" };
  }
  return {
    event_source: eventSource,
    event_type: eventType,
    correlation_key: correlationKey || null,
    ...(hasBinding ? { correlation_from: { step_id: sourceStepId, result_path: resultPath, prefix: prefix.slice(0, 120) } } : {}),
  };
}

function resolveExternalWaitCorrelation(wait, results = []) {
  if (text(wait?.correlation_key)) return { ...wait, correlation_key: text(wait.correlation_key) };
  const binding = object(wait?.correlation_from);
  const source = results.find((item) => text(item?.id) === text(binding.step_id) && text(item?.status) !== "failed");
  if (!source) return { error: "OPERATOR_MISSION_EXTERNAL_WAIT_SOURCE_RESULT_UNAVAILABLE" };
  let value = source.result;
  for (const key of text(binding.result_path).split(".")) {
    if (!key || value === null || value === undefined || typeof value !== "object" || Array.isArray(value)) {
      return { error: "OPERATOR_MISSION_EXTERNAL_WAIT_SOURCE_RESULT_UNAVAILABLE" };
    }
    value = value[key];
  }
  if (!["string", "number"].includes(typeof value) || !text(value)) {
    return { error: "OPERATOR_MISSION_EXTERNAL_WAIT_SOURCE_RESULT_NOT_SCALAR" };
  }
  return { ...wait, correlation_key: `${text(binding.prefix)}${text(value)}`.slice(0, 500) };
}

function normalizeSteps(payload = {}) {
  const requested = list(payload.steps);
  if (requested.length < 2 || requested.length > MAX_STEPS) {
    return { error: "OPERATOR_MISSION_REQUIRES_2_TO_6_STEPS", steps: [] };
  }
  const ids = new Set();
  const steps = requested.map((step, index) => {
    const wait = normalizeExternalWait(step?.wait_for_external, step?.payload);
    return {
      id: text(step?.id) || `step_${index + 1}`,
      label: text(step?.label || step?.description) || `Mission step ${index + 1}`,
      capability_key: text(step?.capability_key) || (wait && !wait.error ? EXTERNAL_WAIT_KEY : ""),
      payload: object(step?.payload),
      verify_after: normalizeVerification(step?.verify_after),
      wait_for_external: wait && !wait.error ? wait : null,
      wait_error: wait?.error || null,
    };
  });
  if (steps.some((step) => step.wait_error)) {
    return { error: "OPERATOR_MISSION_EXTERNAL_WAIT_CONTRACT_INCOMPLETE", steps: [] };
  }
  if (steps.some((step) => !step.capability_key)) {
    return { error: "OPERATOR_MISSION_CAPABILITY_KEY_REQUIRED", steps: [] };
  }
  for (const step of steps) {
    if (ids.has(step.id)) {
      return { error: "OPERATOR_MISSION_STEP_IDS_MUST_BE_UNIQUE", steps: [] };
    }
    ids.add(step.id);
  }
  for (let index = 0; index < steps.length; index += 1) {
    const binding = object(steps[index].wait_for_external?.correlation_from);
    if (!text(binding.step_id)) continue;
    const sourceIndex = steps.findIndex((step) => step.id === binding.step_id);
    if (sourceIndex < 0 || sourceIndex >= index) {
      return { error: "OPERATOR_MISSION_EXTERNAL_WAIT_SOURCE_STEP_INVALID", steps: [] };
    }
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
  const externalWait = target.key === EXTERNAL_WAIT_KEY && Boolean(step.wait_for_external);
  if (mode !== "read" && !externalWait) {
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
      requires_confirmation: mode === "read" || externalWait ? false : requiresConfirmation(manifest, mode),
      durable_approval_required: mode === "read" || externalWait ? false : requiresDurableApproval(capability),
      external_wait: externalWait,
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
      run_id: null,
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
    run_id: text(resume.run_id) || null,
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
    ...(entry.step.wait_for_external ? { wait_for_external: entry.step.wait_for_external } : {}),
    ...(entry.step.id === currentStepId && approvalRequestId
      ? { approval_request_id: approvalRequestId }
      : {}),
  }));
}

function resultState({ preflight, completedIds, currentStepId, status, blocker = null, approvalRequestId = null, runId = null }) {
  return {
    ...(text(runId) ? { run_id: text(runId) } : {}),
    status,
    completed_step_ids: completedIds,
    current_step_id: currentStepId || null,
    blocker,
    steps: stateSteps(preflight, completedIds, currentStepId, status, approvalRequestId),
  };
}

function resumePayload({ steps, completedIds, currentStepId, confirmed, approvalRequestId = null, verificationPending = null, runId = null, context }) {
  return {
    steps,
    resume: {
      ...(text(runId) ? { run_id: text(runId) } : {}),
      scope: missionScope(context),
      completed_step_ids: completedIds,
      current_step_id: currentStepId,
      current_step_confirmed: confirmed === true,
      approval_request_id: approvalRequestId,
      verification_pending: verificationPending,
    },
  };
}

async function registerApprovalDecisionWaits({ context, steps, completedIds, currentStepId, approvalRequest, runId }) {
  const approvalRequestId = text(approvalRequest?.id);
  if (!approvalRequestId || !text(runId) || !text(currentStepId)) return false;
  const checkpoint = resumePayload({
    steps, completedIds, currentStepId, confirmed: true,
    approvalRequestId, runId, context,
  });
  const basePayload = {
    run_id: runId,
    step_id: currentStepId,
    event_source: "approval",
    correlation_key: `approval_request:${approvalRequestId}`,
    mission_checkpoint: {
      ...checkpoint,
      objective: text(context?.metadata?.operatorMissionObjective) || null,
      approval_request_id: approvalRequestId,
      authorization_effect: "NONE",
    },
  };
  try {
    for (const eventType of ["APPROVAL_GRANTED", "APPROVAL_REJECTED"]) {
      await executeUbteCapability({
        organizationId: context.organizationId,
        domain: "platform", capability: "business_partner_external_wait", action: "execute",
        payload: { ...basePayload, event_type: eventType },
        actor: context.actor,
        runtime: childRuntime(
          context,
          { id: currentStepId, capability_key: EXTERNAL_WAIT_KEY },
          "AVANTIQO_OPERATOR_MISSION_APPROVAL_WAIT",
        ),
      });
    }
    return true;
  } catch (error) {
    console.error("BUSINESS_PARTNER_APPROVAL_AUTO_WAKE_REGISTRATION_FAILED", error);
    return false;
  }
}

function paused({ preflight, steps, completedIds, currentStepId, pauseReason, confirmed, results, blocker, approvalRequest = null, verificationPending = null, externalWait = null, runId = null, context }) {
  const status =
    pauseReason === "confirmation"
      ? "awaiting_confirmation"
      : pauseReason === "approval"
        ? "awaiting_approval"
        : pauseReason === "verification"
          ? "verifying"
          : pauseReason === "external"
            ? "waiting_external"
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
    ...(externalWait ? { external_wait: externalWait } : {}),
    steps: results,
    mission_state: resultState({
      preflight,
      completedIds,
      currentStepId,
      status,
      blocker,
      approvalRequestId,
      runId,
    }),
    resume_payload: resumePayload({
      steps,
      completedIds,
      currentStepId,
      confirmed,
      approvalRequestId,
      verificationPending,
      runId,
      context,
    }),
  };
}


function missionStepFailureEvidence(error, entry, phase) {
  const explicit = text(error?.code).toUpperCase();
  const messagePrefix = text(error?.message).toUpperCase().match(/^([A-Z][A-Z0-9_.:-]{2,119})(?::|\s|$)/)?.[1];
  const errorCode = /^[A-Z][A-Z0-9_.:-]{1,119}$/.test(explicit)
    ? explicit
    : messagePrefix || "OPERATOR_MISSION_STEP_RUNTIME_FAILURE";
  const statusCode = Number(error?.status || error?.statusCode || 0);
  return {
    contract: "AVANTIQO_OPERATOR_MISSION_STEP_FAILURE_EVIDENCE_V1",
    phase,
    step_id: text(entry?.step?.id) || null,
    capability: {
      key: text(entry?.step?.capability_key) || null,
      domain: text(entry?.target?.domain) || null,
      capability: text(entry?.target?.capability) || null,
      action: text(entry?.target?.action) || null,
    },
    error_code: errorCode,
    error_class: text(error?.constructor?.name) || null,
    status_code: Number.isFinite(statusCode) && statusCode >= 400 && statusCode <= 599 ? statusCode : null,
    raw_error_exposed: false,
    mutation_completion_proven: false,
  };
}
function blocked({ preflight, steps, completedIds, currentStepId, reason, detail = null, results = [], failureEvidence = null, runId = null }) {
  return {
    status: "blocked",
    reason,
    detail,
    ...(failureEvidence ? { failure_evidence: failureEvidence } : {}),
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
      runId,
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
            properties: {
              id: { type: "string" },
              label: { type: "string" },
              capability_key: { type: "string" },
              payload: { type: "object", additionalProperties: true },
              verify_after: { type: "object", additionalProperties: true },
              wait_for_external: {
                type: "object",
                properties: {
                  event_source: { type: "string" },
                  event_type: { type: "string" },
                  correlation_key: { type: "string" },
                },
                additionalProperties: false,
              },
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
    const missionRunId = text(resume.run_id) || `operator_mission_${crypto.randomUUID()}`;
    if (resume.error) {
      return blocked({
        preflight,
        steps: normalized.steps,
        completedIds: [],
        currentStepId: normalized.steps[0]?.id || null,
        reason: resume.error,
        runId: missionRunId,
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

      if (contract.external_wait === true) {
        const resolvedExternalWait = resolveExternalWaitCorrelation(step.wait_for_external, results);
        if (resolvedExternalWait.error) {
          return blocked({
            preflight, steps: normalized.steps, completedIds, currentStepId: step.id,
            reason: resolvedExternalWait.error, results,
            runId: missionRunId,
          });
        }
        const checkpoint = resumePayload({
          steps: normalized.steps,
          completedIds,
          currentStepId: step.id,
          confirmed: true,
          runId: missionRunId,
          context,
        });
        const waitEnvelope = await executeUbteCapability({
          organizationId: context.organizationId,
          domain: entry.target.domain,
          capability: entry.target.capability,
          action: entry.target.action,
          payload: {
            run_id: missionRunId,
            step_id: step.id,
            ...object(resolvedExternalWait),
            mission_checkpoint: {
              ...checkpoint,
              objective: text(context?.metadata?.operatorMissionObjective) || null,
            },
          },
          actor: context.actor,
          runtime: childRuntime(
            context,
            step,
            "AVANTIQO_OPERATOR_MISSION_EXTERNAL_WAIT",
          ),
        });
        const wait = waitEnvelope?.result ?? waitEnvelope;
        if (text(wait?.status).toUpperCase() !== "EVENT_RECEIVED") {
          return paused({
            preflight,
            steps: normalized.steps,
            completedIds,
            currentStepId: step.id,
            pauseReason: "external",
            confirmed: true,
            results,
            blocker: "WAITING_EXTERNAL",
            externalWait: {
              wait_key: text(wait?.wait_key),
              event_source: text(resolvedExternalWait.event_source),
              event_type: text(resolvedExternalWait.event_type),
              correlation_key: text(resolvedExternalWait.correlation_key),
              authorization_effect: "NONE",
            },
            runId: missionRunId,
            context,
          });
        }
        results.push({
          id: step.id,
          capability_key: step.capability_key,
          status: "completed",
          result: { event_received: true, event_id: text(wait.event_id) || null },
        });
        completedIds.push(step.id);
        currentStepConfirmed = false;
        approvalRequestId = null;
        verificationPending = null;
        currentStepId = preflight[index + 1]?.step.id || null;
        continue;
      }

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
            runId: missionRunId,
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
            failureEvidence: missionStepFailureEvidence(error, entry, "read"),
            runId: missionRunId,
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
          runId: missionRunId,
          context,
        });
      }
      currentStepConfirmed = true;

      const normalizedPayload = scopedPayload(context, step.payload);
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
          periodId: context.periodId,
          partyId: text(context?.metadata?.partyId) || null,
          payload: normalizedPayload,
          actorId: identity.actorId,
          approvalRequestId,
        });
        if (!approval.allowed) {
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
              runId: missionRunId,
            });
          }
          const approvalAutoResumeRegistered = await registerApprovalDecisionWaits({
            context, steps: normalized.steps, completedIds, currentStepId: step.id,
            approvalRequest: approval.approvalRequest, runId: missionRunId,
          });
          const pausedMission = paused({
            preflight,
            steps: normalized.steps,
            completedIds,
            currentStepId: step.id,
            pauseReason: "approval",
            confirmed: true,
            approvalRequest: approval.approvalRequest,
            results,
            blocker: approval.reason || "APPROVAL_REQUIRED",
            runId: missionRunId,
            context,
          });
          return {
            ...pausedMission,
            approval_auto_resume_registered: approvalAutoResumeRegistered,
            authorization_effect: "NONE",
          };
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
          failureEvidence: missionStepFailureEvidence(error, entry, "action"),
          runId: missionRunId,
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
          runId: missionRunId,
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
        runId: missionRunId,
      }),
    };
  }

  return { manifest, execute };
}

export default createOperatorMissionCapability;
