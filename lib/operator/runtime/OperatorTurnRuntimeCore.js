import {
  execute as executeUbteCapability,
} from "@/lib/ubte/runtime/ExecutionEngine";
import {
  listOperatorCapabilities,
} from "./OperatorCapabilityCatalog";
import {
  listOperatorNavigationTargets,
  resolveInstantOperatorNavigation,
  resolveOperatorCurrentScreen,
} from "./OperatorNavigationCatalog";
import {
  reasonAboutOperatorTurn,
} from "./OperatorReasoningRuntime";
import {
  verifyOperatorExecution,
} from "./OperatorVerificationRuntime";
import {
  deterministicFinanceExecutionVerification,
} from "./OperatorDeterministicFinanceVerification.js";
import {
  isFastConversationTurn,
  runFastConversationTurn,
} from "./OperatorFastConversationRuntime";
import {
  recordOperatorExecutionAudit,
  resolveOperatorExecutionApproval,
} from "@/lib/operator/governance/operatorExecutionGovernance";
import {
  operatorIntelligenceMutationBindingProof,
} from "./OperatorIntelligenceExecutionGuardRuntime.js";
import {
  deterministicBusinessEffectProof,
} from "./OperatorDeterministicBusinessEffectRuntime.js";
import {
  agreementWithAutonomousRun,
  autonomousRunFromAgreementState,
  createOperatorAutonomousRun,
  createOperatorMissionRun,
  operatorAutonomousRunRequiresPendingExecutionBinding,
  operatorPendingExecutionMatchesAutonomousRun,
  transitionOperatorAutonomousRun,
} from "@/lib/operator/contracts/OperatorAutonomousRun";

const OPERATOR_MISSION_KEY = "platform.operator_mission.execute";

const ORGANIZATIONAL_CONTEXT_KEY = "platform.organizational_context.read";

function organizationalContextSnapshot(result) {
  const direct = object(result?.result);
  if (direct.organization || direct.legal_entity) return direct;
  const nested = object(direct.result);
  if (nested.organization || nested.legal_entity) return nested;
  return {};
}

export function organizationalContextResponseText(result) {
  const snapshot = organizationalContextSnapshot(result);
  const organization = object(snapshot.organization);
  const entity = object(snapshot.legal_entity);
  const industries = Array.isArray(snapshot.registered_industries)
    ? snapshot.registered_industries.map(text).filter(Boolean)
    : [];

  const organizationName = text(organization.name) || "Unknown organization";
  const organizationFacts = [
    text(organization.status),
    text(organization.organization_type),
    text(organization.industry),
  ].filter(Boolean);
  const entityName = text(entity.legal_name || entity.display_name);
  const entityFacts = [
    entity.is_active === true ? "active" : entity.id ? "inactive" : null,
    entity.is_default_accounting_entity === true ? "default accounting entity" : null,
    text(entity.country) ? `country ${text(entity.country)}` : null,
    text(entity.currency) ? `currency ${text(entity.currency)}` : null,
    text(entity.timezone) ? `timezone ${text(entity.timezone)}` : null,
  ].filter(Boolean);

  const parts = [
    `Current organization: ${organizationName}${organizationFacts.length ? ` (${organizationFacts.join(", ")})` : ""}.`,
  ];
  if (entityName) {
    parts.push(`Current legal entity: ${entityName}${entityFacts.length ? ` (${entityFacts.join(", ")})` : ""}.`);
  } else {
    parts.push("No selected legal-entity record was returned by the current scoped read.");
  }
  if (industries.length) parts.push(`Registered industries: ${industries.join(", ")}.`);
  parts.push("Verified from current registered organization and legal-entity data. No business data was changed.");
  return parts.join(" ");
}

function humanLabel(value) {
  return text(value)
    .replace(/[._-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function scalarDisplay(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : null;
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "string") return text(value).slice(0, 160) || null;
  return null;
}

export function normalizeRegistryReadEvidence(capability, executionResult) {
  const envelope = object(executionResult?.result);
  const label = humanLabel(capability?.capability || capability?.key || "records");
  if (!Object.keys(envelope).length) return null;

  const explicitError = text(envelope?.error || envelope?.reason);
  if (
    envelope?.ok === false ||
    envelope?.success === false ||
    envelope?.blocked === true ||
    ["failed", "blocked", "error", "unavailable", "rejected"].includes(text(envelope?.status).toLowerCase())
  ) {
    return { type: "blocker", label, message: explicitError || `${label} could not be read.` };
  }

  const rows = Array.isArray(envelope?.data)
    ? envelope.data
    : Array.isArray(envelope?.rows)
      ? envelope.rows
      : null;
  if (rows) {
    const count = Number.isFinite(Number(envelope?.count))
      ? Number(envelope.count)
      : Number.isFinite(Number(envelope?.total))
        ? Number(envelope.total)
        : rows.length;
    return { type: "record_list", label, rows, count };
  }

  if (Object.prototype.hasOwnProperty.call(envelope, "value") && scalarDisplay(envelope.value) !== null) {
    return {
      type: "metric",
      label,
      value: envelope.value,
      unit: text(envelope?.unit || envelope?.currency || envelope?.currency_code) || null,
    };
  }

  const state = text(envelope?.status || envelope?.state);
  if (state && Object.keys(envelope).length <= 12) {
    return { type: "state", label, state, data: envelope };
  }

  if (Object.keys(envelope).length) return { type: "record", label, data: envelope };
  return null;
}

function renderRecordLine(row, index) {
  const source = object(row);
  const preferred = [
    "invoice_number", "number", "reference", "code", "name", "title",
    "status", "state", "date", "invoice_date", "due_date", "start_at", "end_at",
    "currency_code", "currency", "total_amount", "total", "amount", "count",
    "assignee_name", "assigned_to", "owner_name", "priority",
  ];
  const parts = [];
  for (const key of preferred) {
    if (!Object.prototype.hasOwnProperty.call(source, key)) continue;
    const displayed = scalarDisplay(source[key]);
    if (displayed) parts.push(`${humanLabel(key)}: ${displayed}`);
    if (parts.length >= 5) break;
  }
  if (!parts.length) {
    for (const [key, value] of Object.entries(source)) {
      if (["id", "organization_id", "entity_id", "created_by", "updated_by"].includes(key)) continue;
      const displayed = scalarDisplay(value);
      if (displayed) parts.push(`${humanLabel(key)}: ${displayed}`);
      if (parts.length >= 4) break;
    }
  }
  return `${index + 1}. ${parts.join(" · ") || "Record returned"}`;
}

export function registryRecordReadResponseText(capability, executionResult) {
  const evidence = normalizeRegistryReadEvidence(capability, executionResult);
  if (!evidence) return null;

  if (evidence.type === "blocker") return evidence.message;
  if (evidence.type === "record_list") {
    if (!evidence.rows.length || evidence.count === 0) {
      return `No ${evidence.label.toLowerCase()} were found for the current business context.`;
    }
    const lines = evidence.rows.slice(0, 8).map(renderRecordLine);
    const suffix = evidence.count > lines.length ? `\nShowing ${lines.length} of ${evidence.count} records.` : "";
    return `${evidence.label}: ${evidence.count} current record${evidence.count === 1 ? "" : "s"}.\n${lines.join("\n")}${suffix}`;
  }
  if (evidence.type === "metric") {
    return `${evidence.label}: ${scalarDisplay(evidence.value)}${evidence.unit ? ` ${evidence.unit}` : ""}.`;
  }
  if (evidence.type === "state") {
    return `${evidence.label}: ${humanLabel(evidence.state)}.`;
  }

  const parts = Object.entries(object(evidence.data))
    .filter(([key]) => !["authorization", "capability", "source", "rows_key"].includes(key))
    .map(([key, value]) => [humanLabel(key), scalarDisplay(value)])
    .filter(([, value]) => value)
    .slice(0, 10)
    .map(([key, value]) => `${key}: ${value}`);
  return parts.length ? `${evidence.label}:\n${parts.join("\n")}` : `${evidence.label} was read successfully.`;
}

const FULL_ACCESS_ROLES = new Set([
  "OWNER",
  "ORGANIZATION_OWNER",
  "ORG_OWNER",
  "PLATFORM_OWNER",
  "SUPER_ADMIN",
]);
const TERMINAL_AUTONOMOUS_RUN_STATUSES = new Set([
  "completed",
  "cancelled",
  "superseded",
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
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function normalizePermission(value) {
  return text(value).toLowerCase();
}

function grantedPermission(permissions = [], required) {
  const needed = normalizePermission(required);
  return (Array.isArray(permissions) ? permissions : []).some((value) => {
    const actual = normalizePermission(value);
    if (!actual || !needed) return false;
    if (actual === "*" || actual === needed) return true;
    return actual.endsWith(".*") && needed.startsWith(actual.slice(0, -1));
  });
}

function automaticProductReleaseAllowed(permissions = []) {
  return (
    grantedPermission(permissions, "platform.code.ai.commit") &&
    grantedPermission(permissions, "platform.deploy.production")
  );
}

function normalizeRole(value) {
  return text(value).toUpperCase();
}

function normalizedUtterance(value) {
  return text(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\u0e00-\u0e7f\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isAffirmative(value) {
  const message = normalizedUtterance(value);
  return [
    "yes",
    "yeah",
    "yep",
    "ok",
    "okay",
    "sure",
    "confirm",
    "confirmed",
    "proceed",
    "do it",
    "go ahead",
    "ja",
    "oui",
    "si",
    "ตกลง",
    "ใช่",
    "ยืนยัน",
  ].includes(message);
}

function isNegative(value) {
  const message = normalizedUtterance(value);
  return [
    "no",
    "nope",
    "cancel",
    "stop",
    "dont",
    "do not",
    "nein",
    "nej",
    "non",
    "ไม่",
    "ยกเลิก",
  ].includes(message);
}

function isAutonomousRunStatusQuery(value) {
  const message = normalizedUtterance(value);
  return [
    "status",
    "what is the status",
    "whats the status",
    "what is happening",
    "whats happening",
    "what happened",
    "where are we",
    "where did we stop",
    "what are we waiting for",
    "what are you waiting for",
    "why are we blocked",
    "why is it blocked",
    "are we done",
    "is it done",
    "vad ar statusen",
    "var ar vi",
    "var slutade vi",
    "vad vantar vi pa",
    "wie ist der status",
    "wo stehen wir",
    "wo haben wir aufgehort",
    "worauf warten wir",
    "quel est le statut",
    "ou en sommes nous",
    "ou nous sommes nous arretes",
    "qu attendons nous",
    "cual es el estado",
    "donde estamos",
    "donde nos quedamos",
    "que estamos esperando",
    "สถานะเป็นอย่างไร",
    "ตอนนี้เราอยู่ตรงไหน",
    "เราหยุดตรงไหน",
    "เรากำลังรออะไร",
  ].includes(message);
}

function isAutonomousRunResumeRequest(value) {
  const message = normalizedUtterance(value);
  return [
    "continue",
    "resume",
    "continue run",
    "continue the run",
    "resume run",
    "resume the run",
    "carry on",
    "keep going",
    "go on",
    "continue where we left off",
    "resume where we left off",
    "continue from where we stopped",
    "resume from where we stopped",
  ].includes(message);
}

function hasContinuableProjectGoal(projectState = {}) {
  const objective = text(projectState?.objective);
  const status = text(projectState?.status).toLowerCase();

  return Boolean(objective) && !["idle", "completed", "cancelled"].includes(status);
}

function shouldContinueProjectInsteadOfTerminalRun({
  run,
  projectState,
  message,
}) {
  if (!run || !isAutonomousRunResumeRequest(message)) return false;
  if (!hasContinuableProjectGoal(projectState)) return false;

  return TERMINAL_AUTONOMOUS_RUN_STATUSES.has(
    text(run?.status).toLowerCase(),
  );
}

function missionRunRequiresPendingExecutionBinding(run) {
  return Boolean(
    text(run?.run_id) &&
      text(run?.run_kind).toLowerCase() === "mission" &&
      ["awaiting_confirmation", "awaiting_approval", "verifying"].includes(
        text(run?.status).toLowerCase(),
      ),
  );
}

function runHasExactPendingBinding(run, agreementState = {}) {
  const pending = pendingAction(agreementState);
  if (missionRunRequiresPendingExecutionBinding(run)) {
    return Boolean(pending && missionResumeProjectionMatches(pending, run));
  }
  if (!operatorAutonomousRunRequiresPendingExecutionBinding(run)) return true;
  return Boolean(
    pending && operatorPendingExecutionMatchesAutonomousRun(pending, run),
  );
}

function hasStoredPendingExecution(agreementState = {}) {
  return Object.prototype.hasOwnProperty.call(
    object(agreementState),
    "pending_execution",
  );
}

function autonomousRunStatusText(run) {
  const status = text(run?.status).toLowerCase();
  const blocker = text(run?.blocker);
  const steps = Array.isArray(run?.planned_steps) ? run.planned_steps : [];
  const currentStep = steps.find((step) => step.id === run?.current_step_id);
  const currentDescription = text(currentStep?.description);
  const hasEvidenceReads = steps.some(
    (step) => text(step?.kind).toLowerCase() === "read",
  );
  const mission = text(run?.run_kind).toLowerCase() === "mission";

  if (status === "awaiting_confirmation") {
    if (mission) {
      return currentDescription
        ? `The mission is paused at ${currentDescription}. That exact step requires your confirmation before I continue.`
        : "The mission is paused at a confirmation gate.";
    }
    return hasEvidenceReads
      ? "The evidence checks are complete. The requested action is ready and still waiting for your confirmation."
      : "The requested action is ready and still waiting for your confirmation.";
  }
  if (status === "awaiting_approval") {
    return mission
      ? "The mission is paused at its exact approval-gated step. I still have the remaining steps and will recheck the same approval request before continuing."
      : "The action is confirmed but paused for approval. I still have the exact pending action and approval request and will recheck that same approval before executing it.";
  }
  if (status === "executing") {
    return currentDescription
      ? `The run is executing: ${currentDescription}.`
      : "The confirmed action is executing.";
  }
  if (status === "verifying") {
    return mission
      ? currentDescription
        ? `The mission action ran and is paused on verification at: ${currentDescription}. I will retry only the verification, not the write.`
        : "The mission is paused on post-action verification. I will not replay the write."
      : currentDescription
        ? `The action completed and I am verifying the business result: ${currentDescription}.`
        : "The action completed and I am verifying the business result.";
  }
  if (status === "blocked") {
    return blocker
      ? `The run is blocked at the current step: ${blocker}.`
      : "The run is blocked at the current step and has not been marked complete.";
  }
  if (status === "completed") {
    return mission
      ? "This mission is complete. Every planned step finished, and every write step passed its registered verification read before the mission advanced."
      : "This run is complete. All planned steps that were required for completion finished successfully.";
  }
  if (status === "cancelled") {
    return "This run was cancelled and no pending action remains.";
  }
  if (status === "superseded") {
    return "This run was superseded by a newer request and will not resume automatically.";
  }
  return currentDescription
    ? `The run is active at: ${currentDescription}.`
    : "The run is active.";
}

function runStatusTurn({
  run,
  agreementState,
  projectState,
  locale,
  currentScreen = null,
}) {
  const orphaned = !runHasExactPendingBinding(run, agreementState);
  const orphanedMission = Boolean(
    orphaned && missionRunRequiresPendingExecutionBinding(run),
  );
  const stalePendingCleared = Boolean(
    orphaned && hasStoredPendingExecution(agreementState),
  );
  const nextAgreementState = stalePendingCleared
    ? clearedAgreementState(agreementState)
    : agreementState;
  return {
    success: true,
    decision: {
      response_text: orphaned
        ? orphanedMission
          ? "This mission run is preserved as history, but its exact resumable mission projection is no longer safely bound to it. It is not resumable from shorthand, confirmation, or continue. Please restate the mission or exact next action if you still want it."
          : "This autonomous run is preserved as history, but its exact pending execution is no longer safely bound to it. It is not resumable from shorthand or confirmation. Please restate the exact action if you still want it."
        : autonomousRunStatusText(run),
      response_language: locale || null,
      intent: orphaned ? "clarify" : "answer",
      confidence: 1,
      agreement_state: nextAgreementState,
      project_state: projectState,
      clarification: orphaned
        ? {
            required: true,
            question: orphanedMission
              ? "Please restate the mission or exact next action you want me to take."
              : "Please restate the exact action you want me to take.",
            options: [],
          }
        : { required: false, question: null, options: [] },
      navigation: { target_id: null },
      execution: { capability_key: null, payload: {}, reason: null },
      plan: [],
    },
    agreement_state: nextAgreementState,
    current_screen: currentScreen,
    provider_evidence: {
      provider: "avantiqo-local",
      model: "autonomous-run-status-v1",
      usage_id: null,
    },
    navigation: null,
    execution: null,
    operator_catalog: {
      navigation_target_count: 0,
      executable_capability_count: 0,
      bypassed_for_run_status: true,
      orphaned_pending_bound_run: orphaned,
      orphaned_mission_run: orphanedMission,
      stale_pending_cleared: stalePendingCleared,
      execution_authorized: false,
    },
  };
}

function runResumeTurn({
  run,
  agreementState,
  projectState,
  locale,
}) {
  const orphaned = !runHasExactPendingBinding(run, agreementState);
  const orphanedMission = Boolean(
    orphaned && missionRunRequiresPendingExecutionBinding(run),
  );
  if (orphaned) {
    const stalePendingCleared = hasStoredPendingExecution(agreementState);
    const nextAgreementState = stalePendingCleared
      ? clearedAgreementState(agreementState)
      : agreementState;
    return {
      success: true,
      decision: {
        response_text: orphanedMission
          ? "I cannot resume that preserved mission because its exact resumable mission projection is no longer safely bound to it. I will not reconstruct, guess, or replay the old mission. Please restate the mission or exact next action you want now."
          : "I cannot resume that preserved run because its exact pending execution is no longer safely bound to it. I will not reconstruct or guess the old payload. Please restate the exact action you want now.",
        response_language: locale || null,
        intent: "clarify",
        confidence: 1,
        agreement_state: nextAgreementState,
        project_state: projectState,
        clarification: {
          required: true,
          question: orphanedMission
            ? "Please restate the mission or exact next action you want me to take."
            : "Please restate the exact action you want me to take.",
          options: [],
        },
        navigation: { target_id: null },
        execution: { capability_key: null, payload: {}, reason: null },
        plan: run?.planned_steps || [],
      },
      agreement_state: nextAgreementState,
      current_screen: null,
      provider_evidence: {
        provider: "avantiqo-local",
        model: "autonomous-run-resume-v1",
        usage_id: null,
      },
      navigation: null,
      execution: null,
      operator_catalog: {
        navigation_target_count: 0,
        executable_capability_count: 0,
        bypassed_for_run_resume: true,
        orphaned_pending_bound_run: true,
        orphaned_mission_run: orphanedMission,
        stale_pending_cleared: stalePendingCleared,
        execution_authorized: false,
      },
    };
  }

  const status = text(run?.status).toLowerCase();
  const steps = Array.isArray(run?.planned_steps) ? run.planned_steps : [];
  const currentStep = steps.find((step) => step.id === run?.current_step_id);
  const currentDescription = text(currentStep?.description);
  const mission = text(run?.run_kind).toLowerCase() === "mission";
  let responseText;
  let clarification = { required: false, question: null, options: [] };
  let intent = "answer";

  if (status === "awaiting_confirmation") {
    responseText = currentDescription
      ? `I can continue from ${currentDescription}, but that action still requires your explicit confirmation. Say yes or proceed if you want me to execute it.`
      : "I can continue, but the pending action still requires your explicit confirmation. Say yes or proceed if you want me to execute it.";
    clarification = {
      required: true,
      question: "Should I proceed with that exact action?",
      options: [
        { id: "confirm", label: "Yes, proceed" },
        { id: "cancel", label: "No, cancel" },
      ],
    };
    intent = "plan";
  } else if (status === "completed") {
    responseText = "That run is already complete, so there is no unfinished step to resume.";
  } else if (status === "cancelled") {
    responseText = "That run was cancelled. I will not revive its old action automatically.";
  } else if (status === "superseded") {
    responseText = "That run was superseded by a newer request. I will not revive its old action automatically.";
  } else if (status === "blocked") {
    responseText = currentDescription
      ? `The run is blocked at ${currentDescription}, but there is no safe resumable operation stored for that stop gate.`
      : "The run is blocked, but there is no safe resumable operation stored for that stop gate.";
  } else if (status === "awaiting_approval") {
    responseText = mission
      ? "The mission is waiting for its exact stored approval request. Say continue after it is approved and I will resume from that exact step."
      : "The run is waiting for its exact stored approval request. I will recheck that request before executing the pending action.";
  } else if (status === "verifying" && mission) {
    responseText = "The mission write already ran, but its verification did not complete. Say continue and I will retry only the registered verification read, not the write.";
  } else {
    responseText = autonomousRunStatusText(run);
  }

  return {
    success: true,
    decision: {
      response_text: responseText,
      response_language: locale || null,
      intent,
      confidence: 1,
      agreement_state: agreementState,
      project_state: projectState,
      clarification,
      navigation: { target_id: null },
      execution: { capability_key: null, payload: {}, reason: null },
      plan: [],
    },
    agreement_state: agreementState,
    current_screen: null,
    provider_evidence: {
      provider: "avantiqo-local",
      model: "autonomous-run-resume-v1",
      usage_id: null,
    },
    navigation: null,
    execution: null,
    operator_catalog: {
      navigation_target_count: 0,
      executable_capability_count: 0,
      bypassed_for_run_resume: true,
    },
  };
}

function permissionMatches(granted, required) {
  const actual = normalizePermission(granted);
  const needed = normalizePermission(required);
  if (!actual || !needed) return false;
  if (actual === "*" || actual === needed) return true;
  if (actual.endsWith(".*")) {
    return needed.startsWith(actual.slice(0, -1));
  }
  return false;
}

function canUseCapability(capability, permissions = [], role = null) {
  if (FULL_ACCESS_ROLES.has(normalizeRole(role))) return true;

  const required = Array.isArray(capability?.permissions)
    ? capability.permissions.filter(Boolean)
    : [];

  if (!required.length) {
    return capability?.mode === "read";
  }

  return required.every((permission) =>
    permissions.some((granted) => permissionMatches(granted, permission)),
  );
}

function safeCapabilities(capabilities, permissions, role) {
  return capabilities.filter((capability) =>
    canUseCapability(capability, permissions, role),
  );
}

function executionBlockedReason(capability, { source = "text", confirmed = false } = {}) {
  if (!capability) return "CAPABILITY_NOT_AVAILABLE";

  const voice = text(source).toLowerCase() === "voice";
  if (voice && capability.mode !== "read" && !confirmed) {
    return "VOICE_CONFIRMATION_REQUIRED";
  }

  if (capability.requires_confirmation && !confirmed) {
    return "CONFIRMATION_REQUIRED";
  }

  if (!capability.auto_execute && !confirmed) {
    return "AUTOMATIC_EXECUTION_NOT_ENABLED";
  }

  return null;
}

function normalizedExecutionPayload({
  payload,
  organizationId,
  entityId,
  periodId,
  partyId,
}) {
  return {
    ...(payload && typeof payload === "object" ? payload : {}),
    organizationId,
    organization_id: organizationId,
    entityId,
    entity_id: entityId,
    periodId,
    period_id: periodId,
    partyId,
    party_id: partyId,
  };
}

function governanceBlockText(reason) {
  if (reason === "APPROVAL_WORKFLOW_NOT_CONFIGURED") {
    return "That action needs approval before I can run it, but no approval workflow is configured for it yet. Someone with governance access needs to set one up first.";
  }
  if (reason === "APPROVAL_REQUEST_FAILED") {
    return "I could not raise an approval request for that action, so I have not run it.";
  }
  if (reason === "APPROVAL_REJECTED") {
    return "The exact approval request for that action was rejected, so I have not run it.";
  }
  if (reason === "APPROVAL_REQUEST_NOT_FOUND") {
    return "I could not find the exact approval request linked to this pending action, so I will not run it or create a replacement automatically.";
  }
  if (reason === "APPROVAL_REQUEST_MISMATCH") {
    return "The stored approval request does not match this exact action scope, so I will not run the action.";
  }
  if (reason === "APPROVAL_REQUEST_LOOKUP_FAILED") {
    return "I could not safely verify the stored approval request, so the action remains blocked.";
  }
  return "That action requires approval before I can run it. I have raised an approval request and left it pending.";
}

function normalizedPendingVerificationRead(value) {
  const candidate = object(value);
  const capabilityKey = text(candidate.capability_key);
  if (!capabilityKey) return null;

  return {
    capability_key: capabilityKey,
    description:
      text(candidate.description) || "Verify the action took effect",
    payload: object(candidate.payload),
  };
}

function pendingAction(agreementState = {}) {
  const candidate = agreementState?.pending_execution;
  if (!candidate || typeof candidate !== "object") return null;

  const capabilityKey = text(candidate.capability_key);
  if (!capabilityKey) return null;
  const hasRunId = Object.prototype.hasOwnProperty.call(candidate, "run_id");

  return {
    capability_key: capabilityKey,
    ...(hasRunId ? { run_id: text(candidate.run_id) || null } : {}),
    payload:
      candidate.payload && typeof candidate.payload === "object"
        ? candidate.payload
        : {},
    reason: text(candidate.reason) || null,
    original_message: text(candidate.original_message).slice(0, 4000) || null,
    resume_kind: text(candidate.resume_kind).toLowerCase() || null,
    approval_request_id: text(candidate.approval_request_id) || null,
    verify_after: normalizedPendingVerificationRead(candidate.verify_after),
  };
}

function canonicalMissionValue(value) {
  if (Array.isArray(value)) return value.map(canonicalMissionValue);
  if (value === null || value === undefined) return value ?? null;
  if (typeof value !== "object") return value;

  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .filter(
        (key) =>
          value[key] !== undefined && typeof value[key] !== "function",
      )
      .map((key) => [key, canonicalMissionValue(value[key])]),
  );
}

function sameMissionValue(left, right) {
  return (
    JSON.stringify(canonicalMissionValue(left)) ===
    JSON.stringify(canonicalMissionValue(right))
  );
}

function missionVerificationProjection(value) {
  const candidate = object(value);
  const capabilityKey = text(candidate.capability_key);
  if (!capabilityKey) return null;

  return {
    capability_key: capabilityKey,
    description: text(candidate.description || candidate.label),
    payload: canonicalMissionValue(object(candidate.payload)),
  };
}

function missionStepProjection(value) {
  const candidate = object(value);
  return {
    id: text(candidate.id),
    description: text(candidate.description || candidate.label),
    capability_key: text(candidate.capability_key),
    payload: canonicalMissionValue(object(candidate.payload)),
    verify_after: missionVerificationProjection(candidate.verify_after),
  };
}

function missionResumeProjectionMatches(pending, run) {
  if (
    text(pending?.resume_kind).toLowerCase() !== "mission" ||
    text(pending?.capability_key) !== OPERATOR_MISSION_KEY ||
    text(run?.run_kind).toLowerCase() !== "mission"
  ) {
    return false;
  }

  const runStatus = text(run?.status).toLowerCase();
  if (
    !["awaiting_confirmation", "awaiting_approval", "verifying"].includes(
      runStatus,
    )
  ) {
    return false;
  }

  const payload = object(pending?.payload);
  const resume = object(payload.resume);
  const pendingSteps = Array.isArray(payload.steps)
    ? payload.steps.map(missionStepProjection)
    : [];
  const runSteps = Array.isArray(run?.planned_steps)
    ? run.planned_steps.map(missionStepProjection)
    : [];

  if (
    pendingSteps.length < 2 ||
    pendingSteps.length !== runSteps.length ||
    !sameMissionValue(pendingSteps, runSteps)
  ) {
    return false;
  }

  const currentStepId = text(resume.current_step_id);
  if (!currentStepId || currentStepId !== text(run?.current_step_id)) {
    return false;
  }

  const resumeCompleted = (Array.isArray(resume.completed_step_ids)
    ? resume.completed_step_ids
    : []
  )
    .map(text)
    .filter(Boolean);
  const runCompleted = (Array.isArray(run?.completed_steps)
    ? run.completed_steps
    : []
  )
    .map(text)
    .filter(Boolean);
  if (!sameMissionValue(resumeCompleted, runCompleted)) return false;

  const currentRunStep = Array.isArray(run?.planned_steps)
    ? run.planned_steps.find((step) => text(step?.id) === currentStepId)
    : null;
  if (!currentRunStep) return false;

  const approvalRequestId = text(resume.approval_request_id);
  if (approvalRequestId !== text(currentRunStep.approval_request_id)) {
    return false;
  }

  const confirmed = resume.current_step_confirmed === true;
  const verification = object(resume.verification_pending);
  const verificationStepId = text(verification.step_id);

  if (runStatus === "awaiting_confirmation") {
    return (
      !confirmed &&
      !approvalRequestId &&
      !verificationStepId &&
      text(currentRunStep.status).toLowerCase() === "awaiting_confirmation" &&
      text(currentRunStep.gate).toLowerCase() === "confirmation"
    );
  }

  if (runStatus === "awaiting_approval") {
    return (
      confirmed &&
      !verificationStepId &&
      text(currentRunStep.status).toLowerCase() === "awaiting_approval" &&
      text(currentRunStep.gate).toLowerCase() === "approval"
    );
  }

  const registeredVerification = missionVerificationProjection(
    currentRunStep.verify_after,
  );
  const pendingVerification = missionVerificationProjection(verification);
  return (
    confirmed &&
    !approvalRequestId &&
    verificationStepId === currentStepId &&
    text(currentRunStep.status).toLowerCase() === "verifying" &&
    Boolean(registeredVerification) &&
    sameMissionValue(pendingVerification, registeredVerification)
  );
}

function clearedAgreementState(agreementState = {}) {
  const next = {
    ...(agreementState && typeof agreementState === "object"
      ? agreementState
      : {}),
  };
  delete next.pending_execution;
  return next;
}

function pendingRunStateMismatchTurn({
  agreementState,
  projectState,
  locale,
  run,
}) {
  const blocker = "OPERATOR_PENDING_EXECUTION_RUN_STATE_MISMATCH";
  const nextAgreementState = clearedAgreementState(agreementState);

  return {
    success: true,
    decision: {
      response_text:
        "I will not act on that shorthand reply because the stored pending action no longer matches the exact autonomous run that created it. I cleared only the stale pending action and preserved the run unchanged.",
      response_language: locale || null,
      intent: "clarify",
      confidence: 1,
      agreement_state: nextAgreementState,
      project_state: projectState,
      clarification: {
        required: true,
        question: "Please restate the exact action you want me to take.",
        options: [],
      },
      navigation: { target_id: null },
      execution: {
        capability_key: null,
        payload: {},
        reason: blocker,
      },
      plan: run?.planned_steps || [],
    },
    agreement_state: nextAgreementState,
    current_screen: null,
    provider_evidence: null,
    navigation: null,
    execution: {
      status: "blocked",
      reason: blocker,
      capability_key: null,
      run_preserved: Boolean(run),
    },
    operator_catalog: {
      navigation_target_count: 0,
      executable_capability_count: 0,
      pending_run_binding_mismatch: true,
      stale_pending_cleared: true,
      autonomous_run_preserved: Boolean(run),
      execution_authorized: false,
    },
  };
}

function agreementWithRunTransition(agreementState, transition) {
  const run = autonomousRunFromAgreementState(agreementState);
  if (!run) return object(agreementState);
  return agreementWithAutonomousRun(
    agreementState,
    transitionOperatorAutonomousRun(run, transition),
  );
}

function agreementWithApprovalRequest(agreementState, approvalRequest) {
  const approvalRequestId = text(approvalRequest?.id);
  const pending = object(agreementState?.pending_execution);
  if (!approvalRequestId || !text(pending.capability_key)) {
    return object(agreementState);
  }

  return {
    ...object(agreementState),
    pending_execution: {
      ...pending,
      approval_request_id: approvalRequestId,
    },
  };
}

function approvalRunTransition(agreementState, governance) {
  const terminalFailure = TERMINAL_APPROVAL_FAILURE_REASONS.has(
    text(governance?.reason),
  );
  return agreementWithRunTransition(agreementState, {
    status: terminalFailure ? "blocked" : "awaiting_approval",
    currentStepId: "requested_action",
    stepId: "requested_action",
    stepStatus: terminalFailure ? "failed" : "awaiting_approval",
    blocker: governance?.reason || "APPROVAL_REQUIRED",
    approvalRequestId: text(governance?.approvalRequest?.id) || null,
  });
}

function isMissionExecutionResult(capability, result) {
  return (
    text(capability?.key) === OPERATOR_MISSION_KEY &&
    text(result?.mission_mode) === "durable_registered_sequence"
  );
}

function missionPauseText(result, currentStep) {
  const completed = Number(result?.completed_steps || 0);
  const total = Number(result?.total_steps || 0);
  const step = text(currentStep?.description || currentStep?.label);
  const prefix = `${completed} of ${total} mission steps are complete.`;

  if (result?.pause_reason === "confirmation") {
    return step
      ? `${prefix} The next exact step is ${step}, and it requires your confirmation. Should I proceed?`
      : `${prefix} The next step requires your confirmation. Should I proceed?`;
  }
  if (result?.pause_reason === "approval") {
    return step
      ? `${prefix} I paused at ${step} because its exact approval request must be approved before I continue.`
      : `${prefix} I paused at an approval gate and preserved the exact remaining mission.`;
  }
  if (result?.pause_reason === "verification") {
    return step
      ? `${prefix} The action at ${step} already ran, but its registered verification did not complete. I preserved the exact mission state and will retry only the verification on continue.`
      : `${prefix} A write already ran, but verification did not complete. I will not replay the write.`;
  }
  return `${prefix} The mission is paused and its exact remaining state is preserved.`;
}

function missionResultAgreementState({
  agreementState,
  result,
  originalMessage,
  objective,
}) {
  const existingRun = autonomousRunFromAgreementState(agreementState);
  const continuingMission =
    text(agreementState?.pending_execution?.resume_kind) === "mission" &&
    text(existingRun?.run_kind) === "mission";
  const hasMissionState =
    result?.mission_state && typeof result.mission_state === "object";

  if (!hasMissionState) {
    let next = clearedAgreementState(agreementState);
    if (continuingMission && existingRun) {
      const currentStepId = text(existingRun?.current_step_id) || null;
      next = agreementWithRunTransition(next, {
        status: "blocked",
        currentStepId,
        stepId: currentStepId,
        stepStatus: "failed",
        blocker:
          text(result?.reason) || "OPERATOR_MISSION_BLOCKED_BEFORE_STATE",
      });
    }
    return next;
  }

  const state = object(result.mission_state);
  const run = createOperatorMissionRun({
    objective:
      text(objective) || text(originalMessage) || "Complete the requested mission",
    missionState: continuingMission
      ? {
          ...state,
          run_id: existingRun.run_id,
          created_at: existingRun.created_at,
        }
      : state,
  });
  let next = agreementWithAutonomousRun(clearedAgreementState(agreementState), run);

  if (text(result?.status) === "paused" && result?.resume_payload) {
    next = {
      ...next,
      pending_execution: {
        capability_key: OPERATOR_MISSION_KEY,
        payload: object(result.resume_payload),
        reason:
          text(result?.reason) ||
          `Resume mission from ${text(result?.current_step_id) || "the stored step"}`,
        original_message: text(originalMessage).slice(0, 4000) || null,
        resume_kind: "mission",
      },
    };
  }

  return next;
}

function missionResultTurn({
  result,
  capability,
  agreementState,
  projectState,
  locale,
  currentScreen,
  navigationTargetCount,
  executableCapabilityCount,
  originalMessage,
  objective,
  resumedRun = false,
}) {
  const nextAgreementState = missionResultAgreementState({
    agreementState,
    result,
    originalMessage,
    objective,
  });
  const run = autonomousRunFromAgreementState(nextAgreementState);
  const currentStep = run?.planned_steps?.find(
    (step) => step.id === run?.current_step_id,
  );
  const paused = text(result?.status) === "paused";
  const blocked = text(result?.status) === "blocked";
  const confirmation = paused && result?.pause_reason === "confirmation";
  const responseText = paused
    ? missionPauseText(result, currentStep)
    : blocked
      ? `The mission is blocked at ${text(currentStep?.description) || "the current step"}: ${text(result?.reason) || "the step could not complete safely"}. I did not replan or skip it.`
      : `Mission complete. ${Number(result?.completed_steps || 0)} of ${Number(result?.total_steps || 0)} steps finished, and every write step passed its registered verification before I advanced.`;

  return {
    success: true,
    decision: {
      response_text: responseText,
      response_language: locale || null,
      intent: confirmation ? "plan" : "answer",
      confidence: 1,
      agreement_state: nextAgreementState,
      project_state: projectState,
      clarification: confirmation
        ? {
            required: true,
            question: "Should I proceed with that exact mission step?",
            options: [
              { id: "confirm", label: "Yes, proceed" },
              { id: "cancel", label: "No, cancel" },
            ],
          }
        : { required: false, question: null, options: [] },
      navigation: { target_id: null },
      execution: {
        capability_key: OPERATOR_MISSION_KEY,
        payload: paused ? object(result?.resume_payload) : {},
        reason: text(result?.reason) || null,
      },
      plan: run?.planned_steps || [],
    },
    agreement_state: nextAgreementState,
    current_screen: currentScreen,
    provider_evidence: null,
    navigation: null,
    execution: {
      status: paused ? "paused" : blocked ? "blocked" : "completed",
      resumed_run: resumedRun,
      capability: {
        key: capability.key,
        domain: capability.domain,
        capability: capability.capability,
        action: capability.action,
        mode: capability.mode,
      },
      result,
    },
    operator_catalog: {
      navigation_target_count: navigationTargetCount,
      executable_capability_count: executableCapabilityCount,
    },
  };
}

function clearPendingAndSupersedeRun(agreementState, shouldSupersede) {
  const run = autonomousRunFromAgreementState(agreementState);
  const orphanedPendingBoundRun = Boolean(
    run &&
      operatorAutonomousRunRequiresPendingExecutionBinding(run) &&
      !runHasExactPendingBinding(run, agreementState),
  );
  const orphanedMissionRun = Boolean(
    run &&
      missionRunRequiresPendingExecutionBinding(run) &&
      !runHasExactPendingBinding(run, agreementState),
  );
  const orphanedRun = orphanedPendingBoundRun || orphanedMissionRun;
  const cleared = clearedAgreementState(agreementState);
  if (!shouldSupersede && !orphanedRun) return cleared;
  return agreementWithRunTransition(cleared, {
    status: "superseded",
    stepId: "requested_action",
    stepStatus: "superseded",
    blocker: orphanedMissionRun
      ? "Orphaned mission run superseded by a new user request"
      : orphanedPendingBoundRun
        ? "Orphaned pending-bound run superseded by a new user request"
        : "Pending action superseded by a new user request",
  });
}

function agreementWithPendingConfirmationRun({
  agreementState,
  capability,
  payload,
  reason,
  originalMessage,
  objective,
  approvalRequestId = null,
}) {
  const run = createOperatorAutonomousRun({
    objective:
      text(objective) ||
      text(originalMessage) ||
      "Complete the requested business action",
    pendingExecution: {
      capability_key: capability.key,
      description:
        text(reason) ||
        text(capability.description) ||
        "Run the requested business action",
      payload: object(payload),
    },
  });
  const pendingExecution = {
    capability_key: capability.key,
    run_id: run.run_id,
    payload: object(payload),
    reason: text(reason) || null,
    original_message: text(originalMessage).slice(0, 4000) || null,
    ...(text(approvalRequestId)
      ? { approval_request_id: text(approvalRequestId) }
      : {}),
  };
  const withPending = {
    ...object(agreementState),
    pending_execution: pendingExecution,
  };

  return agreementWithAutonomousRun(withPending, run);
}

function pendingVerificationExecution(
  verificationRead,
  originalMessage = null,
  runId = null,
) {
  const candidate = normalizedPendingVerificationRead(verificationRead);
  if (!candidate) return null;

  return {
    capability_key: candidate.capability_key,
    ...(text(runId) ? { run_id: text(runId) } : {}),
    payload: candidate.payload,
    reason: `Retry post-action verification: ${candidate.description}`,
    original_message: text(originalMessage).slice(0, 4000) || null,
    resume_kind: "verification",
  };
}

function completedAgreementState(agreementState, pending, postActionVerification) {
  let next = clearedAgreementState(agreementState);
  next = agreementWithRunTransition(next, {
    status: pending?.verify_after ? "verifying" : "completed",
    currentStepId: pending?.verify_after ? "post_action_verification" : null,
    stepId: "requested_action",
    stepStatus: "completed",
    blocker: null,
  });

  if (!pending?.verify_after) return next;

  if (text(postActionVerification?.status).toLowerCase() === "completed") {
    return agreementWithRunTransition(next, {
      status: "completed",
      currentStepId: null,
      stepId: "post_action_verification",
      stepStatus: "completed",
      blocker: null,
    });
  }

  const verificationRun = autonomousRunFromAgreementState(next);
  const verificationPending = pendingVerificationExecution(
    pending.verify_after,
    pending.original_message,
    verificationRun?.run_id,
  );
  if (verificationPending) {
    next = {
      ...next,
      pending_execution: verificationPending,
    };
  }

  return agreementWithRunTransition(next, {
    status: "blocked",
    currentStepId: "post_action_verification",
    stepId: "post_action_verification",
    stepStatus: "failed",
    blocker:
      text(
        postActionVerification?.reason ||
          postActionVerification?.error,
      ) || "Post-action verification did not complete",
  });
}

async function executeCapability({
  capability,
  payload,
  organizationId,
  entityId,
  periodId,
  partyId,
  actor,
  permissions,
  source,
  callerRequest,
  approvalRequestId = null,
  runtimeMetadata = {},
}) {
  const normalizedPayload = normalizedExecutionPayload({
    payload,
    organizationId,
    entityId,
    periodId,
    partyId,
  });

  const actorId = text(actor?.id || actor?.user_id) || null;
  const actorName = text(actor?.name || actor?.email) || null;

  const approval = await resolveOperatorExecutionApproval({
    capability,
    organizationId,
    entityId,
    periodId,
    partyId,
    payload: normalizedPayload,
    actorId,
    approvalRequestId,
  });

  if (!approval.allowed) {
    await recordOperatorExecutionAudit({
      capability,
      organizationId,
      entityId,
      actorId,
      actorName,
      payload: normalizedPayload,
      source,
      outcome: "blocked",
      approval,
    });

    const blocked = new Error(approval.reason);
    blocked.operatorGovernance = approval;
    throw blocked;
  }

  try {
    const result = await executeUbteCapability({
      organizationId,
      domain: capability.domain,
      capability: capability.capability,
      action: capability.action,
      payload: normalizedPayload,
      actor,
      runtime: {
        entityId,
        periodId,
        permissions,
        callerRequest,
        metadata: {
          source: "AVANTIQO_OPERATOR",
          channel: text(source) || "text",
          partyId,
          operatorCapabilityKey: capability.key,
          conversationallyConfirmed: true,
          ...object(runtimeMetadata),
        },
      },
    });

    await recordOperatorExecutionAudit({
      capability,
      organizationId,
      entityId,
      actorId,
      actorName,
      payload: normalizedPayload,
      source,
      outcome: "executed",
      result,
      approval,
    });

    return result;
  } catch (executionError) {
    await recordOperatorExecutionAudit({
      capability,
      organizationId,
      entityId,
      actorId,
      actorName,
      payload: normalizedPayload,
      source,
      outcome: "failed",
      error: executionError?.message || String(executionError),
      approval,
    });

    throw executionError;
  }
}

function isDeclaredImplementationGap(error) {
  const status = Number(error?.status || error?.statusCode || 0);
  const message = text(error?.message || error).toLowerCase();
  return (
    status === 501 ||
    message.includes("declared but not implemented") ||
    message.includes("not implemented yet") ||
    message.includes("capability implementation missing")
  );
}

function boundedImplementationGapFocus({ capability, error, originalMessage }) {
  return [
    `Repair the existing declared Business Partner capability ${text(capability?.key) || "unknown"} so the original governed action can execute end to end.`,
    `Observed runtime failure: ${text(error?.message || error).slice(0, 900)}`,
    `Original operator goal: ${text(originalMessage).slice(0, 1600)}`,
    "Treat this as an implementation gap inside the existing Blueprint / UBTE capability fabric, not permission to redesign architecture or create a duplicate business or media generator inside Business Partner.",
    "Make the smallest repository-grounded change, preserve current governance and organization/entity scope, add or update verification coverage, and stop at the normal Product Engineering persistence boundary.",
  ]
    .join("\n")
    .slice(0, 4000);
}

function boundedMissingCapabilityFocus({ requestedCapabilityKey, originalMessage }) {
  return [
    `Business Partner could not find a registered capability for the operator's requested Avantiqo action${text(requestedCapabilityKey, 200) ? ` (${text(requestedCapabilityKey, 200)})` : ""}.`,
    `Original operator goal: ${text(originalMessage, 1800)}`,
    "Inspect actual current main and the canonical ERP / UBTE registry before deciding whether code is genuinely missing.",
    "If the capability already exists under another correct key, repair routing/aliases rather than creating a duplicate. If the capability is genuinely absent, add the smallest neutral capability and end-to-end implementation needed for the original goal, preserving organization/entity scope, permissions, verification, and existing architecture.",
    "Do not add a duplicate generator, bypass governance, apply database migrations, change secrets, or invent a parallel domain model.",
  ].join("\n").slice(0, 4000);
}

async function attemptMissingCapabilityBuild({
  requestedCapabilityKey,
  capabilities,
  originalMessage,
  organizationId,
  entityId,
  periodId,
  partyId,
  actor,
  permissions,
  source,
  callerRequest,
}) {
  const engineeringCapability = capabilities.find(
    (item) => item.key === "platform.product_engineering_cycle.execute",
  );
  if (!engineeringCapability) return null;

  try {
    const release = automaticProductReleaseAllowed(permissions);
    const result = await executeCapability({
      capability: engineeringCapability,
      payload: {
        focus: boundedMissingCapabilityFocus({
          requestedCapabilityKey,
          originalMessage,
        }),
        ...(release
          ? {
              release_to_production: true,
              commit_message: `Add missing Business Partner capability ${text(requestedCapabilityKey, 100) || "gap"}`,
            }
          : {}),
      },
      organizationId,
      entityId,
      periodId,
      partyId,
      actor,
      permissions,
      source,
      callerRequest,
      runtimeMetadata: {
        operatorMissingCapabilityBuild: true,
        requestedCapabilityKey: text(requestedCapabilityKey, 200) || null,
      },
    });
    return { attempted: true, result, automatic_release_allowed: release };
  } catch (error) {
    return {
      attempted: true,
      error: text(error?.message || error, 900),
      status: Number(error?.status || error?.statusCode || 0) || null,
    };
  }
}

async function attemptDeclaredImplementationRepair({
  error,
  failedCapability,
  failedPayload,
  capabilities,
  originalMessage,
  organizationId,
  entityId,
  periodId,
  partyId,
  actor,
  permissions,
  source,
  callerRequest,
}) {
  if (!isDeclaredImplementationGap(error)) return null;
  if (
    text(failedCapability?.key) === "platform.product_engineering_cycle.execute"
  ) {
    return null;
  }

  const engineeringCapability = capabilities.find(
    (item) => item.key === "platform.product_engineering_cycle.execute",
  );
  if (!engineeringCapability) {
    return {
      attempted: false,
      reason: "PRODUCT_ENGINEERING_CAPABILITY_NOT_AVAILABLE",
      original_error: text(error?.message || error, 900),
    };
  }

  try {
    const engineeringResult = await executeCapability({
      capability: engineeringCapability,
      payload: {
        focus: boundedImplementationGapFocus({
          capability: failedCapability,
          error,
          originalMessage,
        }),
        ...(automaticProductReleaseAllowed(permissions)
          ? {
              release_to_production: true,
              commit_message: `Repair ${text(failedCapability?.key, 120) || "Avantiqo capability"}`,
            }
          : {}),
      },
      organizationId,
      entityId,
      periodId,
      partyId,
      actor,
      permissions,
      source,
      callerRequest,
      runtimeMetadata: {
        operatorImplementationRepair: true,
        failedCapabilityKey: failedCapability.key,
      },
    });

    try {
      const retryResult = await executeCapability({
        capability: failedCapability,
        payload: failedPayload,
        organizationId,
        entityId,
        periodId,
        partyId,
        actor,
        permissions,
        source,
        callerRequest,
        runtimeMetadata: {
          operatorImplementationRepairRetry: true,
          implementationRepairAttemptCount: 1,
        },
      });
      return {
        attempted: true,
        repaired_and_resumed: true,
        engineering_result: engineeringResult,
        retry_result: retryResult,
      };
    } catch (retryError) {
      return {
        attempted: true,
        repaired_and_resumed: false,
        engineering_result: engineeringResult,
        retry_error: text(retryError?.message || retryError, 900),
        retry_status:
          Number(retryError?.status || retryError?.statusCode || 0) || null,
      };
    }
  } catch (repairError) {
    return {
      attempted: true,
      repaired_and_resumed: false,
      engineering_error: text(repairError?.message || repairError, 900),
      engineering_status:
        Number(repairError?.status || repairError?.statusCode || 0) || null,
      original_error: text(error?.message || error, 900),
    };
  }
}

function implementationRepairBlockedTurn({
  response,
  decision,
  capability,
  repair,
  agreementState,
  originalMessage = null,
}) {
  const persistenceState = text(
    repair?.engineering_result?.persistence_state,
    160,
  );
  const commitPrepared = repair?.engineering_result?.commit_requested === true;
  const productionDeployed = repair?.engineering_result?.production_deployed === true;
  const deploymentPending = repair?.engineering_result?.deployment_pending === true;
  const engineeringFailed = Boolean(repair?.engineering_error);
  const responseText = engineeringFailed
    ? `I found that ${capability.key} is declared in Avantiqo but its runtime implementation is missing. I automatically sent the gap through Avantiqo Product Engineering / Code AI, but that repair did not verify: ${text(repair.engineering_error, 500)}.`
    : productionDeployed
      ? `I found that ${capability.key} was missing its working implementation, repaired it through Code AI, verified the result, committed the exact attested change to main, and released that verified commit to production. This server invocation is still running the old code, so I kept the original action bound for the next turn instead of pretending it already ran on the new deployment.`
      : deploymentPending
        ? `I repaired and verified ${capability.key}, committed the exact attested change to main, and started its production deployment. The deployment is still building, so I kept the original action bound for automatic continuation instead of replaying it against this old server version.`
        : commitPrepared
          ? `I found that ${capability.key} is declared but not implemented end to end. I automatically repaired and verified the code locally. This account does not have the dedicated automatic commit-and-production-release permissions, so the verified repair remains at the persistence boundary.`
          : `I found that ${capability.key} is declared but not implemented end to end. I automatically ran the bounded Avantiqo Product Engineering / Code AI repair and retried the original action once. The current running version still cannot execute it${persistenceState ? ` (${persistenceState})` : ""}, so I stopped instead of looping or pretending the action completed.`;
  const repairResume = (commitPrepared || productionDeployed || deploymentPending)
    ? {
        contract: "AVANTIQO_IMPLEMENTATION_REPAIR_RESUME_V1",
        capability_key: capability.key,
        payload: object(decision?.execution?.payload),
        reason: text(decision?.execution?.reason, 1000) || null,
        original_message: text(originalMessage, 4000) || null,
        authorization_source: "EXACT_PRIOR_OPERATOR_EXECUTION_INTENT",
        authorization_effect: "SAME_ACTION_ONLY",
        resume_attempted: false,
      }
    : null;
  const nextAgreementState = repairResume
    ? { ...object(agreementState), implementation_repair_resume: repairResume }
    : agreementState;

  return {
    ...response,
    agreement_state: nextAgreementState,
    execution: {
      status: "blocked",
      reason: engineeringFailed
        ? "PRODUCT_IMPLEMENTATION_REPAIR_FAILED"
        : "PRODUCT_IMPLEMENTATION_REPAIR_PENDING_ACTIVATION",
      capability: {
        key: capability.key,
        domain: capability.domain,
        capability: capability.capability,
        action: capability.action,
        mode: capability.mode,
      },
      implementation_repair: repair,
    },
    decision: {
      ...decision,
      agreement_state: nextAgreementState,
      intent: "answer",
      response_text: responseText,
      clarification: { required: false, question: null, options: [] },
    },
  };
}

async function runPendingPostActionVerification({
  pending,
  capabilities,
  organizationId,
  entityId,
  periodId,
  partyId,
  actor,
  permissions,
  source,
  callerRequest,
  actionResult = null,
  mutationCapability = null,
}) {
  if (!pending?.verify_after) return null;

  const verificationCapability = capabilities.find(
    (item) =>
      item.key === pending.verify_after.capability_key &&
      item.mode === "read",
  );

  if (!verificationCapability) {
    return {
      status: "unavailable",
      capability_key: pending.verify_after.capability_key,
      description: pending.verify_after.description,
      reason: "POST_ACTION_VERIFICATION_CAPABILITY_NOT_AVAILABLE",
    };
  }

  try {
    const result = await executeCapability({
      capability: verificationCapability,
      payload: pending.verify_after.payload,
      organizationId,
      entityId,
      periodId,
      partyId,
      actor,
      permissions,
      source,
      callerRequest,
    });

    const completedVerification = {
      status: "completed",
      capability_key: verificationCapability.key,
      description: pending.verify_after.description,
      result,
    };
    const deterministicProof = deterministicBusinessEffectProof({
      result: actionResult,
      post_action_verification: completedVerification,
    });
    const attestedVerification = {
      ...completedVerification,
      business_effect_verified: deterministicProof.passed === true,
      assertion: {
        passed: deterministicProof.passed === true,
        method: deterministicProof.method,
        reason: deterministicProof.reason,
        matched_identity: deterministicProof.matched_identity,
      },
    };

    if (mutationCapability?.mode && mutationCapability.mode !== "read") {
      const normalizedMutationPayload = normalizedExecutionPayload({
        payload: pending.payload,
        organizationId,
        entityId,
        periodId,
        partyId,
      });
      const cognitiveExecutionBinding = operatorIntelligenceMutationBindingProof(
        mutationCapability,
        {
          organizationId,
          entityId,
          periodId,
          partyId,
          payload: normalizedMutationPayload,
        },
      );
      if (cognitiveExecutionBinding) {
        const cognitiveVerificationAttestation = {
          contract: "AVANTIQO_COGNITIVE_MUTATION_VERIFICATION_ATTESTATION_V1",
          plan_id: cognitiveExecutionBinding.plan_id,
          step_id: cognitiveExecutionBinding.step_id,
          capability_key: cognitiveExecutionBinding.capability_key,
          execution_scope: cognitiveExecutionBinding.execution_scope,
          payload_fingerprint: cognitiveExecutionBinding.payload_fingerprint,
          verification_capability_key: verificationCapability.key,
          business_effect_verified: deterministicProof.passed === true,
          assertion: attestedVerification.assertion,
          authorization_effect: "NONE",
        };
        attestedVerification.cognitive_execution_binding_required = true;
        attestedVerification.cognitive_verification_attestation =
          cognitiveVerificationAttestation;
        const verificationAuditReceipt = await recordOperatorExecutionAudit({
          capability: mutationCapability,
          organizationId,
          entityId,
          actorId: text(actor?.id || actor?.user_id) || null,
          actorName: text(actor?.name || actor?.email) || null,
          payload: normalizedMutationPayload,
          source,
          outcome: deterministicProof.passed ? "verified" : "verification_failed",
          cognitiveExecutionBinding,
          verificationAttestation: cognitiveVerificationAttestation,
        });
        attestedVerification.cognitive_verification_audit_receipt_id =
          text(verificationAuditReceipt?.id) || null;
      }
    }

    return attestedVerification;
  } catch (verificationError) {
    return {
      status: "failed",
      capability_key: verificationCapability.key,
      description: pending.verify_after.description,
      error: text(verificationError?.message) || "Post-action verification failed",
    };
  }
}

async function retryPendingVerification({
  pending,
  capabilities,
  organizationId,
  entityId,
  periodId,
  partyId,
  actor,
  permissions,
  source,
  callerRequest,
}) {
  return runPendingPostActionVerification({
    pending: {
      verify_after: {
        capability_key: pending.capability_key,
        description: pending.reason || "Verify the business effect",
        payload: pending.payload,
      },
    },
    capabilities,
    organizationId,
    entityId,
    periodId,
    partyId,
    actor,
    permissions,
    source,
    callerRequest,
  });
}

export async function runOperatorTurn({
  organizationId,
  entityId = null,
  periodId = null,
  partyId,
  actor,
  role = null,
  permissions = [],
  locale = null,
  timezone = null,
  message,
  source = "text",
  pathname = null,
  agreementState = {},
  projectState = {},
  conversation = [],
  conversationAttachments = [],
  callerRequest = null,
} = {}) {
  if (!organizationId) throw new Error("OPERATOR_ORGANIZATION_REQUIRED");
  if (!partyId) throw new Error("OPERATOR_PARTY_REQUIRED");
  if (!text(message)) throw new Error("OPERATOR_MESSAGE_REQUIRED");

  const offeredPending = pendingAction(agreementState);
  const activeRun = autonomousRunFromAgreementState(agreementState);

  if (activeRun && isAutonomousRunStatusQuery(message)) {
    return runStatusTurn({
      run: activeRun,
      agreementState,
      projectState,
      locale,
    });
  }

  const orphanedPendingDecision = Boolean(
    activeRun &&
      (isAffirmative(message) || isNegative(message)) &&
      (operatorAutonomousRunRequiresPendingExecutionBinding(activeRun) ||
        missionRunRequiresPendingExecutionBinding(activeRun)) &&
      !runHasExactPendingBinding(activeRun, agreementState),
  );
  if (orphanedPendingDecision) {
    const guarded = runStatusTurn({
      run: activeRun,
      agreementState,
      projectState,
      locale,
    });
    return {
      ...guarded,
      operator_catalog: {
        ...object(guarded.operator_catalog),
        bypassed_for_run_status: false,
        bypassed_for_orphaned_pending_decision: true,
        execution_authorized: false,
      },
    };
  }

  const continueProjectAfterTerminalRun =
    shouldContinueProjectInsteadOfTerminalRun({
      run: activeRun,
      projectState,
      message,
    });
  const resumeRequested = Boolean(
    activeRun &&
      isAutonomousRunResumeRequest(message) &&
      !continueProjectAfterTerminalRun,
  );
  const resumeFromApproval = Boolean(
    resumeRequested &&
      text(activeRun?.status).toLowerCase() === "awaiting_approval" &&
      offeredPending &&
      offeredPending.resume_kind !== "verification",
  );
  const resumeMission = Boolean(
    resumeRequested &&
      offeredPending?.resume_kind === "mission" &&
      ["awaiting_approval", "verifying"].includes(
        text(activeRun?.status).toLowerCase(),
      ),
  );
  const resumeVerification = Boolean(
    resumeRequested &&
      text(activeRun?.status).toLowerCase() === "blocked" &&
      text(activeRun?.current_step_id) === "post_action_verification" &&
      offeredPending?.resume_kind === "verification",
  );
  const invalidMissionRunShapeResumeRequest = Boolean(
    offeredPending?.resume_kind === "mission" &&
      isAutonomousRunResumeRequest(message) &&
      (!activeRun || text(activeRun?.run_kind).toLowerCase() !== "mission"),
  );

  if (
    resumeRequested &&
    !resumeFromApproval &&
    !resumeMission &&
    !resumeVerification
  ) {
    return runResumeTurn({
      run: activeRun,
      agreementState,
      projectState,
      locale,
    });
  }

  const retryVerificationRequested = Boolean(
    offeredPending?.resume_kind === "verification" &&
      (isAffirmative(message) || resumeVerification),
  );
  const respondsToPending = Boolean(
    offeredPending &&
      (
        isAffirmative(message) ||
        isNegative(message) ||
        resumeFromApproval ||
        resumeMission ||
        resumeVerification ||
        invalidMissionRunShapeResumeRequest
      ),
  );

  const genericPendingBindingMismatch = Boolean(
    respondsToPending &&
      offeredPending?.resume_kind !== "mission" &&
      !operatorPendingExecutionMatchesAutonomousRun(offeredPending, activeRun),
  );
  if (genericPendingBindingMismatch) {
    return pendingRunStateMismatchTurn({
      agreementState,
      projectState,
      locale,
      run: activeRun,
    });
  }

  const pending = respondsToPending ? offeredPending : null;
  const fastConversation = Boolean(
    !pending &&
      isFastConversationTurn({
        message,
        source,
        locale,
        timezone,
      }),
  );

  if (fastConversation) {
    const exactPendingBinding = Boolean(
      offeredPending &&
        activeRun &&
        (offeredPending.resume_kind === "mission"
          ? missionResumeProjectionMatches(offeredPending, activeRun)
          : operatorPendingExecutionMatchesAutonomousRun(
              offeredPending,
              activeRun,
            )),
    );
    const fastConversationAgreementState =
      hasStoredPendingExecution(agreementState) && !exactPendingBinding
        ? clearedAgreementState(agreementState)
        : agreementState;

    return runFastConversationTurn({
      organizationId,
      partyId,
      entityId,
      locale,
      timezone,
      message,
      source,
      conversation,
      agreementState: fastConversationAgreementState,
      projectState,
    });
  }

  const activeAgreementState = respondsToPending
    ? agreementState
    : clearPendingAndSupersedeRun(agreementState, Boolean(offeredPending));

  const navigationTargets = listOperatorNavigationTargets({ organizationId });
  const currentScreen = resolveOperatorCurrentScreen({
    organizationId,
    pathname,
  });

  if (!pending) {
    const instantNavigation = resolveInstantOperatorNavigation({
      message,
      targets: navigationTargets,
    });

    if (instantNavigation?.matched && instantNavigation.target) {
      const target = instantNavigation.target;
      return {
        success: true,
        decision: {
          response_text: `Opening ${target.name}.`,
          response_language: locale || null,
          intent: "navigate",
          confidence: 1,
          agreement_state: activeAgreementState,
          project_state: projectState,
          clarification: { required: false, question: null, options: [] },
          navigation: { target_id: target.id },
          execution: { capability_key: null, payload: {}, reason: null },
          plan: [],
        },
        agreement_state: activeAgreementState,
        current_screen: currentScreen,
        provider_evidence: {
          provider: "avantiqo-local",
          model: "instant-navigation-v1",
          usage_id: null,
        },
        navigation: {
          target_id: target.id,
          name: target.name,
          href: target.href,
          route: target.route,
        },
        execution: null,
        operator_catalog: {
          navigation_target_count: navigationTargets.length,
          executable_capability_count: 0,
          bypassed_for_instant_navigation: true,
        },
      };
    }

    if (instantNavigation?.ambiguous) {
      const options = instantNavigation.alternatives.map((target) => ({
        id: target.id,
        label: [target.name, target.group_name || target.domain_id]
          .filter(Boolean)
          .join(" — "),
      }));
      return {
        success: true,
        decision: {
          response_text: `I found more than one matching workspace. Which one do you mean: ${options.map((option) => option.label).join(", ")}?`,
          response_language: locale || null,
          intent: "clarify",
          confidence: 1,
          agreement_state: activeAgreementState,
          project_state: projectState,
          clarification: {
            required: true,
            question: "Which workspace should I open?",
            options,
          },
          navigation: { target_id: null },
          execution: { capability_key: null, payload: {}, reason: null },
          plan: [],
        },
        agreement_state: activeAgreementState,
        current_screen: currentScreen,
        provider_evidence: {
          provider: "avantiqo-local",
          model: "instant-navigation-v1",
          usage_id: null,
        },
        navigation: null,
        execution: null,
        operator_catalog: {
          navigation_target_count: navigationTargets.length,
          executable_capability_count: 0,
          bypassed_for_instant_navigation: true,
        },
      };
    }
  }

  const discoveredCapabilities = await listOperatorCapabilities();
  const capabilities = safeCapabilities(
    discoveredCapabilities,
    Array.isArray(permissions) ? permissions : [],
    role,
  );

  if (pending && isNegative(message)) {
    const cancellingVerification = pending.resume_kind === "verification";
    const cancellingMission = pending.resume_kind === "mission";
    const cancelledStepId = cancellingMission
      ? text(activeRun?.current_step_id)
      : cancellingVerification
        ? "post_action_verification"
        : "requested_action";
    const nextAgreementState = agreementWithRunTransition(
      clearedAgreementState(agreementState),
      {
        status: "cancelled",
        stepId: cancelledStepId,
        stepStatus: "cancelled",
        blocker: cancellingMission
          ? "User cancelled the remaining mission"
          : cancellingVerification
            ? "User cancelled the pending verification retry"
            : "User cancelled the pending action",
      },
    );

    return {
      success: true,
      decision: {
        response_text: cancellingMission
          ? "Okay. I cancelled the remaining mission steps. I will not revive them automatically."
          : cancellingVerification
            ? "Okay. I will not retry the verification. The business action already ran, but its final effect remains unverified."
            : "Okay. I cancelled that action.",
        response_language: locale || null,
        intent: "answer",
        confidence: 1,
        agreement_state: nextAgreementState,
        clarification: {
          required: false,
          question: null,
          options: [],
        },
        navigation: { target_id: null },
        execution: {
          capability_key: null,
          payload: {},
          reason: null,
        },
        plan: [],
      },
      agreement_state: nextAgreementState,
      current_screen: currentScreen,
      provider_evidence: null,
      navigation: null,
      execution: {
        status: "cancelled",
        capability_key: pending.capability_key,
        resume_kind: pending.resume_kind,
      },
      operator_catalog: {
        navigation_target_count: navigationTargets.length,
        executable_capability_count: capabilities.length,
      },
    };
  }

  if (
    pending?.resume_kind === "mission" &&
    !missionResumeProjectionMatches(pending, activeRun)
  ) {
    const blocker = "OPERATOR_MISSION_RESUME_RUN_STATE_MISMATCH";
    const currentStepId = text(activeRun?.current_step_id) || null;
    let nextAgreementState = clearedAgreementState(agreementState);
    if (activeRun) {
      nextAgreementState = agreementWithRunTransition(nextAgreementState, {
        status: "blocked",
        currentStepId,
        stepId: currentStepId,
        stepStatus: "failed",
        blocker,
      });
    }

    return {
      success: true,
      decision: {
        response_text:
          "I will not resume this mission because its stored pending execution no longer matches its stored mission run. I cleared the resumable action rather than risk executing a different step.",
        response_language: locale || null,
        intent: "answer",
        confidence: 1,
        agreement_state: nextAgreementState,
        project_state: projectState,
        clarification: {
          required: false,
          question: null,
          options: [],
        },
        navigation: { target_id: null },
        execution: {
          capability_key: null,
          payload: {},
          reason: blocker,
        },
        plan: activeRun?.planned_steps || [],
      },
      agreement_state: nextAgreementState,
      current_screen: currentScreen,
      provider_evidence: null,
      navigation: null,
      execution: {
        status: "blocked",
        reason: blocker,
        capability_key: OPERATOR_MISSION_KEY,
        resumed_run: false,
      },
      operator_catalog: {
        navigation_target_count: navigationTargets.length,
        executable_capability_count: capabilities.length,
      },
    };
  }

  if (retryVerificationRequested && pending) {
    const verificationCapability = capabilities.find(
      (item) => item.key === pending.capability_key && item.mode === "read",
    );
    const retryResult = await retryPendingVerification({
      pending,
      capabilities,
      organizationId,
      entityId,
      periodId,
      partyId,
      actor,
      permissions,
      source,
      callerRequest,
    });
    const retryCompleted =
      text(retryResult?.status).toLowerCase() === "completed";
    const nextAgreementState = agreementWithRunTransition(
      retryCompleted ? clearedAgreementState(agreementState) : agreementState,
      {
        status: retryCompleted ? "completed" : "blocked",
        currentStepId: retryCompleted ? null : "post_action_verification",
        stepId: "post_action_verification",
        stepStatus: retryCompleted ? "completed" : "failed",
        blocker: retryCompleted
          ? null
          : text(retryResult?.reason || retryResult?.error) ||
            "Post-action verification did not complete",
      },
    );

    let responseText = retryCompleted
      ? "The verification completed successfully and the run is now complete."
      : `The verification still could not complete: ${text(
          retryResult?.reason || retryResult?.error,
        ) || "the verification read failed"}.`;
    let verificationEvidence = null;
    let nextProjectState = projectState;

    if (retryCompleted && verificationCapability) {
      try {
        const verification = await verifyOperatorExecution({
          organizationId,
          partyId,
          entityId,
          locale,
          timezone,
          originalMessage:
            pending.original_message || text(activeRun?.objective) || message,
          source,
          currentScreen,
          agreementState: nextAgreementState,
          projectState,
          conversation,
          capability: verificationCapability,
          result: retryResult.result,
        });
        responseText = verification?.decision?.response_text || responseText;
        verificationEvidence = verification?.provider_evidence || null;
        nextProjectState = verification?.decision?.project_state || nextProjectState;
      } catch (verificationError) {
        console.error("OPERATOR_VERIFICATION_ERROR", verificationError);
      }
    }

    return {
      success: true,
      decision: {
        response_text: responseText,
        response_language: locale || null,
        intent: "answer",
        confidence: 1,
        agreement_state: nextAgreementState,
        project_state: nextProjectState,
        clarification: {
          required: false,
          question: null,
          options: [],
        },
        navigation: { target_id: null },
        execution: {
          capability_key: verificationCapability?.key || pending.capability_key,
          payload: pending.payload,
          reason: pending.reason,
        },
        plan: [],
      },
      agreement_state: nextAgreementState,
      current_screen: currentScreen,
      provider_evidence: {
        verification: verificationEvidence,
      },
      navigation: null,
      execution: {
        status: retryCompleted ? "completed" : "blocked",
        resumed_run: true,
        resume_kind: "verification",
        capability: verificationCapability
          ? {
              key: verificationCapability.key,
              domain: verificationCapability.domain,
              capability: verificationCapability.capability,
              action: verificationCapability.action,
              mode: verificationCapability.mode,
            }
          : null,
        result: retryResult,
      },
      operator_catalog: {
        navigation_target_count: navigationTargets.length,
        executable_capability_count: capabilities.length,
      },
    };
  }

  if (pending && (isAffirmative(message) || resumeFromApproval || resumeMission)) {
    const capability = capabilities.find(
      (item) => item.key === pending.capability_key,
    );

    if (!capability) {
      const nextAgreementState = agreementWithRunTransition(
        clearedAgreementState(agreementState),
        {
          status: "blocked",
          stepId: text(activeRun?.current_step_id) || "requested_action",
          stepStatus: "failed",
          blocker: "CAPABILITY_NOT_AVAILABLE",
        },
      );

      return {
        success: true,
        decision: {
          response_text:
            "I can no longer execute that pending action because the capability is not available in your current access context.",
          response_language: locale || null,
          intent: "clarify",
          confidence: 1,
          agreement_state: nextAgreementState,
          clarification: {
            required: true,
            question: "Would you like me to help you choose another action?",
            options: [],
          },
          navigation: { target_id: null },
          execution: {
            capability_key: null,
            payload: {},
            reason: null,
          },
          plan: [],
        },
        agreement_state: nextAgreementState,
        current_screen: currentScreen,
        provider_evidence: null,
        navigation: null,
        execution: {
          status: "blocked",
          reason: "CAPABILITY_NOT_AVAILABLE",
        },
        operator_catalog: {
          navigation_target_count: navigationTargets.length,
          executable_capability_count: capabilities.length,
        },
      };
    }

    let result;
    const missionResume = pending.resume_kind === "mission";

    try {
      result = await executeCapability({
        capability,
        payload: pending.payload,
        organizationId,
        entityId,
        periodId,
        partyId,
        actor,
        permissions,
        source,
        callerRequest,
        approvalRequestId: pending.approval_request_id,
        runtimeMetadata: missionResume
          ? {
              operatorMissionResume: true,
              operatorMissionConfirmed: isAffirmative(message),
            }
          : {},
      });
    } catch (executionError) {
      if (!executionError?.operatorGovernance) throw executionError;

      const governance = executionError.operatorGovernance;
      const approvalBoundState = agreementWithApprovalRequest(
        agreementState,
        governance.approvalRequest,
      );
      const governanceState = approvalRunTransition(
        approvalBoundState,
        governance,
      );

      return {
        success: true,
        decision: {
          response_text: governanceBlockText(governance.reason),
          response_language: locale || null,
          intent: "answer",
          confidence: 1,
          agreement_state: governanceState,
          clarification: {
            required: false,
            question: null,
            options: [],
          },
          navigation: { target_id: null },
          execution: {
            capability_key: capability.key,
            payload: pending.payload,
            reason: pending.reason,
          },
          plan: [],
        },
        agreement_state: governanceState,
        current_screen: currentScreen,
        provider_evidence: null,
        navigation: null,
        execution: {
          status: "blocked",
          reason: governance.reason,
          capability_key: capability.key,
          approval_request: governance.approvalRequest || null,
          resumed_run: resumeFromApproval,
        },
        operator_catalog: {
          navigation_target_count: navigationTargets.length,
          executable_capability_count: capabilities.length,
        },
      };
    }

    if (isMissionExecutionResult(capability, result)) {
      return missionResultTurn({
        result,
        capability,
        agreementState,
        projectState,
        locale,
        currentScreen,
        navigationTargetCount: navigationTargets.length,
        executableCapabilityCount: capabilities.length,
        originalMessage: pending.original_message || message,
        objective: text(activeRun?.objective) || pending.original_message || message,
        resumedRun: true,
      });
    }

    const postActionVerification = await runPendingPostActionVerification({
      pending,
      capabilities,
      organizationId,
      entityId,
      periodId,
      partyId,
      actor,
      permissions,
      source,
      callerRequest,
      actionResult: result,
      mutationCapability: capability,
    });
    const verificationResult = postActionVerification
      ? {
          action_result: result,
          post_action_verification: postActionVerification,
        }
      : result;
    const nextAgreementState = completedAgreementState(
      agreementState,
      pending,
      postActionVerification,
    );

    let responseText = "Done. The confirmed action completed successfully.";
    let verificationEvidence = null;
    let nextProjectState = projectState;
    const deterministicVerification = deterministicFinanceExecutionVerification({
      capability,
      result,
    });

    if (deterministicVerification) {
      responseText = deterministicVerification.response_text || responseText;
      verificationEvidence = deterministicVerification.provider_evidence || null;
    } else {
      try {
        const verification = await verifyOperatorExecution({
          organizationId,
          partyId,
          entityId,
          locale,
          timezone,
          originalMessage: pending.original_message || message,
          source,
          currentScreen,
          agreementState: nextAgreementState,
          projectState,
          conversation,
          capability,
          result: verificationResult,
        });

        responseText = verification?.decision?.response_text || responseText;
        verificationEvidence = verification?.provider_evidence || null;
        nextProjectState = verification?.decision?.project_state || nextProjectState;
      } catch (verificationError) {
        console.error("OPERATOR_VERIFICATION_ERROR", verificationError);
      }
    }

    return {
      success: true,
      decision: {
        response_text: responseText,
        response_language: locale || null,
        intent: "answer",
        confidence: 1,
        agreement_state: nextAgreementState,
        project_state: nextProjectState,
        clarification: {
          required: false,
          question: null,
          options: [],
        },
        navigation: { target_id: null },
        execution: {
          capability_key: capability.key,
          payload: pending.payload,
          reason: pending.reason,
        },
        plan: [],
      },
      agreement_state: nextAgreementState,
      current_screen: currentScreen,
      provider_evidence: {
        verification: verificationEvidence,
      },
      navigation: null,
      execution: {
        status: "completed",
        capability: {
          key: capability.key,
          domain: capability.domain,
          capability: capability.capability,
          action: capability.action,
          mode: capability.mode,
        },
        result,
        ...(postActionVerification
          ? { post_action_verification: postActionVerification }
          : {}),
        resumed_run: resumeFromApproval,
      },
      operator_catalog: {
        navigation_target_count: navigationTargets.length,
        executable_capability_count: capabilities.length,
      },
    };
  }

  const reasoning = await reasonAboutOperatorTurn({
    organizationId,
    partyId,
    entityId,
    locale,
    timezone,
    message,
    source,
    currentScreen,
    agreementState: activeAgreementState,
    projectState,
    conversation,
    conversationAttachments,
    navigationTargets,
    capabilities,
  });

  const decision = reasoning.decision;
  const response = {
    success: true,
    decision,
    agreement_state: decision.agreement_state,
    current_screen: currentScreen,
    provider_evidence: reasoning.provider_evidence,
    navigation: null,
    execution: null,
    operator_catalog: {
      navigation_target_count: navigationTargets.length,
      executable_capability_count: capabilities.length,
    },
  };

  if (decision.intent === "navigate" && decision.navigation.target_id) {
    const target = navigationTargets.find(
      (item) => item.id === decision.navigation.target_id,
    );

    if (!target) {
      return {
        ...response,
        decision: {
          ...decision,
          intent: "clarify",
          response_text:
            "I understood that you want me to open something, but I could not match it to a registered Avantiqo workspace yet.",
          clarification: {
            required: true,
            question: "Which workspace do you want me to open?",
            options: [],
          },
        },
      };
    }

    response.navigation = {
      target_id: target.id,
      name: target.name,
      href: target.href,
      route: target.route,
    };

    return response;
  }

  if (decision.intent !== "execute" || !decision.execution.capability_key) {
    return response;
  }

  const capability = capabilities.find(
    (item) => item.key === decision.execution.capability_key,
  );

  if (!capability) {
    const gapBuild = await attemptMissingCapabilityBuild({
      requestedCapabilityKey: decision.execution.capability_key,
      capabilities,
      originalMessage: message,
      organizationId,
      entityId,
      periodId,
      partyId,
      actor,
      permissions,
      source,
      callerRequest,
    });
    if (gapBuild?.attempted) {
      const built = gapBuild.result;
      const deployed = built?.production_deployed === true;
      const pendingDeploy = built?.deployment_pending === true;
      const persisted = built?.commit_completed === true;
      const resumeBinding = (deployed || pendingDeploy || persisted)
        ? {
            contract: "AVANTIQO_IMPLEMENTATION_REPAIR_RESUME_V1",
            capability_key: text(decision.execution.capability_key, 300),
            payload: object(decision.execution.payload),
            reason: text(decision.execution.reason, 1000) || null,
            original_message: text(message, 4000) || null,
            authorization_source: "EXACT_PRIOR_OPERATOR_EXECUTION_INTENT",
            authorization_effect: "SAME_ACTION_ONLY",
            resume_attempted: false,
          }
        : null;
      const gapAgreementState = resumeBinding
        ? { ...object(decision.agreement_state), implementation_repair_resume: resumeBinding }
        : decision.agreement_state;
      return {
        ...response,
        agreement_state: gapAgreementState,
        execution: {
          status: gapBuild.error ? "blocked" : deployed ? "completed" : "repairing",
          reason: gapBuild.error
            ? "PRODUCT_MISSING_CAPABILITY_BUILD_FAILED"
            : deployed
              ? "PRODUCT_MISSING_CAPABILITY_RELEASED"
              : pendingDeploy
                ? "PRODUCT_MISSING_CAPABILITY_DEPLOYMENT_PENDING"
                : persisted
                  ? "PRODUCT_MISSING_CAPABILITY_PERSISTED"
                  : "PRODUCT_MISSING_CAPABILITY_ENGINEERED",
          requested_capability_key: decision.execution.capability_key,
          product_engineering: gapBuild,
        },
        decision: {
          ...decision,
          agreement_state: gapAgreementState,
          intent: "answer",
          response_text: gapBuild.error
            ? `I could not find the requested Business Partner capability, so I automatically sent the gap to Product Engineering / Code AI. The engineering cycle did not verify successfully: ${text(gapBuild.error, 500)}.`
            : deployed
              ? "That Business Partner capability was missing. I automatically assessed current main, built and verified the missing code, committed the exact attested result, and released that commit to production. The original request remains bound so it can continue on the new running version rather than being faked on this old invocation."
              : pendingDeploy
                ? "That Business Partner capability was missing. I automatically built, verified and committed the repair, and the production deployment is now in progress. I kept the original request bound for the new version."
                : "That Business Partner capability was missing. I automatically sent it through Product Engineering / Code AI and verified the engineering result. It has not reached a verified production release yet, so I did not pretend the original action completed.",
          clarification: { required: false, question: null, options: [] },
        },
      };
    }
  }

  const blocked = executionBlockedReason(capability, {
    source,
    confirmed: false,
  });

  if (blocked) {
    const needsConfirmation =
      blocked === "VOICE_CONFIRMATION_REQUIRED" ||
      blocked === "CONFIRMATION_REQUIRED";

    const nextAgreementState = needsConfirmation && capability
      ? agreementWithPendingConfirmationRun({
          agreementState: decision.agreement_state,
          capability,
          payload: decision.execution.payload,
          reason: decision.execution.reason,
          originalMessage: message,
          objective:
            text(decision.project_state?.objective) ||
            text(projectState?.objective) ||
            text(message),
        })
      : decision.agreement_state;

    return {
      ...response,
      agreement_state: nextAgreementState,
      execution: {
        status: "blocked",
        reason: blocked,
        capability: capability || null,
        requested_payload: decision.execution.payload,
      },
      decision: {
        ...decision,
        agreement_state: nextAgreementState,
        intent: capability ? "plan" : "clarify",
        response_text:
          needsConfirmation && capability
            ? `${decision.response_text} Should I proceed with that action?`
            : capability
              ? `${decision.response_text} This capability is connected, but automatic execution is not enabled for it yet.`
              : `${decision.response_text} I could not match that action to an Operator-enabled business capability.`,
        clarification: {
          required: !capability || needsConfirmation,
          question:
            needsConfirmation && capability
              ? "Should I proceed with that exact action?"
              : !capability
                ? "Do you want me to help refine the request or open the relevant workspace?"
                : null,
          options:
            needsConfirmation && capability
              ? [
                  { id: "confirm", label: "Yes, proceed" },
                  { id: "cancel", label: "No, cancel" },
                ]
              : [],
        },
      },
    };
  }

  let result;

  try {
    result = await executeCapability({
      capability,
      payload: decision.execution.payload,
      organizationId,
      entityId,
      periodId,
      partyId,
      actor,
      permissions,
      source,
      callerRequest,
    });
  } catch (executionError) {
    if (!executionError?.operatorGovernance) throw executionError;

    const governance = executionError.operatorGovernance;
    const pendingApprovalState = agreementWithPendingConfirmationRun({
      agreementState: decision.agreement_state,
      capability,
      payload: decision.execution.payload,
      reason: decision.execution.reason,
      originalMessage: message,
      objective:
        text(decision.project_state?.objective) ||
        text(projectState?.objective) ||
        text(message),
      approvalRequestId: governance.approvalRequest?.id,
    });
    const governanceState = approvalRunTransition(
      pendingApprovalState,
      governance,
    );

    return {
      ...response,
      agreement_state: governanceState,
      execution: {
        status: "blocked",
        reason: governance.reason,
        capability: {
          key: capability.key,
          domain: capability.domain,
          capability: capability.capability,
          action: capability.action,
          mode: capability.mode,
        },
        requested_payload: decision.execution.payload,
        approval_request: governance.approvalRequest || null,
      },
      decision: {
        ...decision,
        agreement_state: governanceState,
        intent: "answer",
        response_text: governanceBlockText(governance.reason),
        clarification: {
          required: false,
          question: null,
          options: [],
        },
      },
    };
  }

  const registryReadResponse =
    text(capability?.mode).toLowerCase() === "read"
      ? registryRecordReadResponseText(capability, result)
      : null;
  if (registryReadResponse) {
    return {
      ...response,
      agreement_state: decision.agreement_state,
      provider_evidence: {
        planning: reasoning.provider_evidence,
        verification: {
          provider: "avantiqo-local",
          model: "registry-record-read-result-renderer-v1",
          usage_id: null,
        },
      },
      execution: {
        status: "completed",
        capability: {
          key: capability.key,
          domain: capability.domain,
          capability: capability.capability,
          action: capability.action,
          mode: capability.mode,
        },
        result,
      },
      decision: {
        ...decision,
        intent: "answer",
        response_text: registryReadResponse,
        project_state: {
          ...object(decision.project_state),
          last_intent: "answer",
          last_response: registryReadResponse,
        },
      },
    };
  }

  if (capability.key === ORGANIZATIONAL_CONTEXT_KEY) {
    const responseText = organizationalContextResponseText(result);
    return {
      ...response,
      agreement_state: decision.agreement_state,
      provider_evidence: {
        planning: reasoning.provider_evidence,
        verification: {
          provider: "avantiqo-local",
          model: "organizational-context-result-renderer-v1",
          usage_id: null,
        },
      },
      execution: {
        status: "completed",
        capability: {
          key: capability.key,
          domain: capability.domain,
          capability: capability.capability,
          action: capability.action,
          mode: capability.mode,
        },
        result,
      },
      decision: {
        ...decision,
        intent: "answer",
        response_text: responseText,
        project_state: {
          ...object(decision.project_state),
          last_intent: "answer",
          last_response: responseText,
        },
      },
    };
  }

  if (isMissionExecutionResult(capability, result)) {
    return missionResultTurn({
      result,
      capability,
      agreementState: decision.agreement_state,
      projectState: decision.project_state || projectState,
      locale,
      currentScreen,
      navigationTargetCount: navigationTargets.length,
      executableCapabilityCount: capabilities.length,
      originalMessage: message,
      objective:
        text(decision.project_state?.objective) ||
        text(projectState?.objective) ||
        text(message),
      resumedRun: false,
    });
  }

  let verifiedDecision = decision;
  let verificationEvidence = null;

  try {
    const verification = await verifyOperatorExecution({
      organizationId,
      partyId,
      entityId,
      locale,
      timezone,
      originalMessage: message,
      source,
      currentScreen,
      agreementState: decision.agreement_state,
      projectState: {
        ...object(projectState),
        ...object(decision.project_state),
      },
      conversation,
      capability,
      result,
    });

    verifiedDecision = verification.decision;
    verificationEvidence = verification.provider_evidence;
  } catch (verificationError) {
    console.error("OPERATOR_VERIFICATION_ERROR", verificationError);
  }

  return {
    ...response,
    agreement_state:
      verifiedDecision.agreement_state || decision.agreement_state,
    provider_evidence: {
      planning: reasoning.provider_evidence,
      verification: verificationEvidence,
    },
    execution: {
      status: "completed",
      capability: {
        key: capability.key,
        domain: capability.domain,
        capability: capability.capability,
        action: capability.action,
        mode: capability.mode,
      },
      result,
    },
    decision: {
      ...verifiedDecision,
      response_text:
        verifiedDecision.response_text ||
        "Done. The requested Avantiqo action completed successfully.",
    },
  };
}