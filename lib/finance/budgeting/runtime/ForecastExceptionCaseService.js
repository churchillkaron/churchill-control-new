import {
  getForecastExceptionCaseByOccurrenceKey,
  manageForecastExceptionCase,
  resolveForecastExceptionAssignee,
  syncForecastExceptionEscalations,
} from "../repositories/ForecastExceptionCaseRepository";

const ACTIONS = new Set(["ACKNOWLEDGE", "ASSIGN", "SET_DUE_DATE", "RESOLVE"]);

function clean(value) {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

function persistedCaseToException(caseRow) {
  if (!caseRow) throw new Error("Forecast exception case not found");
  return {
    entity_id: caseRow.entity_id,
    type: caseRow.exception_type,
    occurrence_key: caseRow.occurrence_key,
    severity: caseRow.exception_severity,
    title: caseRow.exception_title,
    detail: caseRow.exception_detail,
    evidence: Array.isArray(caseRow.evidence) ? caseRow.evidence : [],
    recommended_action: caseRow.recommended_action,
  };
}

export async function syncForecastExceptionEscalationsCommand(input = {}) {
  const organizationId = clean(input.organizationId || input.organization_id);
  if (!organizationId) throw new Error("organizationId required");
  return await syncForecastExceptionEscalations({ organizationId });
}

export async function manageForecastExceptionCaseCommand(input = {}) {
  const organizationId = clean(input.organizationId || input.organization_id);
  const actorId = clean(input.performedBy || input.performed_by);
  const actorName = clean(input.performedByName || input.performed_by_name);
  const exception = input.exception || {};
  const action = String(input.action || "").trim().toUpperCase();

  if (!organizationId) throw new Error("organizationId required");
  if (!actorId) throw new Error("performedBy required");
  if (!ACTIONS.has(action)) throw new Error("Invalid forecast exception action");
  if (!exception.entity_id) throw new Error("entityId required");
  if (!exception.type) throw new Error("exceptionType required");
  if (!exception.occurrence_key) throw new Error("occurrenceKey required");

  let assignedTo = null;
  let assignedToName = null;
  if (action === "ASSIGN") {
    const assignee = await resolveForecastExceptionAssignee({
      organizationId,
      userId: clean(input.assignedTo || input.assigned_to),
    });
    assignedTo = assignee.id;
    assignedToName = assignee.name;
  }

  if (action === "RESOLVE" && !clean(input.resolutionNote || input.resolution_note)) {
    throw new Error("resolutionNote required");
  }

  const caseRow = await manageForecastExceptionCase({
    organizationId,
    entityId: exception.entity_id,
    exceptionType: exception.type,
    occurrenceKey: exception.occurrence_key,
    exceptionSeverity: exception.severity,
    exceptionTitle: exception.title,
    exceptionDetail: exception.detail,
    evidence: Array.isArray(exception.evidence) ? exception.evidence : [],
    recommendedAction: exception.recommended_action,
    action,
    assignedTo,
    assignedToName,
    dueDate: action === "SET_DUE_DATE" ? clean(input.dueDate || input.due_date) : null,
    resolutionNote:
      action === "RESOLVE" ? clean(input.resolutionNote || input.resolution_note) : null,
    performedBy: actorId,
    performedByName: actorName,
  });

  await syncForecastExceptionEscalations({ organizationId });
  return caseRow;
}

export async function managePersistedForecastExceptionCaseCommand(input = {}) {
  const organizationId = clean(input.organizationId || input.organization_id);
  const occurrenceKey = clean(input.occurrenceKey || input.occurrence_key);
  const action = String(input.action || "").trim().toUpperCase();
  if (!organizationId) throw new Error("organizationId required");
  if (!occurrenceKey) throw new Error("occurrenceKey required");

  const caseRow = await getForecastExceptionCaseByOccurrenceKey({
    organizationId,
    occurrenceKey,
  });
  if (!caseRow) throw new Error("Forecast exception case not found");

  if (input.requiredExceptionType && caseRow.exception_type !== input.requiredExceptionType) {
    throw new Error("Invalid forecast exception case type");
  }

  if (
    input.requiredExceptionType === "APPROVAL_OVERRIDE_REVIEW" &&
    action === "RESOLVE"
  ) {
    if (!caseRow.assigned_to) {
      throw new Error("Assign the override review before resolving it");
    }
    if (!caseRow.acknowledged_at || !caseRow.acknowledged_by) {
      throw new Error("Acknowledge the override review before resolving it");
    }
  }

  return await manageForecastExceptionCaseCommand({
    ...input,
    organizationId,
    exception: persistedCaseToException(caseRow),
  });
}
