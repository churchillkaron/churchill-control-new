import { getCustomer } from "@/lib/commercial/customers/CustomerService";
import { serverOperationsApi } from "@/lib/operations/api/createServerOperationsApi";
import { assignPreferredServiceTechnician } from "@/lib/operations/workforce/ServicePreferredAssignmentRuntime";
import {
  createServicePlanDocument,
  servicePlanAttributes,
} from "../documents/ServicePlan";
import {
  getServiceExecutionTemplate,
} from "../repositories/ServiceExecutionTemplateRepository";
import {
  buildServiceGenerationKey,
  getNextServiceOccurrence,
  scheduledEndForOccurrence,
  serviceOccurrenceWithinContract,
} from "../scheduling/ServiceRecurrence";
import {
  getOrCreateServiceOccurrence,
  getServicePlan,
  insertServicePlan,
  listServiceOccurrences,
  listServicePlans,
  updateServiceOccurrence,
  updateServicePlanState,
} from "../repositories/ServicePlanRepository";

function requireContext(context = {}) {
  if (!context.organization_id) {
    const error = new Error("Service Management requires organization_id.");
    error.status = 400;
    throw error;
  }
  return context;
}

function preferredStaff(plan = {}) {
  const delivery = plan.attributes?.service_delivery || {};
  return {
    id: plan.preferred_staff_id || delivery.preferred_staff_id || null,
    name: plan.preferred_staff_name || delivery.preferred_staff_name || null,
  };
}

function protocolSnapshot(template) {
  if (!template) return null;
  return Object.freeze({
    template_id: template.id,
    code: template.code,
    name: template.name,
    version: template.version,
    industry_key: template.industry_key,
    field_schema: Array.isArray(template.field_schema) ? template.field_schema : [],
    evidence_requirements: template.evidence_requirements || {},
    completion_rules: template.completion_rules || {},
    instructions: template.instructions || null,
    snapshotted_at: new Date().toISOString(),
  });
}

async function resolveProtocolSnapshot({ runtimeContext, plan }) {
  if (!plan.execution_template_id) return null;

  const template = await getServiceExecutionTemplate({
    organizationId: runtimeContext.organization_id,
    templateId: plan.execution_template_id,
  });

  if (!template) {
    const error = new Error("Service plan execution template was not found in this organization.");
    error.status = 409;
    throw error;
  }

  return protocolSnapshot(template);
}

function occurrenceAttributes(plan, occurrenceAt, protocol = null) {
  const preferred = preferredStaff(plan);
  return {
    service_delivery: {
      schema_version: 1,
      service_plan_id: plan.id,
      occurrence_at: occurrenceAt,
      original_scheduled_start: occurrenceAt,
      customer_party_id: plan.customer_party_id,
      customer_name: plan.attributes?.service_delivery?.customer_name || null,
      customer_location_id: plan.customer_location_id,
      customer_location_name: plan.customer_location_name,
      service_name: plan.service_name,
      service_category: plan.service_category,
      industry_key: plan.industry_key,
      execution_template_id: plan.execution_template_id,
      execution_protocol: protocol,
      preferred_staff_id: preferred.id,
      preferred_staff_name: preferred.name,
      duration_minutes: plan.duration_minutes,
      recurrence: plan.recurrence,
    },
  };
}

function workOrderPayload(plan, occurrence, generationKey, protocol = null) {
  const customerName = plan.attributes?.service_delivery?.customer_name || "Customer";
  const location = plan.customer_location_name ? ` at ${plan.customer_location_name}` : "";
  const scheduledStart = occurrence.occurrence_at;
  const scheduledEnd = scheduledEndForOccurrence(scheduledStart, plan.duration_minutes);

  return {
    name: `${plan.service_name} — ${customerName}`,
    description: `Scheduled service for ${customerName}${location}.`,
    priority: "normal",
    scheduled_start: scheduledStart,
    scheduled_end: scheduledEnd,
    due_at: scheduledEnd,
    source_domain: "service-management",
    source_type: "service-plan-occurrence",
    source_id: occurrence.id,
    idempotency_key: generationKey,
    attributes: occurrenceAttributes(plan, scheduledStart, protocol),
  };
}

async function applyPreferredAssignment({ runtimeContext, plan, occurrence, workOrder }) {
  const preferred = preferredStaff(plan);
  if (!preferred.id || !workOrder?.id) {
    return { assigned: false, reason: "no-preferred-technician", record: workOrder || null };
  }

  return assignPreferredServiceTechnician({
    context: {
      ...runtimeContext,
      entity_id: occurrence.entity_id || plan.entity_id || runtimeContext.entity_id || null,
    },
    workOrder,
    preferredStaffId: preferred.id,
    occurrenceId: occurrence.id,
  });
}

async function loadGeneratedWorkOrder({ runtimeContext, occurrence }) {
  const response = await serverOperationsApi.detail({
    capabilityId: "work-orders",
    id: occurrence.work_order_id,
    context: {
      ...runtimeContext,
      entity_id: occurrence.entity_id || runtimeContext.entity_id || null,
    },
  });

  if (response.status >= 400 || !response.body?.ok) return null;
  return response.body.record || null;
}

async function advancePlanAfterGeneratedOccurrence({
  runtimeContext,
  plan,
  occurrenceAt,
  workOrderId,
}) {
  const nextServiceAt = getNextServiceOccurrence(occurrenceAt, plan.recurrence);
  const nextWithinContract = serviceOccurrenceWithinContract(nextServiceAt, plan.contract_end);

  return updateServicePlanState({
    organizationId: runtimeContext.organization_id,
    planId: plan.id,
    actorId: runtimeContext.actor_id || null,
    values: {
      last_generated_occurrence_at: occurrenceAt,
      last_work_order_id: workOrderId,
      next_service_at: nextServiceAt,
      status: nextWithinContract ? "active" : "completed",
    },
  });
}

export async function createServicePlan({ context, input = {} }) {
  const runtimeContext = requireContext(context);
  const requestedCustomerPartyId = input.customer_party_id || input.customerPartyId;
  const customer = await getCustomer({
    organizationId: runtimeContext.organization_id,
    partyId: requestedCustomerPartyId,
  });

  if (!customer) {
    const error = new Error("Customer not found in this organization.");
    error.status = 404;
    throw error;
  }

  const plan = createServicePlanDocument({
    ...input,
    customer_party_id: customer.party_id,
    customer_name: customer.customer_name || customer.display_name || customer.name,
  });

  if (plan.execution_template_id) {
    const template = await getServiceExecutionTemplate({
      organizationId: runtimeContext.organization_id,
      templateId: plan.execution_template_id,
    });
    if (!template) {
      const error = new Error("Execution template not found in this organization.");
      error.status = 400;
      throw error;
    }
  }

  return insertServicePlan({
    organizationId: runtimeContext.organization_id,
    entityId: runtimeContext.entity_id || null,
    actorId: runtimeContext.actor_id || null,
    plan,
    attributes: servicePlanAttributes(plan),
  });
}

export async function getServicePlans({ context, filters = {} }) {
  const runtimeContext = requireContext(context);
  return listServicePlans({
    organizationId: runtimeContext.organization_id,
    entityId: filters.entity_id || filters.entityId || runtimeContext.entity_id || null,
    customerPartyId: filters.customer_party_id || filters.customerPartyId || null,
    status: filters.status || null,
    limit: filters.limit,
  });
}

export async function getServicePlanOccurrences({ context, filters = {} }) {
  const runtimeContext = requireContext(context);
  return listServiceOccurrences({
    organizationId: runtimeContext.organization_id,
    planId: filters.plan_id || filters.planId || null,
    from: filters.from || null,
    to: filters.to || null,
    status: filters.status || null,
    limit: filters.limit,
  });
}

export async function generateNextServiceVisit({ context, planId }) {
  const runtimeContext = requireContext(context);
  const plan = await getServicePlan({
    organizationId: runtimeContext.organization_id,
    planId,
  });

  if (!plan) {
    const error = new Error("Service plan not found.");
    error.status = 404;
    throw error;
  }

  if (plan.status !== "active") {
    const error = new Error(`Service plan must be active to generate work. Current status: ${plan.status}.`);
    error.status = 409;
    throw error;
  }

  const occurrenceAt = plan.next_service_at;
  if (!serviceOccurrenceWithinContract(occurrenceAt, plan.contract_end)) {
    const completed = await updateServicePlanState({
      organizationId: runtimeContext.organization_id,
      planId: plan.id,
      actorId: runtimeContext.actor_id || null,
      values: { status: "completed" },
    });
    return { generated: false, plan: completed, reason: "contract-complete" };
  }

  const protocol = await resolveProtocolSnapshot({ runtimeContext, plan });
  const generationKey = buildServiceGenerationKey(plan.id, occurrenceAt);
  let occurrence = await getOrCreateServiceOccurrence({
    organizationId: runtimeContext.organization_id,
    entityId: plan.entity_id || runtimeContext.entity_id || null,
    servicePlanId: plan.id,
    occurrenceAt,
    generationKey,
    attributes: occurrenceAttributes(plan, occurrenceAt, protocol),
  });

  if (occurrence.status === "generated" && occurrence.work_order_id) {
    const workOrder = await loadGeneratedWorkOrder({ runtimeContext, occurrence });
    const assignment = workOrder
      ? await applyPreferredAssignment({ runtimeContext, plan, occurrence, workOrder })
      : { assigned: false, reason: "work-order-not-found", record: null };
    const reconciledPlan = await advancePlanAfterGeneratedOccurrence({
      runtimeContext,
      plan,
      occurrenceAt,
      workOrderId: occurrence.work_order_id,
    });

    return {
      generated: false,
      idempotent_replay: true,
      recovered_plan_cursor: true,
      plan: reconciledPlan,
      occurrence,
      assignment,
    };
  }

  const operationsResponse = await serverOperationsApi.execute({
    capabilityId: "work-orders",
    command: "create",
    context: runtimeContext,
    payload: workOrderPayload(plan, occurrence, generationKey, protocol),
  });

  if (operationsResponse.status >= 400 || !operationsResponse.body?.ok) {
    occurrence = await updateServiceOccurrence({
      organizationId: runtimeContext.organization_id,
      occurrenceId: occurrence.id,
      values: {
        status: "failed",
        attributes: {
          ...(occurrence.attributes || {}),
          generation_error: operationsResponse.body?.error || "Operations work-order generation failed.",
        },
      },
    });
    const error = new Error(operationsResponse.body?.error || "Operations work-order generation failed.");
    error.status = operationsResponse.status || 500;
    throw error;
  }

  const workOrder = operationsResponse.body.execution?.result || null;
  const workOrderId = workOrder?.id || null;
  if (!workOrderId) {
    const error = new Error("Operations work-order generation returned no work_order_id.");
    error.status = 500;
    throw error;
  }

  const assignment = await applyPreferredAssignment({
    runtimeContext,
    plan,
    occurrence,
    workOrder,
  });

  occurrence = await updateServiceOccurrence({
    organizationId: runtimeContext.organization_id,
    occurrenceId: occurrence.id,
    values: {
      status: "generated",
      work_order_id: workOrderId,
      generated_at: new Date().toISOString(),
      attributes: {
        ...(occurrence.attributes || {}),
        assignment: {
          preferred_staff_id: preferredStaff(plan).id,
          assigned: Boolean(assignment.assigned),
          reason: assignment.reason || null,
          assigned_to: assignment.record?.assigned_to || null,
        },
      },
    },
  });

  const updatedPlan = await advancePlanAfterGeneratedOccurrence({
    runtimeContext,
    plan,
    occurrenceAt,
    workOrderId,
  });

  return {
    generated: true,
    idempotent_replay: Boolean(operationsResponse.body.execution?.idempotent_replay),
    plan: updatedPlan,
    occurrence,
    work_order: assignment.record || workOrder,
    assignment,
  };
}

export async function setServicePlanStatus({ context, planId, status }) {
  const runtimeContext = requireContext(context);
  const allowed = new Set(["active", "paused", "cancelled", "archived"]);
  if (!allowed.has(status)) {
    const error = new Error("Unsupported service plan status.");
    error.status = 400;
    throw error;
  }

  const plan = await getServicePlan({
    organizationId: runtimeContext.organization_id,
    planId,
  });
  if (!plan) {
    const error = new Error("Service plan not found.");
    error.status = 404;
    throw error;
  }

  return updateServicePlanState({
    organizationId: runtimeContext.organization_id,
    planId,
    actorId: runtimeContext.actor_id || null,
    values: { status },
  });
}

export default Object.freeze({
  createServicePlan,
  getServicePlans,
  getServicePlanOccurrences,
  generateNextServiceVisit,
  setServicePlanStatus,
});
