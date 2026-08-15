import buildForecastScenarios from "../capabilities/buildForecastScenarios";
import buildBudgetForecastScenarioAnalysis from "../capabilities/buildBudgetForecastScenarioAnalysis";
import {
  approveForecastScenarioVersion,
  createForecastScenarioVersion,
  listForecastScenarioVersions,
} from "../repositories/ForecastScenarioVersionRepository";

const SCENARIO_KINDS = new Set(["SCENARIOS", "SCENARIOS_VS_BUDGET"]);

function required(value, field) {
  const normalized = String(value || "").trim();
  if (!normalized) throw new Error(`${field} required`);
  return normalized;
}

function normalizeScenarioKind(value) {
  const kind = required(value, "scenario_kind").toUpperCase();
  if (!SCENARIO_KINDS.has(kind)) throw new Error("Invalid scenario_kind");
  return kind;
}

async function generateSnapshot({ organizationId, entityId, periodId, scenarioKind, assumptions }) {
  if (scenarioKind === "SCENARIOS_VS_BUDGET") {
    return await buildBudgetForecastScenarioAnalysis({ organizationId, entityId, periodId, assumptions });
  }
  return await buildForecastScenarios({ organization_id: organizationId, entity_id: entityId, period_id: periodId, assumptions });
}

export async function createForecastScenarioVersionDraft(input = {}) {
  const organizationId = required(input.organizationId || input.organization_id, "organization_id");
  const entityId = required(input.entityId || input.entity_id, "entity_id");
  const periodId = required(input.periodId || input.period_id, "period_id");
  const scenarioKind = normalizeScenarioKind(input.scenarioKind || input.scenario_kind);
  const snapshot = await generateSnapshot({ organizationId, entityId, periodId, scenarioKind, assumptions: input.assumptions });
  if (!snapshot?.success) throw new Error(snapshot?.error || "Forecast scenario generation failed");

  const version = await createForecastScenarioVersion({
    organizationId,
    entityId,
    periodId,
    scenarioKind,
    assumptions: input.assumptions,
    resultSnapshot: snapshot,
    forecastReady: snapshot.forecast_ready === true,
    budgetAvailable: scenarioKind === "SCENARIOS_VS_BUDGET" ? snapshot.budget_available === true : null,
    budgetComplete: scenarioKind === "SCENARIOS_VS_BUDGET" ? snapshot.budget_complete === true : null,
    currencyCode: snapshot.currency_code || null,
    sourceGeneratedAt: snapshot.generated_at || null,
    createdBy: input.createdBy || input.created_by || null,
    performedByName: input.performedByName || input.performed_by_name || "Authenticated User",
  });

  return { success: true, version };
}

export async function listForecastScenarioVersionsCommand(input = {}) {
  const organizationId = required(input.organizationId || input.organization_id, "organization_id");
  const entityId = required(input.entityId || input.entity_id, "entity_id");
  const periodId = required(input.periodId || input.period_id, "period_id");
  const scenarioKind = input.scenarioKind || input.scenario_kind ? normalizeScenarioKind(input.scenarioKind || input.scenario_kind) : null;
  const versions = await listForecastScenarioVersions({ organizationId, entityId, periodId, scenarioKind });
  return { success: true, versions };
}

export async function approveForecastScenarioVersionCommand(input = {}) {
  const organizationId = required(input.organizationId || input.organization_id, "organization_id");
  const versionId = required(input.versionId || input.version_id, "version_id");
  const approvedBy = required(input.approvedBy || input.approved_by, "approved_by");
  const version = await approveForecastScenarioVersion({
    organizationId,
    versionId,
    approvedBy,
    performedByName: input.performedByName || input.performed_by_name || "Authenticated User",
  });
  if (!version) throw new Error("Forecast scenario version not found");
  return { success: true, version };
}
