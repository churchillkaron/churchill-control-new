import { getEmployeeOperationalEligibility } from "@/lib/people/employees/employeeOperationalEligibilityService";
import { serverOperationsApi } from "@/lib/operations/api/createServerOperationsApi";

function cleanText(value) {
  const text = String(value ?? "").trim();
  return text || null;
}

export async function assignPreferredServiceTechnician({
  context,
  workOrder,
  preferredStaffId,
  occurrenceId,
}) {
  const staffId = cleanText(preferredStaffId);
  if (!staffId || !workOrder?.id) {
    return Object.freeze({
      assigned: false,
      reason: staffId ? "work-order-required" : "no-preferred-technician",
      record: workOrder || null,
    });
  }

  if (cleanText(workOrder.assigned_to) === staffId) {
    return Object.freeze({
      assigned: true,
      reason: "already-assigned",
      record: workOrder,
    });
  }

  const eligibility = await getEmployeeOperationalEligibility({
    organizationId: context?.organization_id,
    staffId,
    entityId: context?.entity_id || workOrder.entity_id || null,
    at: workOrder.scheduled_start || new Date(),
  });

  if (!eligibility.eligible) {
    return Object.freeze({
      assigned: false,
      reason: eligibility.reason,
      record: workOrder,
      employee: eligibility.employee,
    });
  }

  const response = await serverOperationsApi.execute({
    capabilityId: "work-orders",
    command: "assign",
    context,
    payload: {
      id: workOrder.id,
      assigned_to: staffId,
      assignment_source: "service-plan-preferred-technician",
      source_domain: "service-management",
      source_type: "service-plan-occurrence-assignment",
      source_id: occurrenceId || workOrder.source_id || workOrder.id,
      idempotency_key: `service-preferred-assignment:${occurrenceId || workOrder.id}:${staffId}`,
      attributes: {
        ...(workOrder.attributes || {}),
        service_assignment: {
          preferred_staff_id: staffId,
          preferred_staff_name: eligibility.employee?.name || null,
          employment_id: eligibility.employment?.id || null,
          entity_id: eligibility.employment?.entity_id || null,
          assigned_at: new Date().toISOString(),
        },
      },
    },
  });

  if (response.status >= 400 || !response.body?.ok) {
    return Object.freeze({
      assigned: false,
      reason: response.body?.error || "operations-assignment-failed",
      record: workOrder,
      employee: eligibility.employee,
    });
  }

  return Object.freeze({
    assigned: true,
    reason: response.body.execution?.idempotent_replay ? "idempotent-replay" : "assigned",
    record: response.body.execution?.result || workOrder,
    employee: eligibility.employee,
  });
}

export default assignPreferredServiceTechnician;
