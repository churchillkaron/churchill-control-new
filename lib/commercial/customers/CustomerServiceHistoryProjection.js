import { supabaseAdmin } from "@/lib/shared/supabase/admin";

function throwResult(result, fallback) {
  if (!result?.error) return result?.data || [];
  const error = new Error(result.error.message || fallback);
  error.status = 500;
  throw error;
}

function completedVisit(plan, occurrence) {
  const completion = occurrence?.attributes?.completion || {};
  const submission = completion.protocol_submission || {};

  return {
    id: occurrence.id,
    service_plan_id: plan.id,
    work_order_id: occurrence.work_order_id || null,
    customer_party_id: plan.customer_party_id,
    service_name: plan.service_name,
    service_category: plan.service_category || null,
    industry_key: plan.industry_key || null,
    customer_location_id: plan.customer_location_id || null,
    customer_location_name: plan.customer_location_name || null,
    occurrence_at: occurrence.occurrence_at,
    completed_at: occurrence.completed_at || completion.completed_at || null,
    status: occurrence.status,
    completion_evidence_id: completion.completion_evidence_id || null,
    assigned_staff_id: completion.assigned_staff_id || null,
    outcome: submission.outcome || null,
    follow_up_notes: submission.follow_up_notes || null,
    follow_up_required: Boolean(completion.follow_up_required),
    follow_up_work_request_id: completion.follow_up_work_request_id || null,
    protocol_submission: submission,
  };
}

export async function getCustomerServiceHistory({
  organizationId,
  entityId = null,
  partyId,
  limit = 100,
}) {
  let planQuery = supabaseAdmin
    .from("service_plans")
    .select(
      "id,organization_id,entity_id,customer_party_id,customer_location_id,customer_location_name,service_name,service_category,industry_key,status,next_service_at,last_completed_at,created_at,updated_at"
    )
    .eq("organization_id", organizationId)
    .eq("customer_party_id", partyId)
    .order("created_at", { ascending: false })
    .limit(Math.max(1, Math.min(Number(limit) || 100, 500)));

  if (entityId) {
    planQuery = planQuery.or(`entity_id.eq.${entityId},entity_id.is.null`);
  }

  const planResult = await planQuery;
  const plans = throwResult(planResult, "Unable to load customer service plans");
  const planIds = plans.map((plan) => plan.id).filter(Boolean);

  if (planIds.length === 0) {
    return {
      plans: [],
      completed_visits: [],
      open_follow_ups: [],
    };
  }

  let occurrenceQuery = supabaseAdmin
    .from("service_plan_occurrences")
    .select(
      "id,organization_id,entity_id,service_plan_id,occurrence_at,work_order_id,status,attributes,generated_at,completed_at,created_at,updated_at"
    )
    .eq("organization_id", organizationId)
    .in("service_plan_id", planIds)
    .eq("status", "completed")
    .order("completed_at", { ascending: false })
    .limit(Math.max(1, Math.min(Number(limit) || 100, 500)));

  if (entityId) {
    occurrenceQuery = occurrenceQuery.or(`entity_id.eq.${entityId},entity_id.is.null`);
  }

  const occurrenceResult = await occurrenceQuery;
  const occurrences = throwResult(
    occurrenceResult,
    "Unable to load customer service history",
  );
  const planById = new Map(plans.map((plan) => [plan.id, plan]));
  const completedVisits = occurrences
    .map((occurrence) => {
      const plan = planById.get(occurrence.service_plan_id);
      return plan ? completedVisit(plan, occurrence) : null;
    })
    .filter(Boolean);

  return {
    plans,
    completed_visits: completedVisits,
    open_follow_ups: completedVisits.filter(
      (visit) => visit.follow_up_required && visit.follow_up_work_request_id,
    ),
  };
}

export function customerServiceTimeline(serviceHistory = {}) {
  return (serviceHistory.completed_visits || []).map((visit) => ({
    id: `service:${visit.id}`,
    event_at: visit.completed_at || visit.occurrence_at,
    domain: "Service",
    type: "SERVICE_VISIT_COMPLETED",
    reference: visit.service_name || visit.work_order_id || visit.id,
    status: visit.outcome || visit.status || "completed",
    service_plan_id: visit.service_plan_id,
    work_order_id: visit.work_order_id,
    completion_evidence_id: visit.completion_evidence_id,
    follow_up_required: visit.follow_up_required,
    follow_up_work_request_id: visit.follow_up_work_request_id,
    customer_location_name: visit.customer_location_name,
    source_document_type: "SERVICE_PLAN_OCCURRENCE",
    source_document_id: visit.id,
  }));
}

export default Object.freeze({
  getCustomerServiceHistory,
  customerServiceTimeline,
});
