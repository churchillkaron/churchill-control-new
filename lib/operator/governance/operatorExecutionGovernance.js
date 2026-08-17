import { createApprovalRequest } from "@/lib/shared/approvals/createApprovalRequest";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import logAuditEvent from "@/lib/audit/logAuditEvent";

const APPROVAL_REQUIRED_RISKS = new Set(["critical"]);
const TERMINAL_REJECTED_APPROVAL_STATUSES = new Set([
  "rejected",
  "denied",
  "cancelled",
  "canceled",
]);
const AUTHORIZATION_MODES = new Set([
  "read",
  "auto_execute",
  "user_confirmed",
  "approval_resumed",
  "mission_governed",
  "unresolved",
]);

function text(value) {
  return String(value ?? "").trim();
}

function normalizedAuthorizationMode(value) {
  const mode = text(value).toLowerCase();
  return AUTHORIZATION_MODES.has(mode) ? mode : null;
}

function inferredAuthorizationOrigin({ capability, source }) {
  const mode = text(capability?.mode).toLowerCase();
  if (mode === "read") return "read";

  const channel = text(source).toLowerCase();
  const risk = text(capability?.risk).toLowerCase();
  const explicitlyAutoExecutable =
    capability?.auto_execute === true ||
    capability?.operatorAutoExecute === true ||
    capability?.operator_auto_execute === true;
  const explicitlyNotAutoExecutable = capability?.auto_execute === false;
  const requiresConfirmation =
    capability?.requires_confirmation === true ||
    capability?.operatorRequiresConfirmation === true ||
    capability?.operator_requires_confirmation === true ||
    mode === "approve" ||
    ["high", "critical"].includes(risk) ||
    explicitlyNotAutoExecutable;

  if (channel === "voice") return "user_confirmed";
  if (requiresConfirmation) return "user_confirmed";
  if (explicitlyAutoExecutable) return "auto_execute";

  if (channel === "mission") return "mission_governed";

  return "unresolved";
}

export function resolveOperatorAuthorizationProvenance({
  capability,
  source = "text",
  approval = null,
  authorizationMode = null,
  authorizationOriginMode = null,
} = {}) {
  const explicitMode = normalizedAuthorizationMode(authorizationMode);
  const explicitOrigin = normalizedAuthorizationMode(authorizationOriginMode);
  const inferredOrigin = inferredAuthorizationOrigin({ capability, source });
  const originMode =
    explicitOrigin ||
    (explicitMode && explicitMode !== "approval_resumed"
      ? explicitMode
      : inferredOrigin);
  const approvalResumed =
    (approval?.resumed === true && approval?.allowed === true) ||
    explicitMode === "approval_resumed";
  const mode = approvalResumed
    ? "approval_resumed"
    : explicitMode || originMode;

  return {
    mode,
    origin_mode: originMode,
    conversationally_confirmed: originMode === "user_confirmed",
    approval_resumed: approvalResumed,
  };
}

function expectedApprovalReference({ organizationId, entityId }) {
  return {
    referenceTable: entityId ? "legal_entities" : "organizations",
    referenceId: entityId || organizationId,
  };
}

async function resolveExistingApprovalRequest({
  approvalRequestId,
  capability,
  organizationId,
  entityId,
}) {
  const requestId = text(approvalRequestId);
  if (!requestId) return null;

  const { referenceTable, referenceId } = expectedApprovalReference({
    organizationId,
    entityId,
  });

  const { data: approvalRequest, error: requestError } = await supabaseAdmin
    .from("approval_requests")
    .select(
      "id, workflow_id, reference_table, reference_id, status, requested_by, approved_by, rejected_by, rejection_reason, approved_at, rejected_at, created_at, organization_id",
    )
    .eq("id", requestId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (requestError) {
    return {
      allowed: false,
      governed: true,
      approvalRequest: null,
      reason: "APPROVAL_REQUEST_LOOKUP_FAILED",
      error: requestError.message || null,
    };
  }

  if (!approvalRequest) {
    return {
      allowed: false,
      governed: true,
      approvalRequest: null,
      reason: "APPROVAL_REQUEST_NOT_FOUND",
    };
  }

  const { data: workflow, error: workflowError } = await supabaseAdmin
    .from("approval_workflows")
    .select("id, workflow_type, organization_id")
    .eq("id", approvalRequest.workflow_id)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (workflowError) {
    return {
      allowed: false,
      governed: true,
      approvalRequest,
      reason: "APPROVAL_REQUEST_LOOKUP_FAILED",
      error: workflowError.message || null,
    };
  }

  const expectedWorkflowType = `operator.${capability.key}`;
  const referenceMatches =
    text(approvalRequest.reference_table) === referenceTable &&
    text(approvalRequest.reference_id) === text(referenceId);
  const workflowMatches =
    Boolean(workflow) && text(workflow.workflow_type) === expectedWorkflowType;

  if (!referenceMatches || !workflowMatches) {
    return {
      allowed: false,
      governed: true,
      approvalRequest,
      reason: "APPROVAL_REQUEST_MISMATCH",
    };
  }

  const status = text(approvalRequest.status).toLowerCase();
  if (status === "approved") {
    return {
      allowed: true,
      governed: true,
      approvalRequest,
      reason: null,
      resumed: true,
    };
  }

  if (TERMINAL_REJECTED_APPROVAL_STATUSES.has(status)) {
    return {
      allowed: false,
      governed: true,
      approvalRequest,
      reason: "APPROVAL_REJECTED",
    };
  }

  return {
    allowed: false,
    governed: true,
    approvalRequest,
    reason: "APPROVAL_REQUIRED",
    resumed: true,
  };
}

export function isGovernedOperatorMode(mode) {
  return text(mode).toLowerCase() !== "read";
}

export function requiresDurableApproval(capability) {
  const policy = capability?.approval;

  if (policy === false || text(policy).toLowerCase() === "none") return false;
  if (policy === true || text(policy).toLowerCase() === "required") return true;

  if (policy && typeof policy === "object") {
    if (policy.required === false) return false;
    if (policy.required === true) return true;
  }

  return APPROVAL_REQUIRED_RISKS.has(text(capability?.risk).toLowerCase());
}

export async function resolveOperatorExecutionApproval({
  capability,
  organizationId,
  entityId = null,
  actorId = null,
  approvalRequestId = null,
}) {
  if (!isGovernedOperatorMode(capability?.mode)) {
    return { allowed: true, governed: false, approvalRequest: null, reason: null };
  }

  if (!requiresDurableApproval(capability)) {
    return { allowed: true, governed: true, approvalRequest: null, reason: null };
  }

  if (text(approvalRequestId)) {
    return resolveExistingApprovalRequest({
      approvalRequestId,
      capability,
      organizationId,
      entityId,
    });
  }

  try {
    const approvalRequest = await createApprovalRequest({
      organizationId,
      workflowType: `operator.${capability.key}`,
      referenceTable: entityId ? "legal_entities" : "organizations",
      referenceId: entityId || organizationId,
      requestedBy: actorId,
    });

    return {
      allowed: false,
      governed: true,
      approvalRequest,
      reason: "APPROVAL_REQUIRED",
    };
  } catch (error) {
    return {
      allowed: false,
      governed: true,
      approvalRequest: null,
      reason:
        error?.status === 409
          ? "APPROVAL_WORKFLOW_NOT_CONFIGURED"
          : "APPROVAL_REQUEST_FAILED",
      error: error?.message || null,
    };
  }
}

export async function recordOperatorExecutionAudit({
  capability,
  organizationId,
  entityId = null,
  actorId = null,
  actorName = null,
  payload = {},
  source = "text",
  outcome,
  result = null,
  error = null,
  approval = null,
  authorizationMode = null,
  authorizationOriginMode = null,
}) {
  if (!isGovernedOperatorMode(capability?.mode)) return null;

  const authorization = resolveOperatorAuthorizationProvenance({
    capability,
    source,
    approval,
    authorizationMode,
    authorizationOriginMode,
  });

  try {
    return await logAuditEvent({
      organization_id: organizationId,
      entity_type: "operator_execution",
      entity_id: entityId,
      action_type: `operator.${capability.key}.${outcome}`,
      performed_by: actorId,
      performed_by_name: actorName || "AVANTIQO_OPERATOR",
      new_data:
        outcome === "executed" && result && typeof result === "object"
          ? result
          : null,
      metadata: {
        source: "AVANTIQO_OPERATOR",
        channel: text(source) || "text",
        capability_key: capability?.key || null,
        domain: capability?.domain || null,
        capability: capability?.capability || null,
        action: capability?.action || null,
        mode: capability?.mode || null,
        risk: capability?.risk || null,
        reversible: capability?.reversible === true,
        transactional: capability?.transactional === true,
        outcome,
        authorization,
        authorization_mode: authorization.mode,
        authorization_origin_mode: authorization.origin_mode,
        conversationally_confirmed: authorization.conversationally_confirmed,
        approval_resumed: authorization.approval_resumed,
        approval,
        payload,
        error,
      },
    });
  } catch (auditError) {
    console.error("OPERATOR_EXECUTION_AUDIT_FAILED", {
      capability_key: capability?.key || null,
      organizationId,
      outcome,
      error: auditError?.message || auditError,
    });
    return null;
  }
}

export default {
  isGovernedOperatorMode,
  requiresDurableApproval,
  resolveOperatorExecutionApproval,
  resolveOperatorAuthorizationProvenance,
  recordOperatorExecutionAudit,
};
