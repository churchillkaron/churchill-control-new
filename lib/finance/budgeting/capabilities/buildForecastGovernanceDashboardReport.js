import buildForecastAccuracyPortfolioReport from "./buildForecastAccuracyPortfolioReport";
import buildForecastExceptionOversightReport from "./buildForecastExceptionOversightReport";
import { listForecastScenarioVersionsForOrganization } from "../repositories/ForecastScenarioVersionRepository";
import { listForecastExceptionEscalationDeliveries } from "../repositories/ForecastExceptionEscalationDeliveryRepository";

function countBy(rows, predicate) {
  return rows.reduce((total, row) => total + (predicate(row) ? 1 : 0), 0);
}

function approvalBlockers(row) {
  const blockers = [];
  if (row.forecast_ready !== true) blockers.push("FORECAST_NOT_READY");
  if (row.scenario_kind === "SCENARIOS_VS_BUDGET") {
    if (row.budget_available !== true) blockers.push("BUDGET_UNAVAILABLE");
    else if (row.budget_complete !== true) blockers.push("BUDGET_INCOMPLETE");
  }
  return blockers;
}

function approvalSummary(versions) {
  const drafts = versions.filter(row => row.status === "DRAFT");
  const approved = versions.filter(row => row.status === "APPROVED");
  const superseded = versions.filter(row => row.status === "SUPERSEDED");

  return {
    total_versions: versions.length,
    draft_versions: drafts.length,
    ready_drafts: countBy(drafts, row => approvalBlockers(row).length === 0),
    blocked_drafts: countBy(drafts, row => approvalBlockers(row).length > 0),
    not_ready_drafts: countBy(drafts, row => row.forecast_ready !== true),
    approved_versions: approved.length,
    approved_not_ready: countBy(approved, row => row.forecast_ready !== true),
    approval_overrides: countBy(approved, row => row.approval_override === true),
    superseded_versions: superseded.length,
    budget_incomplete_drafts: countBy(
      drafts,
      row => row.scenario_kind === "SCENARIOS_VS_BUDGET" && row.budget_complete !== true
    ),
  };
}

function deliverySummary(deliveries) {
  const rows = deliveries || [];
  return {
    delivered_notifications: countBy(rows, row => Boolean(row.delivered_at)),
    assignee_deliveries: countBy(rows, row => row.recipient_kind === "ASSIGNEE" && Boolean(row.delivered_at)),
    manager_deliveries: countBy(rows, row => row.recipient_kind === "FINANCE_MANAGER" && Boolean(row.delivered_at)),
  };
}

function compactVersion(row) {
  const overrideEvidence = row.governance?.approval_override || null;
  return {
    id: row.id,
    entity_id: row.entity_id,
    period_id: row.period_id,
    scenario_kind: row.scenario_kind,
    status: row.status,
    version_number: row.version_number,
    forecast_ready: row.forecast_ready === true,
    budget_available: row.budget_available,
    budget_complete: row.budget_complete,
    currency_code: row.currency_code,
    source_generated_at: row.source_generated_at,
    approved_at: row.approved_at,
    created_at: row.created_at,
    approval_blockers: approvalBlockers(row),
    approval_override: row.approval_override === true,
    approval_override_reason: row.approval_override_reason || overrideEvidence?.reason || null,
    approval_override_by: overrideEvidence?.name || null,
    approval_override_at: overrideEvidence?.at || null,
    approval_override_blockers: overrideEvidence?.blockers || [],
  };
}

export default async function buildForecastGovernanceDashboardReport({ organizationId, limit = 12 } = {}) {
  if (!organizationId) throw new Error("organizationId required");

  const [portfolio, oversight, versions] = await Promise.all([
    buildForecastAccuracyPortfolioReport({ organizationId, limit }),
    buildForecastExceptionOversightReport({ organizationId, limit }),
    listForecastScenarioVersionsForOrganization({ organizationId }),
  ]);

  const escalationRows = [
    ...(oversight?.queues?.critical_escalations || []),
    ...(oversight?.queues?.escalated || []),
    ...(oversight?.queues?.attention || []),
  ];
  const currentRevisionByCase = new Map(
    escalationRows.filter(row => row?.case_id).map(row => [String(row.case_id), Number(row.escalation_revision || 0)])
  );
  const activeCaseIds = [...currentRevisionByCase.keys()];
  const allDeliveries = activeCaseIds.length
    ? await listForecastExceptionEscalationDeliveries({ organizationId, caseIds: activeCaseIds })
    : [];
  const deliveries = allDeliveries.filter(
    row => currentRevisionByCase.get(String(row.case_id)) === Number(row.escalation_revision || 0)
  );

  const approvals = approvalSummary(versions);
  const delivery = deliverySummary(deliveries);
  const exceptionSummary = oversight?.summary || {};
  const portfolioSummary = portfolio?.summary || {};

  const summary = {
    ...approvals,
    active_entities: portfolioSummary.active_entities || 0,
    entities_with_approved_forecasts: portfolioSummary.entities_with_approved_forecasts || 0,
    entities_without_approved_forecasts: portfolioSummary.entities_without_approved_forecasts || 0,
    entities_with_final_measurement: portfolioSummary.entities_with_final_measurement || 0,
    entities_with_measurement_errors: portfolioSummary.entities_with_measurement_errors || 0,
    unresolved_exceptions: exceptionSummary.unresolved_exceptions || 0,
    critical_escalations: exceptionSummary.critical_escalations || 0,
    escalated_exceptions: exceptionSummary.escalated_exceptions || 0,
    attention_escalations: exceptionSummary.attention_escalations || 0,
    overdue_unresolved: exceptionSummary.overdue_unresolved || 0,
    unassigned_unresolved: exceptionSummary.unassigned_unresolved || 0,
    not_yet_governed: exceptionSummary.not_yet_governed || 0,
    delivered_notifications: delivery.delivered_notifications,
    assignee_deliveries: delivery.assignee_deliveries,
    manager_deliveries: delivery.manager_deliveries,
    portfolio_revenue_error_percent: portfolioSummary.unweighted_mean_rolling_revenue_absolute_error_percent ?? null,
    portfolio_operating_profit_error_percent: portfolioSummary.unweighted_mean_rolling_operating_profit_absolute_error_percent ?? null,
  };

  const currentDrafts = versions.filter(row => row.status === "DRAFT").slice(0, 25).map(compactVersion);
  const approvedOverrides = versions
    .filter(row => row.status === "APPROVED" && row.approval_override === true)
    .slice(0, 25)
    .map(compactVersion);
  const approvedNotReady = versions
    .filter(row => row.status === "APPROVED" && row.forecast_ready !== true)
    .slice(0, 25)
    .map(compactVersion);

  const generatedAt = new Date().toISOString();
  const document = {
    title: "Forecast Governance Management Dashboard",
    entity: { id: null, name: "Organization Forecast Governance" },
    period: { id: null, name: `Current governance state with ${portfolio.history_limit || limit}-period accuracy context` },
    currency: { code: null },
    sections: [
      {
        title: "Executive Governance Summary",
        rows: [
          { label: "Active Legal Entities", value: String(summary.active_entities) },
          { label: "Entities with Approved Forecasts", value: String(summary.entities_with_approved_forecasts) },
          { label: "Approval-ready Drafts", value: String(summary.ready_drafts) },
          { label: "Policy-blocked Drafts", value: String(summary.blocked_drafts) },
          { label: "Approved with Override", value: String(summary.approval_overrides) },
          { label: "Unresolved Exceptions", value: String(summary.unresolved_exceptions) },
          { label: "Critical Escalations", value: String(summary.critical_escalations) },
          { label: "Delivered Current Escalation Notifications", value: String(summary.delivered_notifications) },
        ],
      },
      {
        title: "Approval Governance",
        rows: [
          { label: "Draft Versions", value: String(summary.draft_versions) },
          { label: "Approval-ready Drafts", value: String(summary.ready_drafts) },
          { label: "Policy-blocked Drafts", value: String(summary.blocked_drafts) },
          { label: "Forecast-not-ready Drafts", value: String(summary.not_ready_drafts) },
          { label: "Budget-incomplete Drafts", value: String(summary.budget_incomplete_drafts) },
          { label: "Approved Versions", value: String(summary.approved_versions) },
          { label: "Approved with Override", value: String(summary.approval_overrides) },
          { label: "Superseded Versions", value: String(summary.superseded_versions) },
        ],
      },
      {
        title: "Control Semantics",
        rows: [
          { label: "Normal Approval", value: "Requires forecast_ready=true; SCENARIOS_VS_BUDGET also requires budget_available=true and budget_complete=true" },
          { label: "Exceptional Override", value: "Requires Finance accounting management plus Finance configuration management, a non-empty reason, and immutable audit evidence" },
          { label: "No Composite Health Score", value: "The dashboard reports objective governance facts and canonical Finance metrics only" },
          { label: "Delivery Evidence", value: "Only delivery records matching each active case's current escalation revision are counted" },
        ],
      },
    ],
    generated_at: generatedAt,
  };

  return {
    success: true,
    organization_id: organizationId,
    history_limit: portfolio.history_limit || limit,
    summary,
    approval_readiness: {
      drafts: currentDrafts,
      approved_not_ready: approvedNotReady,
      approved_overrides: approvedOverrides,
    },
    portfolio,
    exception_oversight: oversight,
    delivery_evidence: deliveries,
    document,
    generated_at: generatedAt,
  };
}
