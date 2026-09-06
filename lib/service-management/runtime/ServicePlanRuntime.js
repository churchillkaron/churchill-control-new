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

function normalized(value) {
  return String(value ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_");
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
    required_qualification_codes: Array.isArray(template.required_qualification_codes)
      ? template.required_qualification_codes
      : [],
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

async function advancePlanAfterGeneratedOccurrence({ runtimeContext, plan, occurrenceAt, workOrderId }) {
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

  const pestControl = normalized(plan.industry_key) === "pest_control";
  if (pestControl && !plan.customer_location_name && !plan.customer_location_id) {
    const error = new Error("Pest Control service plans require a customer site before visits can be created.");
    error.status = 400;
    throw error;
  }
  if (pestControl && !plan.execution_template_id) {
    const error = new Error("Pest Control service plans require a treatment protocol before visits can be created.");
    error.status = 400;
    throw error;
  }

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
    if (pestControl && normalized(template.industry_key) !== "pest_control") {
      const error = new Error("Choose a Pest Control treatment protocol for this service plan.");
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
  const plan = await getServicePlan({ organizationId: runtimeContext.organization_id, planId });
  if (!plan) { const error = new Error("Service plan not found."); error.status = 404; throw error; }
  if (plan.status !== "active") { const error = new Error(`Service plan must be active to generate work. Current status: ${plan.status}.`); error.status = 409; throw error; }

  const occurrenceAt = plan.next_service_at;
  if (!occurrenceAt) { const error = new Error("Service plan has no next service date."); error.status = 409; throw error; }
  if (!serviceOccurrenceWithinContract(occurrenceAt, plan.contract_end)) {
    await updateServicePlanState({ organizationId: runtimeContext.organization_id, planId: plan.id, actorId: runtimeContext.actor_id || null, values: { status: "completed" } });
    const error = new Error("Next service date is outside the contract period."); error.status = 409; throw error;
  }

  const generationKey = buildServiceGenerationKey(plan.id, occurrenceAt);
  const occurrence = await getOrCreateServiceOccurrence({
    organizationId: runtimeContext.organization_id,
    entityId: plan.entity_id || runtimeContext.entity_id || null,
    planId: plan.id,
    occurrenceAt,
    generationKey,
  });
  const protocol = await resolveProtocolSnapshot({ runtimeContext, plan });

  let workOrder = occurrence.work_order_id
    ? await loadGeneratedWorkOrder({ runtimeContext, occurrence })
    : null;

  if (!workOrder) {
    const response = await serverOperationsApi.create({
      capabilityId: "work-orders",
      context: {
        ...runtimeContext,
        entity_id: occurrence.entity_id || plan.entity_id || runtimeContext.entity_id || null,
      },
      payload: workOrderPayload(plan, occurrence, generationKey, protocol),
    });
    if (response.status >= 400 || !response.body?.ok || !response.body?.record?.id) {
      const error = new Error(response.body?.error || "Unable to create service work order.");
      error.status = response.status || 500;
      throw error;
    }
    workOrder = response.body.record;
  }

  const updatedOccurrence = occurrence.work_order_id === workOrder.id
    ? occurrence
    : await updateServiceOccurrence({
        organizationId: runtimeContext.organization_id,
        occurrenceId: occurrence.id,
        actorId: runtimeContext.actor_id || null,
        values: { work_order_id: workOrder.id },
      });

  const preferredAssignment = await applyPreferredAssignment({ runtimeContext, plan, occurrence: updatedOccurrence, workOrder });
  const finalizedWorkOrder = preferredAssignment.record || workOrder;
  const updatedPlan = await advancePlanAfterGeneratedOccurrence({ runtimeContext, plan, occurrenceAt, workOrderId: finalizedWorkOrder.id });

  return {
    plan: updatedPlan,
    occurrence: updatedOccurrence,
    work_order: finalizedWorkOrder,
    preferred_assignment: preferredAssignment,
  };
}

export default Object.freeze({
  createServicePlan,
  getServicePlans,
  getServicePlanOccurrences,
  generateNextServiceVisit,
});
