import { serverOperationsApi } from "@/lib/operations/api/createServerOperationsApi";
import {
  listGeneratedServiceOccurrences,
  updateServiceOccurrence,
} from "../repositories/ServicePlanRepository";

const FOLLOW_UP_OUTCOMES = new Set(["follow_up", "issue_found"]);

function boundedLimit(value) {
  return Math.max(1, Math.min(Number(value) || 100, 500));
}

function cleanText(value) {
  const text = String(value ?? "").trim();
  return text || null;
}

function completionProjection(record = {}) {
  const staffExecution = record?.attributes?.staff_execution || {};
  const completedExecution = staffExecution.completed || {};

  return {
    completed_at: record.completed_at || completedExecution.at || new Date().toISOString(),
    completion_evidence_id: completedExecution.completion_evidence_id || null,
    protocol_submission: staffExecution.protocol_submission || null,
    assigned_staff_id: staffExecution.staff_id || record.assigned_to || null,
    work_order_status: record.status || null,
  };
}

function serviceDelivery(record = {}, occurrence = {}) {
  return record?.attributes?.service_delivery
    || occurrence?.attributes?.service_delivery
    || {};
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

export async function reconcileGeneratedServiceOccurrences({ limit = 100 } = {}) {
  const occurrences = await listGeneratedServiceOccurrences({
    limit: boundedLimit(limit),
  });
  const results = [];

  for (const occurrence of occurrences) {
    try {
      const context = {
        organization_id: occurrence.organization_id,
        entity_id: occurrence.entity_id || null,
        actor_id: null,
        permissions: [],
        system_automation: true,
      };
      const detail = await serverOperationsApi.detail({
        capabilityId: "work-orders",
        id: occurrence.work_order_id,
        context,
      });

      if (detail.status >= 400 || !detail.body?.ok) {
        throw new Error(detail.body?.error || "Unable to load service work order.");
      }

      const workOrder = detail.body.record || null;
      const status = String(workOrder?.status || "").toLowerCase();

      if (status !== "completed") {
        results.push({
          success: true,
          organization_id: occurrence.organization_id,
          service_plan_id: occurrence.service_plan_id,
          occurrence_id: occurrence.id,
          work_order_id: occurrence.work_order_id,
          reconciled: false,
          work_order_status: status || null,
        });
        continue;
      }

      const projection = completionProjection(workOrder);
      const followUpWorkRequest = await ensureFollowUpWorkRequest({
        context,
        occurrence,
        workOrder,
        projection,
      });
      const completion = {
        ...projection,
        follow_up_required: Boolean(followUpWorkRequest),
        follow_up_work_request_id: followUpWorkRequest?.id || null,
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

      results.push({
        success: true,
        organization_id: occurrence.organization_id,
        service_plan_id: occurrence.service_plan_id,
        occurrence_id: occurrence.id,
        work_order_id: occurrence.work_order_id,
        reconciled: true,
        completion_evidence_id: projection.completion_evidence_id,
        follow_up_work_request_id: followUpWorkRequest?.id || null,
        completed_at: updated.completed_at,
      });
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
    results,
  };
}

export default reconcileGeneratedServiceOccurrences;
