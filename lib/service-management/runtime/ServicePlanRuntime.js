import { getCustomer } from "@/lib/commercial/customers/CustomerService";
import { serverOperationsApi } from "@/lib/operations/api/createServerOperationsApi";
import {
  createServicePlanDocument,
  servicePlanAttributes,
} from "../documents/ServicePlan";
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

function occurrenceAttributes(plan, occurrenceAt) {
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
      duration_minutes: plan.duration_minutes,
      recurrence: plan.recurrence,
    },
  };
}

function workOrderPayload(plan, occurrence, generationKey) {
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
    attributes: occurrenceAttributes(plan, scheduledStart),
  };
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

  const generationKey = buildServiceGenerationKey(plan.id, occurrenceAt);
  let occurrence = await getOrCreateServiceOccurrence({
    organizationId: runtimeContext.organization_id,
    entityId: plan.entity_id || runtimeContext.entity_id || null,
    servicePlanId: plan.id,
    occurrenceAt,
    generationKey,
    attributes: occurrenceAttributes(plan, occurrenceAt),
  });

  if (occurrence.status === "generated" && occurrence.work_order_id) {
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
    };
  }

  const operationsResponse = await serverOperationsApi.execute({
    capabilityId: "work-orders",
    command: "create",
    context: runtimeContext,
    payload: workOrderPayload(plan, occurrence, generationKey),
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

  occurrence = await updateServiceOccurrence({
    organizationId: runtimeContext.organization_id,
    occurrenceId: occurrence.id,
    values: {
      status: "generated",
      work_order_id: workOrderId,
      generated_at: new Date().toISOString(),
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
    work_order: workOrder,
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
