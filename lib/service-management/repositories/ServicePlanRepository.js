import { supabaseAdmin } from "@/lib/shared/supabase/admin";

function requireOrganizationId(value) {
  const organizationId = String(value || "").trim();
  if (!organizationId) {
    const error = new Error("Service Management requires organization_id.");
    error.status = 400;
    throw error;
  }
  return organizationId;
}

function throwResultError(result, fallback) {
  if (!result?.error) return result;
  const error = new Error(result.error.message || fallback);
  error.code = result.error.code;
  error.details = result.error.details;
  throw error;
}

export async function listDueServicePlans({
  dueBefore = new Date().toISOString(),
  limit = 100,
} = {}) {
  const result = await supabaseAdmin
    .from("service_plans")
    .select("*")
    .eq("status", "active")
    .not("next_service_at", "is", null)
    .lte("next_service_at", dueBefore)
    .order("next_service_at", { ascending: true })
    .limit(Math.max(1, Math.min(Number(limit) || 100, 500)));

  throwResultError(result, "Unable to load due service plans.");
  return result.data || [];
}

export async function listGeneratedServiceOccurrences({ limit = 100 } = {}) {
  const result = await supabaseAdmin
    .from("service_plan_occurrences")
    .select("*")
    .eq("status", "generated")
    .not("work_order_id", "is", null)
    .order("occurrence_at", { ascending: true })
    .limit(Math.max(1, Math.min(Number(limit) || 100, 500)));

  throwResultError(result, "Unable to load generated service occurrences.");
  return result.data || [];
}

export async function listServicePlans({
  organizationId,
  entityId = null,
  customerPartyId = null,
  status = null,
  limit = 250,
}) {
  const organization_id = requireOrganizationId(organizationId);
  let query = supabaseAdmin
    .from("service_plans")
    .select("*")
    .eq("organization_id", organization_id)
    .order("next_service_at", { ascending: true })
    .limit(Math.max(1, Math.min(Number(limit) || 250, 1000)));

  if (entityId) query = query.eq("entity_id", entityId);
  if (customerPartyId) query = query.eq("customer_party_id", customerPartyId);
  if (status) query = query.eq("status", status);

  const result = await query;
  throwResultError(result, "Unable to load service plans.");
  return result.data || [];
}

export async function getServicePlan({ organizationId, planId }) {
  const organization_id = requireOrganizationId(organizationId);
  const result = await supabaseAdmin
    .from("service_plans")
    .select("*")
    .eq("organization_id", organization_id)
    .eq("id", planId)
    .maybeSingle();

  throwResultError(result, "Unable to load service plan.");
  return result.data || null;
}

export async function insertServicePlan({
  organizationId,
  entityId = null,
  actorId = null,
  plan,
  attributes = {},
}) {
  const organization_id = requireOrganizationId(organizationId);
  const result = await supabaseAdmin
    .from("service_plans")
    .insert({
      organization_id,
      entity_id: entityId || null,
      customer_party_id: plan.customer_party_id,
      customer_location_id: plan.customer_location_id,
      customer_location_name: plan.customer_location_name,
      location_timezone: plan.location_timezone,
      service_name: plan.service_name,
      service_category: plan.service_category,
      industry_key: plan.industry_key,
      execution_template_id: plan.execution_template_id,
      recurrence: plan.recurrence,
      first_service_at: plan.first_service_at,
      next_service_at: plan.first_service_at,
      duration_minutes: plan.duration_minutes,
      contract_start: plan.contract_start,
      contract_end: plan.contract_end,
      preferred_window: plan.preferred_window,
      status: "active",
      attributes,
      created_by: actorId || null,
      updated_by: actorId || null,
    })
    .select("*")
    .single();

  throwResultError(result, "Unable to create service plan.");
  return result.data;
}

export async function updateServicePlanState({
  organizationId,
  planId,
  actorId = null,
  values = {},
}) {
  const organization_id = requireOrganizationId(organizationId);
  const result = await supabaseAdmin
    .from("service_plans")
    .update({
      ...values,
      updated_by: actorId || null,
      updated_at: new Date().toISOString(),
    })
    .eq("organization_id", organization_id)
    .eq("id", planId)
    .select("*")
    .single();

  throwResultError(result, "Unable to update service plan.");
  return result.data;
}

export async function getOrCreateServiceOccurrence({
  organizationId,
  entityId = null,
  servicePlanId,
  occurrenceAt,
  generationKey,
  attributes = {},
}) {
  const organization_id = requireOrganizationId(organizationId);
  const existing = await supabaseAdmin
    .from("service_plan_occurrences")
    .select("*")
    .eq("organization_id", organization_id)
    .eq("service_plan_id", servicePlanId)
    .eq("occurrence_at", occurrenceAt)
    .maybeSingle();

  throwResultError(existing, "Unable to inspect service occurrence.");
  if (existing.data) return existing.data;

  const inserted = await supabaseAdmin
    .from("service_plan_occurrences")
    .insert({
      organization_id,
      entity_id: entityId || null,
      service_plan_id: servicePlanId,
      occurrence_at: occurrenceAt,
      original_scheduled_start: occurrenceAt,
      generation_key: generationKey,
      attributes,
      status: "pending",
    })
    .select("*")
    .single();

  if (inserted.error?.code === "23505") {
    const replay = await supabaseAdmin
      .from("service_plan_occurrences")
      .select("*")
      .eq("organization_id", organization_id)
      .eq("service_plan_id", servicePlanId)
      .eq("occurrence_at", occurrenceAt)
      .single();
    throwResultError(replay, "Unable to reload service occurrence.");
    return replay.data;
  }

  throwResultError(inserted, "Unable to create service occurrence.");
  return inserted.data;
}

export async function updateServiceOccurrence({
  organizationId,
  occurrenceId,
  values,
}) {
  const organization_id = requireOrganizationId(organizationId);
  const result = await supabaseAdmin
    .from("service_plan_occurrences")
    .update({ ...values, updated_at: new Date().toISOString() })
    .eq("organization_id", organization_id)
    .eq("id", occurrenceId)
    .select("*")
    .single();

  throwResultError(result, "Unable to update service occurrence.");
  return result.data;
}

export async function listServiceOccurrences({
  organizationId,
  planId = null,
  from = null,
  to = null,
  status = null,
  limit = 500,
}) {
  const organization_id = requireOrganizationId(organizationId);
  let query = supabaseAdmin
    .from("service_plan_occurrences")
    .select("*")
    .eq("organization_id", organization_id)
    .order("occurrence_at", { ascending: true })
    .limit(Math.max(1, Math.min(Number(limit) || 500, 2000)));

  if (planId) query = query.eq("service_plan_id", planId);
  if (from) query = query.gte("occurrence_at", from);
  if (to) query = query.lte("occurrence_at", to);
  if (status) query = query.eq("status", status);

  const result = await query;
  throwResultError(result, "Unable to load service occurrences.");
  return result.data || [];
}

export default Object.freeze({
  listDueServicePlans,
  listGeneratedServiceOccurrences,
  listServicePlans,
  getServicePlan,
  insertServicePlan,
  updateServicePlanState,
  getOrCreateServiceOccurrence,
  updateServiceOccurrence,
  listServiceOccurrences,
});
