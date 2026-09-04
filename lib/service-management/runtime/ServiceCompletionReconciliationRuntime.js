import { serverOperationsApi } from "@/lib/operations/api/createServerOperationsApi";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import {
  listGeneratedServiceOccurrences,
  updateServiceOccurrence,
} from "../repositories/ServicePlanRepository";
import { consumeServiceMaterials } from "./ServiceMaterialConsumptionRuntime";

const FOLLOW_UP_OUTCOMES = new Set(["follow_up", "issue_found"]);
const COMPLETED_WORK_ORDER_STATUSES = new Set(["complete", "completed"]);

function boundedLimit(value) {
  return Math.max(1, Math.min(Number(value) || 100, 500));
}

function cleanText(value) {
  const text = String(value ?? "").trim();
  return text || null;
}

function cleanId(value, label) {
  const id = cleanText(value);
  if (id) return id;
  const error = new Error(`${label} is required.`);
  error.status = 400;
  throw error;
}

function completionProjection(record = {}) {
  const staffExecution = record?.attributes?.staff_execution || {};
  const startedExecution = staffExecution.started || {};
  const completedExecution = staffExecution.completed || {};
  const protocolSubmission = staffExecution.protocol_submission || null;

  return {
    completed_at: record.completed_at || completedExecution.at || new Date().toISOString(),
    completion_evidence_id: completedExecution.completion_evidence_id || null,
    protocol_submission: protocolSubmission,
    assigned_staff_id: staffExecution.staff_id || record.assigned_to || null,
    technician_name: cleanText(staffExecution.technician_name),
    start_gps: startedExecution.gps || staffExecution.start_gps || null,
    completion_gps: completedExecution.gps || staffExecution.completion_gps || null,
    requires_manager_review: Boolean(
      staffExecution.requires_manager_review
      || protocolSubmission?.requires_manager_review,
    ),
    work_order_status: record.status || null,
  };
}

function serviceDelivery(record = {}, occurrence = {}) {
  return record?.attributes?.service_delivery
    || occurrence?.attributes?.service_delivery
    || {};
}

async function loadServiceOccurrence({ organizationId, occurrenceId }) {
  const result = await supabaseAdmin
    .from("service_plan_occurrences")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("id", occurrenceId)
    .maybeSingle();

  if (result.error) {
    const error = new Error(result.error.message || "Unable to load service occurrence.");
    error.status = 500;
    throw error;
  }

  return result.data || null;
}

async function loadLinkedWorkOrder(occurrence) {
  if (!occurrence?.work_order_id) return null;

  const result = await supabaseAdmin
    .from("operations_records")
    .select("*")
    .eq("organization_id", occurrence.organization_id)
    .eq("capability_id", "work-orders")
    .eq("id", occurrence.work_order_id)
    .maybeSingle();

  if (result.error) {
    const error = new Error(result.error.message || "Unable to load service work order.");
    error.status = 500;
    throw error;
  }

  const workOrder = result.data || null;
  if (
    workOrder
    && occurrence.entity_id
    && workOrder.entity_id
    && occurrence.entity_id !== workOrder.entity_id
  ) {
    const error = new Error("Service occurrence and work order entity scopes do not match.");
    error.status = 409;
    throw error;
  }

  return workOrder;
}

async function ensureFollowUpWorkRequest({
  context,
  occurrence,
  workOrder,
  projection,
}) {
  const submission = projection.protocol_submission || {};
  const outcome = cleanText(submission.outcome)?.toLowerCase() || null;
  if (!FOLLOW_UP_OUTCOMES.has(outcome)) return null;

  const service = serviceDelivery(workOrder, occurrence);
  const serviceName = cleanText(service.service_name) || cleanText(workOrder?.name) || "Service";
  const customerName = cleanText(service.customer_name);
  const label = outcome === "issue_found" ? "Service issue" : "Service follow-up";
  const sourceRevision = projection.completion_evidence_id
    || cleanText(projection.completed_at)
    || cleanText(workOrder?.updated_at)
    || occurrence.id;

  const response = await serverOperationsApi.execute({
    capabilityId: "work-requests",
    command: "create",
    context,
    payload: {
      name: `${label} — ${serviceName}${customerName ? ` — ${customerName}` : ""}`,
      description:
        cleanText(submission.follow_up_notes)
        || `${label} requested from completed customer service work.`,
      source_domain: "service-management",
      source_type: "service-follow-up",
      source_id: occurrence.id,
      idempotency_key: `service-follow-up:${occurrence.id}:${sourceRevision}`,
      attributes: {
        service_follow_up: {
          schema_version: 1,
          outcome,
          service_plan_id: occurrence.service_plan_id,
          occurrence_id: occurrence.id,
          originating_work_order_id: occurrence.work_order_id,
          completion_evidence_id: projection.completion_evidence_id,
          customer_party_id: service.customer_party_id || null,
          customer_name: customerName,
          customer_location_id: service.customer_location_id || null,
          customer_location_name: service.customer_location_name || null,
          service_name: serviceName,
          service_category: service.service_category || null,
          industry_key: service.industry_key || null,
          requested_by_staff_id: projection.assigned_staff_id,
          requested_at: projection.completed_at,
          notes: cleanText(submission.follow_up_notes),
          protocol_submission: submission,
        },
      },
    },
  });

  if (response.status >= 400 || !response.body?.ok) {
    const error = new Error(
      response.body?.error || "Unable to create service follow-up work request.",
    );
    error.status = response.status || 500;
    throw error;
  }

  const workRequest = response.body.execution?.result || null;
  if (!workRequest?.id) {
    const error = new Error("Service follow-up work request returned no record id.");
    error.status = 500;
    throw error;
  }

  return workRequest;
}

async function reconcileOccurrenceRecord({ occurrence, actorId = null, permissions = [] }) {
  if (!occurrence) {
    const error = new Error("Service occurrence not found.");
    error.status = 404;
    throw error;
  }

  const existingCompletion = occurrence.attributes?.completion || null;
  if (occurrence.status === "completed" && existingCompletion) {
    return {
      success: true,
      organization_id: occurrence.organization_id,
      service_plan_id: occurrence.service_plan_id,
      occurrence_id: occurrence.id,
      work_order_id: occurrence.work_order_id,
      reconciled: false,
      already_reconciled: true,
      completion_evidence_id: existingCompletion.completion_evidence_id || null,
      follow_up_work_request_id: existingCompletion.follow_up_work_request_id || null,
      material_consumption_count: Number(existingCompletion.material_consumption_count || 0),
      completed_at: occurrence.completed_at || existingCompletion.completed_at || null,
    };
  }

  const workOrder = await loadLinkedWorkOrder(occurrence);
  if (!workOrder) {
    const error = new Error("Linked service work order was not found.");
    error.status = 404;
    throw error;
  }

  const status = String(workOrder.status || "").toLowerCase();
  if (!COMPLETED_WORK_ORDER_STATUSES.has(status)) {
    return {
      success: true,
      organization_id: occurrence.organization_id,
      service_plan_id: occurrence.service_plan_id,
      occurrence_id: occurrence.id,
      work_order_id: occurrence.work_order_id,
      reconciled: false,
      work_order_status: status || null,
    };
  }

  const context = {
    organization_id: occurrence.organization_id,
    entity_id: workOrder.entity_id || occurrence.entity_id || null,
    period_id: workOrder.period_id || null,
    actor_id: actorId || null,
    permissions,
    system_automation: true,
  };
  const projection = completionProjection(workOrder);
  const followUpWorkRequest = await ensureFollowUpWorkRequest({
    context,
    occurrence,
    workOrder,
    projection,
  });
  const materialResult = await consumeServiceMaterials({
    occurrence,
    submission: projection.protocol_submission || {},
    staffId: projection.assigned_staff_id,
  });
  const completion = {
    ...projection,
    follow_up_required: Boolean(followUpWorkRequest),
    follow_up_work_request_id: followUpWorkRequest?.id || null,
    material_consumption_count: materialResult.consumed,
    material_movements: materialResult.movements,
  };
  const updated = await updateServiceOccurrence({
    organizationId: occurrence.organization_id,
    occurrenceId: occurrence.id,
    values: {
      status: "completed",
      completed_at: projection.completed_at,
      attributes: {
        ...(occurrence.attributes || {}),
        completion,
      },
    },
  });

  return {
    success: true,
    organization_id: occurrence.organization_id,
    service_plan_id: occurrence.service_plan_id,
    occurrence_id: occurrence.id,
    work_order_id: occurrence.work_order_id,
    reconciled: true,
    completion_evidence_id: projection.completion_evidence_id,
    follow_up_work_request_id: followUpWorkRequest?.id || null,
    material_consumption_count: materialResult.consumed,
    completed_at: updated.completed_at,
  };
}

export async function reconcileServiceOccurrence({
  organizationId,
  occurrenceId,
  actorId = null,
  permissions = [],
} = {}) {
  const organization_id = cleanId(organizationId, "organization_id");
  const occurrence_id = cleanId(occurrenceId, "occurrence_id");
  const occurrence = await loadServiceOccurrence({
    organizationId: organization_id,
    occurrenceId: occurrence_id,
  });

  return reconcileOccurrenceRecord({ occurrence, actorId, permissions });
}

export async function reconcileGeneratedServiceOccurrences({ limit = 100 } = {}) {
  const occurrences = await listGeneratedServiceOccurrences({
    limit: boundedLimit(limit),
  });
  const results = [];

  for (const occurrence of occurrences) {
    try {
      results.push(await reconcileOccurrenceRecord({ occurrence }));
    } catch (error) {
      results.push({
        success: false,
        organization_id: occurrence.organization_id,
        service_plan_id: occurrence.service_plan_id,
        occurrence_id: occurrence.id,
        work_order_id: occurrence.work_order_id,
        error: error?.message || "SERVICE_COMPLETION_RECONCILIATION_FAILED",
      });
    }
  }

  return {
    success: results.every((row) => row.success),
    selected: occurrences.length,
    processed: results.filter((row) => row.success).length,
    failed: results.filter((row) => !row.success).length,
    reconciled: results.filter((row) => row.success && row.reconciled).length,
    follow_up_requests: results.filter(
      (row) => row.success && row.follow_up_work_request_id,
    ).length,
    material_movements: results.reduce(
      (total, row) => total + Number(row.material_consumption_count || 0),
      0,
    ),
    results,
  };
}

export default reconcileGeneratedServiceOccurrences;
