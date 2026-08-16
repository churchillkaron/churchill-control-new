import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const TABLE = "finance_forecast_scenario_versions";
const AUDIT_ENTITY_TYPE = "forecast_scenario_version";
const AUDIT_ACTIONS = [
  "FORECAST_SCENARIO_VERSION_DRAFT_CREATED",
  "FORECAST_SCENARIO_VERSION_APPROVED",
  "FORECAST_SCENARIO_VERSION_SUPERSEDED",
  "FORECAST_SCENARIO_VERSION_APPROVAL_OVERRIDE",
];

async function attachGovernanceEvidence({ organizationId, versions }) {
  const versionIds = (versions || []).map(version => version?.id).filter(Boolean);
  if (!versionIds.length) return versions || [];

  const { data, error } = await supabaseAdmin
    .from("audit_logs")
    .select("entity_id, action_type, performed_by, performed_by_name, created_at, metadata, new_data")
    .eq("organization_id", organizationId)
    .eq("entity_type", AUDIT_ENTITY_TYPE)
    .in("entity_id", versionIds)
    .in("action_type", AUDIT_ACTIONS)
    .order("created_at", { ascending: true });

  if (error) throw error;

  const evidenceByVersion = new Map();

  for (const event of data || []) {
    const versionId = event?.entity_id;
    if (!versionId) continue;

    const evidence = evidenceByVersion.get(versionId) || {};
    const actor = {
      id: event.performed_by || null,
      name: event.performed_by_name || null,
      at: event.created_at || null,
    };

    if (event.action_type === "FORECAST_SCENARIO_VERSION_DRAFT_CREATED") {
      evidence.created = actor;
    } else if (event.action_type === "FORECAST_SCENARIO_VERSION_APPROVED") {
      evidence.approved = actor;
      evidence.previous_approved_version_id = event.metadata?.previous_approved_version_id || null;
    } else if (event.action_type === "FORECAST_SCENARIO_VERSION_SUPERSEDED") {
      evidence.superseded = actor;
      evidence.superseded_by_version_id = event.metadata?.superseded_by_version_id || null;
    } else if (event.action_type === "FORECAST_SCENARIO_VERSION_APPROVAL_OVERRIDE") {
      evidence.approval_override = {
        ...actor,
        reason: event.new_data?.approval_override_reason || event.metadata?.approval_override_reason || null,
        blockers: event.new_data?.approval_policy_blockers || event.metadata?.approval_policy_blockers || [],
      };
    }

    evidenceByVersion.set(versionId, evidence);
  }

  return (versions || []).map(version => ({
    ...version,
    governance: evidenceByVersion.get(version.id) || null,
  }));
}

export async function listForecastScenarioVersions({ organizationId, entityId, periodId, scenarioKind = null }) {
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
  return await attachGovernanceEvidence({ organizationId, versions: data || [] });
}

export async function listForecastScenarioVersionsForOrganization({ organizationId } = {}) {
  if (!organizationId) throw new Error("organizationId required");

  const columns = [
    "id", "organization_id", "entity_id", "period_id", "scenario_kind", "status",
    "forecast_ready", "budget_available", "budget_complete", "currency_code", "version_number",
    "source_generated_at", "created_by", "approved_by", "approved_at", "superseded_at",
    "approval_override", "approval_override_reason", "created_at", "updated_at",
  ].join(", ");

  const rows = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabaseAdmin
      .from(TABLE)
      .select(columns)
      .eq("organization_id", organizationId)
      .order("version_number", { ascending: false })
      .range(from, from + pageSize - 1);
    if (error) throw error;
    const page = data || [];
    rows.push(...page);
    if (page.length < pageSize) break;
  }
  return rows;
}

export async function listApprovedForecastScenarioVersionsForEntity({ organizationId, entityId, scenarioKind, limit = 12 }) {
  const resolvedLimit = Math.max(1, Math.min(Number(limit) || 12, 24));
  let query = supabaseAdmin
    .from(TABLE)
    .select("id, period_id, version_number, scenario_kind, approved_at, approval_override")
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

export async function overrideForecastScenarioVersionApproval({ organizationId, versionId, approvedBy, performedByName = "Authenticated User", overrideReason }) {
  const { data, error } = await supabaseAdmin.rpc("finance_override_forecast_scenario_version_approval", {
    p_organization_id: organizationId,
    p_version_id: versionId,
    p_approved_by: approvedBy,
    p_performed_by_name: performedByName,
    p_override_reason: overrideReason,
  });
  if (error) throw error;
  return Array.isArray(data) ? data[0] || null : data;
}
