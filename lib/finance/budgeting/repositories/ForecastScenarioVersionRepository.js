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

  if (scenarioKind) {
    query = query.eq("scenario_kind", scenarioKind);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function createForecastScenarioVersion({
  organizationId,
  entityId,
  periodId,
  scenarioKind,
  assumptions,
  resultSnapshot,
  forecastReady,
  budgetAvailable = null,
  budgetComplete = null,
  currencyCode = null,
  sourceGeneratedAt = null,
  createdBy = null,
}) {
  const { data, error } = await supabaseAdmin
    .from(TABLE)
    .insert({
      organization_id: organizationId,
      entity_id: entityId,
      period_id: periodId,
      scenario_kind: scenarioKind,
      status: "DRAFT",
      assumptions,
      result_snapshot: resultSnapshot,
      forecast_ready: forecastReady === true,
      budget_available: budgetAvailable,
      budget_complete: budgetComplete,
      currency_code: currencyCode,
      source_generated_at: sourceGeneratedAt,
      created_by: createdBy,
    })
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

export async function approveForecastScenarioVersion({
  organizationId,
  versionId,
  approvedBy,
}) {
  const { data, error } = await supabaseAdmin.rpc(
    "finance_approve_forecast_scenario_version",
    {
      p_organization_id: organizationId,
      p_version_id: versionId,
      p_approved_by: approvedBy,
    }
  );

  if (error) throw error;
  return Array.isArray(data) ? data[0] || null : data;
}
