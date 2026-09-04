export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { serverOperationsApi } from "@/lib/operations/api/createServerOperationsApi";
import {
  resolveServiceManagementContext,
  searchParamsToServiceInput,
} from "@/lib/service-management/api/resolveServiceManagementContext";
import { listServiceOccurrences } from "@/lib/service-management/repositories/ServicePlanRepository";
import { reconcileServiceOccurrence } from "@/lib/service-management/runtime/ServiceCompletionReconciliationRuntime";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const TERMINAL_OCCURRENCE_STATUSES = new Set(["completed", "cancelled", "canceled", "archived"]);
const COMPLETION_OUTCOMES = new Set(["completed", "follow_up", "issue_found"]);
const EXTERNAL_EVIDENCE_TYPES = new Set(["photo", "signature", "file"]);
const ACTIVE_EVIDENCE_STATUSES = new Set(["recorded", "validated"]);

function text(value) {
  return String(value ?? "").trim();
}

function normalized(value) {
  return text(value).toLowerCase().replace(/[\s-]+/g, "_");
}

function responseError(error, status = 500) {
  return Response.json(
    { success: false, error: error?.message || error || "Technician execution failed." },
    { status: error?.status || status },
  );
}

function serviceDelivery(occurrence = {}, workOrder = {}) {
  return workOrder.attributes?.service_delivery
    || occurrence.attributes?.service_delivery
    || {};
}

function protocolFor(occurrence = {}, workOrder = {}) {
  return serviceDelivery(occurrence, workOrder).execution_protocol || null;
}

function staffExecution(workOrder = {}) {
  return workOrder.attributes?.staff_execution || {};
}

function isPresent(value, field) {
  if (field?.type === "checkbox") return value === true;
  if (Array.isArray(value)) return value.length > 0;
  if (value === 0) return true;
  return value !== undefined && value !== null && text(value) !== "";
}

function validateProtocolCompletion({ protocol, responses, outcome, completionEvidenceId }) {
  if (!protocol) {
    const error = new Error("This visit has no snapshotted execution protocol. Attach a treatment protocol before completion.");
    error.status = 409;
    throw error;
  }

  const fields = Array.isArray(protocol.field_schema) ? protocol.field_schema : [];
  const missing = fields
    .filter((field) => field?.required && !EXTERNAL_EVIDENCE_TYPES.has(normalized(field.type)))
    .filter((field) => !isPresent(responses?.[field.key], field))
    .map((field) => field.label || field.key)
    .filter(Boolean);

  if (missing.length) {
    const error = new Error(`Required protocol fields are incomplete: ${missing.join(", ")}.`);
    error.status = 409;
    throw error;
  }

  const evidence = protocol.evidence_requirements || {};
  const externalFieldRequired = fields.some((field) => (
    field?.required && EXTERNAL_EVIDENCE_TYPES.has(normalized(field.type))
  ));
  const externalEvidenceRequired = externalFieldRequired || Object.values(evidence).some(Boolean);

  if (externalEvidenceRequired && !completionEvidenceId) {
    const error = new Error("Required service proof is not linked. Capture Completion Evidence before completing this visit.");
    error.status = 409;
    throw error;
  }

  if (protocol.completion_rules?.require_outcome && !COMPLETION_OUTCOMES.has(normalized(outcome))) {
    const error = new Error("A valid completion outcome is required.");
    error.status = 409;
    throw error;
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
  if (!result.data) {
    const error = new Error("Service occurrence not found.");
    error.status = 404;
    throw error;
  }
  return result.data;
}

async function loadWorkOrder({ context, occurrence }) {
  if (!occurrence.work_order_id) {
    const error = new Error("This service occurrence has no generated work order.");
    error.status = 409;
    throw error;
  }

  const detail = await serverOperationsApi.detail({
    capabilityId: "work-orders",
    id: occurrence.work_order_id,
    context: {
      ...context,
      entity_id: occurrence.entity_id || context.entity_id || null,
      period_id: null,
    },
  });

  if (detail.status >= 400 || !detail.body?.ok || !detail.body?.record) {
    const error = new Error(detail.body?.error || "Linked service work order could not be loaded.");
    error.status = detail.status || 404;
    throw error;
  }

  return detail.body.record;
}

async function validateLinkedCompletionEvidence({ organizationId, occurrenceId, evidenceId }) {
  if (!evidenceId) return null;

  const result = await supabaseAdmin
    .from("operations_records")
    .select("id,status,source_domain,source_type,source_id,attributes,created_at")
    .eq("organization_id", organizationId)
    .eq("capability_id", "completion-evidence")
    .eq("id", evidenceId)
    .maybeSingle();

  if (result.error) throw result.error;
  const evidence = result.data || null;
  if (!evidence) {
    const error = new Error("Linked Completion Evidence was not found in this organization.");
    error.status = 409;
    throw error;
  }
  if (
    evidence.source_domain !== "service-management"
    || evidence.source_type !== "service-occurrence"
    || evidence.source_id !== occurrenceId
  ) {
    const error = new Error("Linked Completion Evidence does not belong to this exact service occurrence.");
    error.status = 409;
    throw error;
  }
  if (!ACTIVE_EVIDENCE_STATUSES.has(normalized(evidence.status))) {
    const error = new Error(`Linked Completion Evidence is not active. Current status: ${evidence.status || "unknown"}.`);
    error.status = 409;
    throw error;
  }
  if (!evidence.attributes?.service_completion_evidence?.readiness?.ready) {
    const error = new Error("Linked Completion Evidence has not passed its governed proof preflight.");
    error.status = 409;
    throw error;
  }

  return evidence;
}

function technicianProjection(occurrence, workOrder, latestEvidence = null) {
  const delivery = serviceDelivery(occurrence, workOrder);
  const protocol = protocolFor(occurrence, workOrder);
  const execution = staffExecution(workOrder);
  const persistedCompletion = occurrence.attributes?.completion || null;
  const completion = persistedCompletion || (latestEvidence ? {
    completion_evidence_id: latestEvidence.id,
    evidence_status: latestEvidence.status,
    evidence_pending_completion: true,
  } : null);

  return {
    occurrence_id: occurrence.id,
    service_plan_id: occurrence.service_plan_id,
    occurrence_status: occurrence.status,
    occurrence_at: occurrence.occurrence_at,
    original_scheduled_start: occurrence.original_scheduled_start,
    work_order_id: workOrder.id,
    work_order_status: workOrder.status,
    allowed_commands: workOrder.allowed_commands || [],
    name: workOrder.name,
    description: workOrder.description,
    priority: workOrder.priority,
    assigned_to: workOrder.assigned_to,
    scheduled_start: workOrder.scheduled_start,
    scheduled_end: workOrder.scheduled_end,
    due_at: workOrder.due_at,
    customer_party_id: delivery.customer_party_id || null,
    customer_name: delivery.customer_name || null,
    customer_location_id: delivery.customer_location_id || null,
    customer_location_name: delivery.customer_location_name || null,
    service_name: delivery.service_name || workOrder.name || "Service",
    service_category: delivery.service_category || null,
    industry_key: delivery.industry_key || null,
    preferred_staff_id: delivery.preferred_staff_id || null,
    preferred_staff_name: delivery.preferred_staff_name || null,
    duration_minutes: delivery.duration_minutes || null,
    execution_protocol: protocol,
    staff_execution: execution,
    completion,
    latest_completion_evidence_id: latestEvidence?.id || null,
    latest_completion_evidence_status: latestEvidence?.status || null,
    latest_completion_evidence_captured_at: latestEvidence?.attributes?.service_completion_evidence?.captured_at || latestEvidence?.created_at || null,
  };
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const input = searchParamsToServiceInput(url.searchParams);
    const resolved = await resolveServiceManagementContext({ request, input });
    if (!resolved.success) return responseError(resolved.error, resolved.status || 403);

    const rows = await listServiceOccurrences({
      organizationId: resolved.context.organization_id,
      planId: input.plan_id || input.planId || null,
      from: input.from || null,
      to: input.to || null,
      status: input.status || null,
      limit: Math.min(Number(input.limit) || 250, 500),
    });
    const visible = rows.filter((row) => row.work_order_id);
    const workOrderIds = [...new Set(visible.map((row) => row.work_order_id).filter(Boolean))];
    const occurrenceIds = [...new Set(visible.map((row) => row.id).filter(Boolean))];

    let workOrders = [];
    if (workOrderIds.length) {
      let query = supabaseAdmin
        .from("operations_records")
        .select("*")
        .eq("organization_id", resolved.context.organization_id)
        .eq("capability_id", "work-orders")
        .in("id", workOrderIds);

      if (resolved.context.entity_id) {
        query = query.or(`entity_id.eq.${resolved.context.entity_id},entity_id.is.null`);
      }

      const result = await query;
      if (result.error) throw result.error;
      workOrders = result.data || [];
    }

    let evidenceRows = [];
    if (occurrenceIds.length) {
      let query = supabaseAdmin
        .from("operations_records")
        .select("id,status,source_id,attributes,created_at")
        .eq("organization_id", resolved.context.organization_id)
        .eq("capability_id", "completion-evidence")
        .eq("source_domain", "service-management")
        .eq("source_type", "service-occurrence")
        .in("source_id", occurrenceIds)
        .in("status", [...ACTIVE_EVIDENCE_STATUSES])
        .order("created_at", { ascending: false });

      if (resolved.context.entity_id) {
        query = query.or(`entity_id.eq.${resolved.context.entity_id},entity_id.is.null`);
      }

      const result = await query;
      if (result.error) throw result.error;
      evidenceRows = result.data || [];
    }

    const byId = new Map(workOrders.map((row) => [row.id, row]));
    const evidenceByOccurrence = new Map();
    for (const evidence of evidenceRows) {
      if (!evidenceByOccurrence.has(evidence.source_id)) evidenceByOccurrence.set(evidence.source_id, evidence);
    }

    const projections = visible
      .map((occurrence) => {
        const workOrder = byId.get(occurrence.work_order_id);
        return workOrder
          ? technicianProjection(occurrence, workOrder, evidenceByOccurrence.get(occurrence.id) || null)
          : null;
      })
      .filter(Boolean)
      .sort((a, b) => new Date(a.scheduled_start || a.occurrence_at || 0) - new Date(b.scheduled_start || b.occurrence_at || 0));

    return Response.json({
      success: true,
      count: projections.length,
      active_count: projections.filter((row) => !TERMINAL_OCCURRENCE_STATUSES.has(normalized(row.occurrence_status))).length,
      rows: projections,
    });
  } catch (error) {
    return responseError(error);
  }
}

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const resolved = await resolveServiceManagementContext({ request, input: body });
    if (!resolved.success) return responseError(resolved.error, resolved.status || 403);

    const occurrenceId = text(body.occurrenceId || body.occurrence_id);
    const action = normalized(body.action);
    if (!occurrenceId) return responseError("occurrence_id is required.", 400);
    if (!new Set(["start", "complete"]).has(action)) return responseError("Unsupported technician action.", 400);

    const occurrence = await loadOccurrence({
      organizationId: resolved.context.organization_id,
      occurrenceId,
    });
    const workOrder = await loadWorkOrder({ context: resolved.context, occurrence });
    const delivery = serviceDelivery(occurrence, workOrder);
    const existingExecution = staffExecution(workOrder);
    const now = new Date().toISOString();
    const runtimeContext = {
      ...resolved.context,
      entity_id: occurrence.entity_id || resolved.context.entity_id || null,
      period_id: workOrder.period_id || null,
    };

    if (action === "start") {
      if (!(workOrder.allowed_commands || []).includes("start")) {
        const error = new Error("This work order cannot be started from its current lifecycle state.");
        error.status = 409;
        throw error;
      }

      const response = await serverOperationsApi.execute({
        capabilityId: "work-orders",
        command: "start",
        context: runtimeContext,
        payload: {
          id: workOrder.id,
          started_at: now,
          attributes: {
            ...(workOrder.attributes || {}),
            staff_execution: {
              ...existingExecution,
              staff_id: workOrder.assigned_to || delivery.preferred_staff_id || null,
              technician_name: delivery.preferred_staff_name || existingExecution.technician_name || null,
              started: {
                ...(existingExecution.started || {}),
                at: now,
              },
            },
          },
        },
      });

      if (response.status >= 400 || !response.body?.ok) {
        const error = new Error(response.body?.error || "Service could not be started.");
        error.status = response.status || 500;
        throw error;
      }

      return Response.json({ success: true, action, work_order: response.body.execution?.result || null });
    }

    if (!(workOrder.allowed_commands || []).includes("complete")) {
      const error = new Error("This work order cannot be completed from its current lifecycle state.");
      error.status = 409;
      throw error;
    }

    const protocol = protocolFor(occurrence, workOrder);
    const responses = body.responses && typeof body.responses === "object" ? body.responses : {};
    const outcome = normalized(body.outcome);
    const completionEvidenceId = text(body.completionEvidenceId || body.completion_evidence_id) || null;
    validateProtocolCompletion({ protocol, responses, outcome, completionEvidenceId });
    await validateLinkedCompletionEvidence({
      organizationId: resolved.context.organization_id,
      occurrenceId: occurrence.id,
      evidenceId: completionEvidenceId,
    });

    const protocolSubmission = {
      schema_version: 1,
      template_id: protocol.template_id,
      template_version: protocol.version,
      submitted_at: now,
      responses,
      outcome,
      follow_up_notes: text(body.followUpNotes || body.follow_up_notes) || null,
      requires_manager_review: Boolean(body.requiresManagerReview || body.requires_manager_review),
    };

    const response = await serverOperationsApi.execute({
      capabilityId: "work-orders",
      command: "complete",
      context: runtimeContext,
      payload: {
        id: workOrder.id,
        completed_at: now,
        attributes: {
          ...(workOrder.attributes || {}),
          staff_execution: {
            ...existingExecution,
            staff_id: workOrder.assigned_to || delivery.preferred_staff_id || null,
            technician_name: delivery.preferred_staff_name || existingExecution.technician_name || null,
            protocol_submission: protocolSubmission,
            completed: {
              ...(existingExecution.completed || {}),
              at: now,
              completion_evidence_id: completionEvidenceId,
            },
          },
        },
      },
    });

    if (response.status >= 400 || !response.body?.ok) {
      const error = new Error(response.body?.error || "Service could not be completed.");
      error.status = response.status || 500;
      throw error;
    }

    const reconciliation = await reconcileServiceOccurrence({
      organizationId: resolved.context.organization_id,
      occurrenceId: occurrence.id,
      actorId: resolved.context.actor_id,
      permissions: resolved.context.permissions,
    });

    return Response.json({
      success: true,
      action,
      work_order: response.body.execution?.result || null,
      reconciliation,
    });
  } catch (error) {
    return responseError(error);
  }
}
