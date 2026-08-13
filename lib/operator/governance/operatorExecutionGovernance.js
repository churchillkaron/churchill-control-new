import { createApprovalRequest } from "@/lib/shared/approvals/createApprovalRequest";
import logAuditEvent from "@/lib/audit/logAuditEvent";

const APPROVAL_REQUIRED_RISKS = new Set(["critical"]);

function text(value) {
  return String(value ?? "").trim();
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
}) {
  if (!isGovernedOperatorMode(capability?.mode)) {
    return { allowed: true, governed: false, approvalRequest: null, reason: null };
  }

  if (!requiresDurableApproval(capability)) {
    return { allowed: true, governed: true, approvalRequest: null, reason: null };
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
}) {
  if (!isGovernedOperatorMode(capability?.mode)) return null;

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
  recordOperatorExecutionAudit,
};
