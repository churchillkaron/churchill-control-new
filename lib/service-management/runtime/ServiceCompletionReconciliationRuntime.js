import { serverOperationsApi } from "@/lib/operations/api/createServerOperationsApi";
import {
  listGeneratedServiceOccurrences,
  updateServiceOccurrence,
} from "../repositories/ServicePlanRepository";

function boundedLimit(value) {
  return Math.max(1, Math.min(Number(value) || 100, 500));
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
      const updated = await updateServiceOccurrence({
        organizationId: occurrence.organization_id,
        occurrenceId: occurrence.id,
        values: {
          status: "completed",
          completed_at: projection.completed_at,
          attributes: {
            ...(occurrence.attributes || {}),
            completion: projection,
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
    results,
  };
}

export default reconcileGeneratedServiceOccurrences;
