import { serverOperationsApi } from "@/lib/operations/api/createServerOperationsApi";
import {
  getOrCreateServiceOccurrence,
  updateServiceOccurrence,
} from "@/lib/service-management/repositories/ServicePlanRepository";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const TERMINAL_OCCURRENCE_STATUSES = new Set(["completed", "cancelled", "canceled", "archived"]);

function cleanText(value) {
  const text = String(value ?? "").trim();
  return text || null;
}

function normalized(value) {
  return String(value ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_");
}

function followUpPayload(workRequest = {}) {
  return workRequest?.attributes?.service_follow_up || null;
}

async function loadOriginalOccurrence({ organizationId, occurrenceId }) {
  const result = await supabaseAdmin
    .from("service_plan_occurrences")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("id", occurrenceId)
    .maybeSingle();

  if (result.error) throw result.error;
  if (!result.data) {
    const error = new Error("Original service occurrence for this follow-up was not found.");
    error.status = 409;
    throw error;
  }
  return result.data;
}

async function loadOriginalWorkOrder({ context, workOrderId }) {
  const detail = await serverOperationsApi.detail({
    capabilityId: "work-orders",
    id: workOrderId,
    context,
  });
  if (detail.status >= 400 || !detail.body?.ok || !detail.body?.record) {
    const error = new Error(detail.body?.error || "Original service work order for this follow-up was not found.");
    error.status = detail.status || 409;
    throw error;
  }
  return detail.body.record;
}

function correctiveServiceDelivery({ followUp, originalOccurrence, originalWorkOrder }) {
  const delivery = originalWorkOrder?.attributes?.service_delivery
    || originalOccurrence?.attributes?.service_delivery
    || {};

  return {
    ...delivery,
    customer_party_id: delivery.customer_party_id || followUp.customer_party_id || null,
    customer_name: delivery.customer_name || followUp.customer_name || null,
    customer_location_id: delivery.customer_location_id || followUp.customer_location_id || null,
    customer_location_name: delivery.customer_location_name || followUp.customer_location_name || null,
    service_name: delivery.service_name || followUp.service_name || originalWorkOrder?.name || "Service follow-up",
    service_category: delivery.service_category || followUp.service_category || null,
    industry_key: delivery.industry_key || followUp.industry_key || null,
    corrective_service: true,
    originating_occurrence_id: followUp.occurrence_id,
    originating_work_order_id: followUp.originating_work_order_id,
  };
}

async function ensureCorrectiveOccurrence({
  context,
  workRequest,
  followUp,
  workOrder,
  originalOccurrence,
  serviceDelivery,
  convertedAt,
}) {
  const servicePlanId = cleanText(followUp.service_plan_id || originalOccurrence.service_plan_id);
  if (!servicePlanId) {
    const error = new Error("Service follow-up cannot create a corrective visit without the originating service plan.");
    error.status = 409;
    throw error;
  }

  const occurrenceAt = cleanText(workRequest.created_at)
    || cleanText(followUp.requested_at)
    || convertedAt;
  const generationKey = `service-follow-up:${workRequest.id}`;
  let occurrence = await getOrCreateServiceOccurrence({
    organizationId: context.organization_id,
    entityId: originalOccurrence.entity_id || workOrder.entity_id || context.entity_id || null,
    servicePlanId,
    occurrenceAt,
    generationKey,
    attributes: {
      service_delivery: serviceDelivery,
      corrective_service: {
        schema_version: 1,
        work_request_id: workRequest.id,
        originating_occurrence_id: followUp.occurrence_id,
        originating_work_order_id: followUp.originating_work_order_id,
        reason: cleanText(followUp.notes) || cleanText(workRequest.description),
        outcome: followUp.outcome || null,
        created_at: convertedAt,
      },
    },
  });

  if (occurrence.work_order_id && occurrence.work_order_id !== workOrder.id) {
    const error = new Error("Corrective service occurrence is already bound to another work order.");
    error.status = 409;
    throw error;
  }

  if (TERMINAL_OCCURRENCE_STATUSES.has(normalized(occurrence.status))) return occurrence;

  occurrence = await updateServiceOccurrence({
    organizationId: context.organization_id,
    occurrenceId: occurrence.id,
    values: {
      status: "generated",
      work_order_id: workOrder.id,
      attributes: {
        ...(occurrence.attributes || {}),
        service_delivery: serviceDelivery,
        corrective_service: {
          ...(occurrence.attributes?.corrective_service || {}),
          schema_version: 1,
          work_request_id: workRequest.id,
          corrective_work_order_id: workOrder.id,
          originating_occurrence_id: followUp.occurrence_id,
          originating_work_order_id: followUp.originating_work_order_id,
          reason: cleanText(followUp.notes) || cleanText(workRequest.description),
          outcome: followUp.outcome || null,
          converted_at: convertedAt,
        },
      },
    },
  });

  return occurrence;
}

export async function convertApprovedServiceFollowUpToWorkOrder({
  context,
  workRequestId,
}) {
  const id = cleanText(workRequestId);
  if (!context?.organization_id || !id) {
    const error = new Error("Organization and work request are required.");
    error.status = 400;
    throw error;
  }

  const detail = await serverOperationsApi.detail({
    capabilityId: "work-requests",
    id,
    context,
  });

  if (detail.status >= 400 || !detail.body?.ok) {
    const error = new Error(detail.body?.error || "Service follow-up work request was not found.");
    error.status = detail.status || 404;
    throw error;
  }

  const workRequest = detail.body.record || null;
  const status = cleanText(workRequest?.status)?.toLowerCase();
  if (status !== "approved") {
    const error = new Error("Service follow-up work request must be approved before work-order creation.");
    error.status = 409;
    throw error;
  }

  if (cleanText(workRequest?.source_domain) !== "service-management"
    || cleanText(workRequest?.source_type) !== "service-follow-up") {
    const error = new Error("Only Service Management follow-up requests can use this conversion.");
    error.status = 409;
    throw error;
  }

  const followUp = followUpPayload(workRequest);
  if (!followUp?.occurrence_id || !followUp?.originating_work_order_id) {
    const error = new Error("Service follow-up request is missing canonical service lineage.");
    error.status = 409;
    throw error;
  }

  const originalOccurrence = await loadOriginalOccurrence({
    organizationId: context.organization_id,
    occurrenceId: followUp.occurrence_id,
  });
  const originalWorkOrder = await loadOriginalWorkOrder({
    context: {
      ...context,
      entity_id: originalOccurrence.entity_id || context.entity_id || null,
      period_id: null,
    },
    workOrderId: followUp.originating_work_order_id,
  });
  const serviceDelivery = correctiveServiceDelivery({
    followUp,
    originalOccurrence,
    originalWorkOrder,
  });

  const serviceName = cleanText(followUp.service_name) || "Service follow-up";
  const customerName = cleanText(followUp.customer_name);
  const customerLocation = cleanText(followUp.customer_location_name);
  const idempotencyKey = `service-follow-up-work-order:${workRequest.id}`;
  const convertedAt = new Date().toISOString();

  const response = await serverOperationsApi.execute({
    capabilityId: "work-orders",
    command: "create",
    context: {
      ...context,
      entity_id: originalOccurrence.entity_id || context.entity_id || null,
      period_id: null,
    },
    payload: {
      name: `${serviceName} — Follow-up${customerName ? ` — ${customerName}` : ""}`,
      description:
        cleanText(followUp.notes)
        || cleanText(workRequest.description)
        || `Approved follow-up work for ${serviceName}.`,
      priority: followUp.outcome === "issue_found" ? "high" : "normal",
      source_domain: "service-management",
      source_type: "service-follow-up-work-request",
      source_id: workRequest.id,
      idempotency_key: idempotencyKey,
      attributes: {
        service_delivery: serviceDelivery,
        service_follow_up: {
          ...followUp,
          schema_version: 2,
          work_request_id: workRequest.id,
          work_request_status: workRequest.status,
          approved_follow_up: true,
          converted_at: convertedAt,
          customer_location_name: customerLocation,
        },
      },
    },
  });

  if (response.status >= 400 || !response.body?.ok) {
    const error = new Error(response.body?.error || "Unable to create follow-up work order.");
    error.status = response.status || 500;
    throw error;
  }

  const workOrder = response.body.execution?.result || null;
  if (!workOrder?.id) {
    const error = new Error("Follow-up work-order creation returned no record id.");
    error.status = 500;
    throw error;
  }

  const correctiveOccurrence = await ensureCorrectiveOccurrence({
    context,
    workRequest,
    followUp,
    workOrder,
    originalOccurrence,
    serviceDelivery,
    convertedAt,
  });

  return {
    work_request: workRequest,
    work_order: workOrder,
    corrective_occurrence: correctiveOccurrence,
    idempotent_replay: Boolean(response.body.execution?.idempotent_replay),
  };
}

export default convertApprovedServiceFollowUpToWorkOrder;