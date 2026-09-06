import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const EXCEPTION_OUTCOMES = new Set(["follow_up", "issue_found"]);
const SEVERITIES = new Set(["low", "medium", "high", "critical"]);
const NEXT_ACTIONS = new Set(["monitor", "revisit", "remediate", "quote", "escalate", "customer_action"]);
const ACTIVE_WORK_ORDER_STATUSES = new Set(["start", "started", "in_progress"]);
const TERMINAL_WORK_ORDER_STATUSES = new Set(["complete", "completed", "cancelled", "canceled", "archived"]);
const ACTIVE_EVIDENCE_STATUSES = new Set(["recorded", "validated"]);

function text(value) {
  return String(value ?? "").trim();
}

function normalized(value) {
  return text(value).toLowerCase().replace(/[\s-]+/g, "_");
}

function fail(message, status = 409, state = null) {
  const error = new Error(message);
  error.status = status;
  if (state) error.service_exception = state;
  throw error;
}

function assertScope(context, occurrence) {
  if (!occurrence) fail("Service occurrence not found.", 404);
  if (context?.entity_id && occurrence.entity_id && context.entity_id !== occurrence.entity_id) {
    fail("Service occurrence is outside the active entity scope.", 403);
  }
}

async function loadOccurrence({ organizationId, occurrenceId }) {
  const result = await supabaseAdmin
    .from("service_plan_occurrences")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("id", occurrenceId)
    .maybeSingle();

  if (result.error) throw result.error;
  if (!result.data) fail("Service occurrence not found.", 404);
  return result.data;
}

async function loadLinkedWorkOrder({ organizationId, workOrderId }) {
  if (!workOrderId) return null;
  const result = await supabaseAdmin
    .from("operations_records")
    .select("id,status,entity_id,attributes,updated_at")
    .eq("organization_id", organizationId)
    .eq("capability_id", "work-orders")
    .eq("id", workOrderId)
    .maybeSingle();

  if (result.error) throw result.error;
  return result.data || null;
}

async function loadEvidence({ organizationId, occurrenceId, evidenceId = null }) {
  let query = supabaseAdmin
    .from("operations_records")
    .select("id,status,source_domain,source_type,source_id,entity_id,attributes,created_at")
    .eq("organization_id", organizationId)
    .eq("capability_id", "completion-evidence")
    .eq("source_domain", "service-management")
    .eq("source_type", "service-occurrence")
    .eq("source_id", occurrenceId)
    .order("created_at", { ascending: false })
    .limit(10);

  if (evidenceId) query = query.eq("id", evidenceId);
  const result = await query;
  if (result.error) throw result.error;

  return (result.data || []).find((row) => (
    ACTIVE_EVIDENCE_STATUSES.has(normalized(row.status))
    && row.attributes?.service_completion_evidence?.readiness?.ready === true
  )) || null;
}

function currentRecord(occurrence) {
  const record = occurrence?.attributes?.service_exception;
  return record && typeof record === "object" ? record : null;
}

export function projectServiceVisitException(record = null, { evidence = null } = {}) {
  const status = normalized(record?.status);
  const outcome = normalized(record?.outcome);
  const active = Boolean(record && status !== "cleared" && EXCEPTION_OUTCOMES.has(outcome));
  const severity = normalized(record?.severity);
  const nextAction = normalized(record?.next_action);
  const summary = text(record?.summary);
  const evidenceId = text(record?.evidence_id) || text(evidence?.id) || null;
  const evidenceReady = Boolean(
    evidenceId
    && evidence
    && evidence.id === evidenceId
    && ACTIVE_EVIDENCE_STATUSES.has(normalized(evidence.status))
    && evidence.attributes?.service_completion_evidence?.readiness?.ready === true,
  );
  const fieldsReady = !active || (
    SEVERITIES.has(severity)
    && NEXT_ACTIONS.has(nextAction)
    && summary.length >= 8
  );
  const completionReady = !active || (fieldsReady && evidenceReady);

  return {
    schema_version: Number(record?.schema_version || 1),
    active,
    status: active ? "recorded" : status === "cleared" ? "cleared" : "none",
    outcome: active ? outcome : "completed",
    severity: active ? severity : null,
    next_action: active ? nextAction : null,
    summary: active ? summary : null,
    evidence_id: active ? evidenceId : null,
    evidence_ready: active ? evidenceReady : true,
    fields_ready: fieldsReady,
    completion_ready: completionReady,
    requires_manager_review: active && (severity === "high" || severity === "critical" || nextAction === "escalate"),
    recorded_at: record?.recorded_at || null,
    recorded_by: record?.recorded_by || null,
    cleared_at: record?.cleared_at || null,
    occurrence_id: record?.occurrence_id || null,
    work_order_id: record?.work_order_id || null,
  };
}

async function saveAttributesOptimistically({ context, occurrenceId, mutate }) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const occurrence = await loadOccurrence({
      organizationId: context.organization_id,
      occurrenceId,
    });
    assertScope(context, occurrence);

    const nextAttributes = mutate(occurrence);
    let query = supabaseAdmin
      .from("service_plan_occurrences")
      .update({ attributes: nextAttributes, updated_at: new Date().toISOString() })
      .eq("organization_id", context.organization_id)
      .eq("id", occurrence.id);

    if (occurrence.updated_at) query = query.eq("updated_at", occurrence.updated_at);
    const result = await query.select("*").maybeSingle();
    if (result.error) throw result.error;
    if (result.data) return result.data;
  }

  fail("This visit changed while the exception was being saved. Refresh and try again.", 409);
}

export async function getServiceVisitExceptionState({ context, occurrenceId, workOrderId = null } = {}) {
  const id = text(occurrenceId);
  if (!context?.organization_id) fail("organization_id is required.", 400);
  if (!id) fail("occurrence_id is required.", 400);

  const occurrence = await loadOccurrence({ organizationId: context.organization_id, occurrenceId: id });
  assertScope(context, occurrence);
  if (workOrderId && occurrence.work_order_id !== workOrderId) {
    fail("Selected work order does not belong to this exact service occurrence.", 409);
  }

  const workOrder = await loadLinkedWorkOrder({
    organizationId: context.organization_id,
    workOrderId: occurrence.work_order_id,
  });
  const record = currentRecord(occurrence);
  const preferredEvidenceId = text(record?.evidence_id) || null;
  const evidence = await loadEvidence({
    organizationId: context.organization_id,
    occurrenceId: occurrence.id,
    evidenceId: preferredEvidenceId,
  }) || (!preferredEvidenceId ? null : await loadEvidence({
    organizationId: context.organization_id,
    occurrenceId: occurrence.id,
  }));
  const projection = projectServiceVisitException(record, { evidence });
  const workStatus = normalized(workOrder?.status);

  return {
    ...projection,
    occurrence_id: occurrence.id,
    work_order_id: occurrence.work_order_id || null,
    visit_started: ACTIVE_WORK_ORDER_STATUSES.has(workStatus),
    visit_terminal: TERMINAL_WORK_ORDER_STATUSES.has(workStatus) || normalized(occurrence.status) === "completed",
    work_order_status: workOrder?.status || null,
    evidence_available: Boolean(evidence),
    available_evidence_id: evidence?.id || null,
  };
}

export async function recordServiceVisitException({
  context,
  occurrenceId,
  workOrderId = null,
  outcome,
  severity,
  nextAction,
  summary,
} = {}) {
  const id = text(occurrenceId);
  const normalizedOutcome = normalized(outcome);
  const normalizedSeverity = normalized(severity);
  const normalizedAction = normalized(nextAction);
  const cleanSummary = text(summary);

  if (!context?.organization_id) fail("organization_id is required.", 400);
  if (!id) fail("occurrence_id is required.", 400);
  if (!EXCEPTION_OUTCOMES.has(normalizedOutcome)) fail("Exception outcome must be follow_up or issue_found.", 400);
  if (!SEVERITIES.has(normalizedSeverity)) fail("Choose a valid exception severity.", 400);
  if (!NEXT_ACTIONS.has(normalizedAction)) fail("Choose a valid next action.", 400);
  if (cleanSummary.length < 8) fail("Describe the issue and required action in at least 8 characters.", 400);

  const initial = await loadOccurrence({ organizationId: context.organization_id, occurrenceId: id });
  assertScope(context, initial);
  if (workOrderId && initial.work_order_id !== workOrderId) {
    fail("Selected work order does not belong to this exact service occurrence.", 409);
  }
  const workOrder = await loadLinkedWorkOrder({
    organizationId: context.organization_id,
    workOrderId: initial.work_order_id,
  });
  if (!workOrder) fail("Linked service work order was not found.", 404);
  const workStatus = normalized(workOrder.status);
  if (!ACTIVE_WORK_ORDER_STATUSES.has(workStatus)) {
    fail(TERMINAL_WORK_ORDER_STATUSES.has(workStatus)
      ? "Completed visits cannot be changed."
      : "Confirm arrival before recording a site exception.", 409);
  }

  const evidence = await loadEvidence({
    organizationId: context.organization_id,
    occurrenceId: initial.id,
  });
  const now = new Date().toISOString();
  const saved = await saveAttributesOptimistically({
    context,
    occurrenceId: initial.id,
    mutate: (fresh) => {
      if (fresh.work_order_id !== initial.work_order_id) {
        fail("The linked work order changed while the exception was being saved.", 409);
      }
      const attributes = fresh.attributes || {};
      const previous = currentRecord(fresh);
      const history = Array.isArray(attributes.service_exception_history)
        ? attributes.service_exception_history.slice(-19)
        : [];
      if (previous) history.push(previous);
      return {
        ...attributes,
        service_exception_history: history,
        service_exception: {
          schema_version: 1,
          status: "recorded",
          occurrence_id: fresh.id,
          work_order_id: fresh.work_order_id,
          outcome: normalizedOutcome,
          severity: normalizedSeverity,
          next_action: normalizedAction,
          summary: cleanSummary,
          evidence_id: evidence?.id || null,
          recorded_at: now,
          recorded_by: context.actor_id || null,
        },
      };
    },
  });

  return getServiceVisitExceptionState({
    context,
    occurrenceId: saved.id,
    workOrderId: saved.work_order_id,
  });
}

export async function clearServiceVisitException({ context, occurrenceId, workOrderId = null } = {}) {
  const state = await getServiceVisitExceptionState({ context, occurrenceId, workOrderId });
  if (state.visit_terminal) fail("Completed visits cannot be changed.", 409, state);
  if (!state.visit_started) fail("Confirm arrival before changing a site exception.", 409, state);
  if (!state.active) return state;

  const now = new Date().toISOString();
  const saved = await saveAttributesOptimistically({
    context,
    occurrenceId: state.occurrence_id,
    mutate: (fresh) => {
      const attributes = fresh.attributes || {};
      const previous = currentRecord(fresh);
      const history = Array.isArray(attributes.service_exception_history)
        ? attributes.service_exception_history.slice(-19)
        : [];
      if (previous) history.push(previous);
      return {
        ...attributes,
        service_exception_history: history,
        service_exception: {
          ...(previous || {}),
          schema_version: 1,
          status: "cleared",
          occurrence_id: fresh.id,
          work_order_id: fresh.work_order_id,
          cleared_at: now,
          cleared_by: context.actor_id || null,
        },
      };
    },
  });

  return getServiceVisitExceptionState({ context, occurrenceId: saved.id, workOrderId: saved.work_order_id });
}

export async function assertServiceVisitExceptionReady({
  context,
  occurrenceId,
  requestedOutcome = "completed",
  completionEvidenceId = null,
} = {}) {
  const state = await getServiceVisitExceptionState({ context, occurrenceId });
  const requested = normalized(requestedOutcome) || "completed";

  if (!state.active) {
    if (EXCEPTION_OUTCOMES.has(requested)) {
      fail("Record the structured site exception before completing this visit as follow-up or issue found.", 409, state);
    }
    return {
      ...state,
      outcome: "completed",
      follow_up_notes: null,
      evidence_id: null,
      completion_ready: true,
    };
  }

  const occurrence = await loadOccurrence({ organizationId: context.organization_id, occurrenceId: state.occurrence_id });
  const record = currentRecord(occurrence);
  const preferredEvidenceId = text(record?.evidence_id) || text(completionEvidenceId) || null;
  const evidence = await loadEvidence({
    organizationId: context.organization_id,
    occurrenceId: occurrence.id,
    evidenceId: preferredEvidenceId,
  }) || await loadEvidence({ organizationId: context.organization_id, occurrenceId: occurrence.id });
  const projected = projectServiceVisitException(record, { evidence });

  if (!projected.fields_ready) fail("The saved site exception is incomplete. Severity, next action and a clear issue note are required.", 409, projected);
  if (!projected.evidence_ready) fail("The saved site exception needs governed occurrence-bound evidence before completion.", 409, projected);
  if (projected.occurrence_id !== occurrence.id || projected.work_order_id !== occurrence.work_order_id) {
    fail("Saved site exception does not belong to this exact service occurrence and work order.", 409, projected);
  }

  return {
    ...projected,
    occurrence_id: occurrence.id,
    work_order_id: occurrence.work_order_id,
    evidence_id: evidence.id,
    follow_up_notes: `${projected.summary} Next action: ${projected.next_action.replaceAll("_", " ")}. Severity: ${projected.severity}.`,
  };
}

export default Object.freeze({
  getServiceVisitExceptionState,
  recordServiceVisitException,
  clearServiceVisitException,
  assertServiceVisitExceptionReady,
  projectServiceVisitException,
});