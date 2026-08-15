import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const TABLE = "finance_forecast_scenario_versions";

export async function listForecastScenarioVersions({
  organizationId,
  entityId,
  periodId,
  scenarioKind = null,
}) {
  let query = supabaseAdmin
    .from(TABLE)
    .select("*")
    .eq("organization_id", organizationId)
    .eq("entity_id", entityId)
    .eq("period_id", periodId)
    .order("version_number", { ascending: false });

  if (scenarioKind) query = query.eq("scenario_kind", scenarioKind);

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function listApprovedForecastScenarioVersionsForEntity({ organizationId, entityId, scenarioKind, limit = 12 }) {
  const resolvedLimit = Math.max(1, Math.min(Number(limit) || 12, 24));
  let query = supabaseAdmin
    .from(TABLE)
    .select("id, period_id, version_number, scenario_kind, approved_at")
    .eq("organization_id", organizationId)
    .eq("entity_id", entityId)
    .eq("status", "APPROVED");
  if (scenarioKind) query = query.eq("scenario_kind", scenarioKind);
  const { data, error } = await query.order("approved_at", { ascending: false }).order("version_number", { ascending: false }).limit(resolvedLimit);
  if (error) throw error;
  return data || [];
}

export async function getApprovedForecastScenarioVersion({ organizationId, entityId, periodId, scenarioKind }) {
  let query = supabaseAdmin
    .from(TABLE)
    .select("*")
    .eq("organization_id", organizationId)
    .eq("entity_id", entityId)
    .eq("period_id", periodId)
    .eq("status", "APPROVED");
  if (scenarioKind) query = query.eq("scenario_kind", scenarioKind);
  const { data, error } = await query.order("approved_at", { ascending: false }).order("version_number", { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  return data || null;
}

export async function createForecastScenarioVersion({ organizationId, entityId, periodId, scenarioKind, assumptions, resultSnapshot, forecastReady, budgetAvailable = null, budgetComplete = null, currencyCode = null, sourceGeneratedAt = null, createdBy = null, performedByName = "Authenticated User" }) {
  const { data, error } = await supabaseAdmin.rpc("finance_create_forecast_scenario_version_draft", {
    p_organization_id: organizationId,
    p_entity_id: entityId,
    p_period_id: periodId,
    p_scenario_kind: scenarioKind,
    p_assumptions: assumptions,
    p_result_snapshot: resultSnapshot,
    p_forecast_ready: forecastReady === true,
    p_budget_available: budgetAvailable,
    p_budget_complete: budgetComplete,
    p_currency_code: currencyCode,
    p_source_generated_at: sourceGeneratedAt,
    p_created_by: createdBy,
    p_performed_by_name: performedByName,
  });
  if (error) throw error;
  return Array.isArray(data) ? data[0] || null : data;
}

export async function approveForecastScenarioVersion({ organizationId, versionId, approvedBy, performedByName = "Authenticated User" }) {
  const { data, error } = await supabaseAdmin.rpc("finance_approve_forecast_scenario_version", {
    p_organization_id: organizationId,
    p_version_id: versionId,
    p_approved_by: approvedBy,
    p_performed_by_name: performedByName,
  });
  if (error) throw error;
  return Array.isArray(data) ? data[0] || null : data;
}
