import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { loadLedgerAccountBalances } from "@/lib/finance/reporting/reports/loadLedgerAccountBalances";
import { getApprovedForecastScenarioVersion } from "../repositories/ForecastScenarioVersionRepository";

const APPROVED_SCENARIO_KIND = "SCENARIOS_VS_BUDGET";

function roundMoney(value) {
  if (value === null || value === undefined) return null;
  return Number(Number(value).toFixed(2));
}

function percentage(value, base) {
  if (value === null || value === undefined) return null;
  const denominator = Number(base);
  if (!Number.isFinite(denominator) || denominator === 0) return null;
  return Number(((Number(value) / Math.abs(denominator)) * 100).toFixed(2));
}

function margin(value, revenue) {
  if (value === null || value === undefined) return null;
  const denominator = Number(revenue);
  if (!Number.isFinite(denominator) || denominator === 0) return null;
  return Number(((Number(value) / denominator) * 100).toFixed(2));
}

function periodName(period) {
  if (period?.period_name) return period.period_name;
  if (period?.fiscal_year && period?.fiscal_month) {
    return `${period.fiscal_year}-${String(period.fiscal_month).padStart(2, "0")}`;
  }
  return "Selected Period";
}

function moneyRow(label, value, fallback = "Unavailable") {
  return value === null || value === undefined
    ? { label, value: fallback }
    : { label, amount: value };
}

function percentRow(label, value) {
  return {
    label,
    value:
      value === null || value === undefined
        ? "Unavailable"
        : `${Number(value).toFixed(2)}%`,
  };
}

async function loadPeriod({ organizationId, entityId, periodId }) {
  const { data, error } = await supabaseAdmin
    .from("accounting_periods")
    .select("id, period_name, fiscal_year, fiscal_month, start_date, end_date, status, closed_at, locked_at")
    .eq("organization_id", organizationId)
    .eq("entity_id", entityId)
    .eq("id", periodId)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error("Invalid accounting period for entity");
  return data;
}

async function loadEntity({ organizationId, entityId }) {
  const { data, error } = await supabaseAdmin
    .from("legal_entities")
    .select("id, legal_name, display_name, currency")
    .eq("organization_id", organizationId)
    .eq("id", entityId)
    .eq("is_active", true)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error("Invalid entity for organization");
  return data;
}

async function loadYearEndClosingJournalIds({ organizationId, entityId, period }) {
  const { data, error } = await supabaseAdmin
    .from("journal_entries")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("entity_id", entityId)
    .eq("source_module", "period_close")
    .eq("source_document", "YEAR_END_CLOSE")
    .gte("posting_date", period.start_date)
    .lte("posting_date", period.end_date);

  if (error) throw error;
  return new Set((data || []).map(row => row.id).filter(Boolean));
}

function buildActuals(ledgerLines, excludedJournalIds) {
  let revenue = 0;
  let cogs = 0;
  let operatingExpenses = 0;
  let includedLineCount = 0;
  let excludedClosingLineCount = 0;

  for (const line of ledgerLines || []) {
    if (excludedJournalIds.has(line.journal_entry_id)) {
      excludedClosingLineCount += 1;
      continue;
    }

    const debit = Number(line.debit || 0);
    const credit = Number(line.credit || 0);

    if (line.classification === "revenue") {
      revenue += credit - debit;
      includedLineCount += 1;
    } else if (line.classification === "cogs") {
      cogs += debit - credit;
      includedLineCount += 1;
    } else if (line.classification === "expense") {
      operatingExpenses += debit - credit;
      includedLineCount += 1;
    }
  }

  const grossProfit = revenue - cogs;
  const operatingProfit = grossProfit - operatingExpenses;

  return {
    revenue: roundMoney(revenue),
    cogs: roundMoney(cogs),
    gross_profit: roundMoney(grossProfit),
    operating_expenses: roundMoney(operatingExpenses),
    operating_profit: roundMoney(operatingProfit),
    gross_margin_percent: margin(grossProfit, revenue),
    operating_margin_percent: margin(operatingProfit, revenue),
    included_ledger_lines: includedLineCount,
    excluded_year_end_close_lines: excludedClosingLineCount,
  };
}

function buildMetric(actual, forecast) {
  if (forecast === null || forecast === undefined) {
    return { actual: roundMoney(actual), forecast: null, variance: null, variance_percent: null, absolute_error_percent: null };
  }

  const variance = Number(actual || 0) - Number(forecast || 0);
  const variancePercent = percentage(variance, forecast);

  return {
    actual: roundMoney(actual),
    forecast: roundMoney(forecast),
    variance: roundMoney(variance),
    variance_percent: variancePercent,
    absolute_error_percent: variancePercent === null ? null : Math.abs(variancePercent),
  };
}

function comparisonRows(comparisons) {
  const labels = [
    ["revenue", "Revenue"],
    ["cogs", "COGS / Direct Costs"],
    ["operating_expenses", "Operating Expenses"],
    ["gross_profit", "Gross Profit"],
    ["operating_profit", "Operating Profit"],
  ];

  return labels.flatMap(([key, label]) => {
    const metric = comparisons[key];
    return [
      moneyRow(`${label} — Actual`, metric.actual),
      moneyRow(`${label} — Approved Forecast`, metric.forecast),
      moneyRow(`${label} — Variance`, metric.variance),
      percentRow(`${label} — Variance %`, metric.variance_percent),
      percentRow(`${label} — Absolute Error %`, metric.absolute_error_percent),
    ];
  });
}

export default async function buildForecastAccuracyReport({ organizationId, entityId, periodId } = {}) {
  if (!organizationId) throw new Error("organizationId required");
  if (!entityId) throw new Error("entityId required");
  if (!periodId) throw new Error("periodId required");

  const [entity, period, approvedVersion] = await Promise.all([
    loadEntity({ organizationId, entityId }),
    loadPeriod({ organizationId, entityId, periodId }),
    getApprovedForecastScenarioVersion({ organizationId, entityId, periodId, scenarioKind: APPROVED_SCENARIO_KIND }),
  ]);

  const [{ ledgerLines }, excludedJournalIds] = await Promise.all([
    loadLedgerAccountBalances({ organizationId, entityId, startDate: period.start_date, endDate: period.end_date }),
    loadYearEndClosingJournalIds({ organizationId, entityId, period }),
  ]);

  const actual = buildActuals(ledgerLines, excludedJournalIds);
  const snapshot = approvedVersion?.result_snapshot || null;
  const baseScenario = Array.isArray(snapshot?.scenarios)
    ? snapshot.scenarios.find(scenario => String(scenario?.id || "").trim().toLowerCase() === "base") || null
    : null;
  const approvedForecastReady = Boolean(approvedVersion && approvedVersion.forecast_ready === true && baseScenario && baseScenario.forecast_ready === true);
  const hasActualActivity = actual.included_ledger_lines > 0;
  const periodStatus = String(period.status || "open").trim().toLowerCase();
  const periodFinal = ["closed", "locked"].includes(periodStatus);

  let accuracyReason = null;
  if (!approvedVersion) accuracyReason = "No approved SCENARIOS_VS_BUDGET forecast version exists for this entity and period";
  else if (!baseScenario) accuracyReason = "Approved forecast snapshot does not contain a Base scenario";
  else if (!approvedForecastReady) accuracyReason = "Approved Base forecast was not ready when it was approved";
  else if (!hasActualActivity) accuracyReason = "No posted revenue, COGS, or expense ledger activity exists for this period";

  const accuracyReady = approvedForecastReady && hasActualActivity;
  const approvedForecast = baseScenario
    ? {
        revenue: roundMoney(baseScenario.revenue),
        cogs: roundMoney(baseScenario.cogs),
        gross_profit: roundMoney(baseScenario.gross_profit),
        operating_expenses: roundMoney(baseScenario.operating_expenses),
        operating_profit: roundMoney(baseScenario.operating_profit),
        gross_margin_percent: baseScenario.gross_margin_percent ?? null,
        operating_margin_percent: baseScenario.operating_margin_percent ?? null,
      }
    : null;

  const comparisons = {
    revenue: buildMetric(actual.revenue, approvedForecast?.revenue),
    cogs: buildMetric(actual.cogs, approvedForecast?.cogs),
    operating_expenses: buildMetric(actual.operating_expenses, approvedForecast?.operating_expenses),
    gross_profit: buildMetric(actual.gross_profit, approvedForecast?.gross_profit),
    operating_profit: buildMetric(actual.operating_profit, approvedForecast?.operating_profit),
  };

  const accuracyStatus = accuracyReady ? (periodFinal ? "final" : "preliminary") : "unavailable";
  const generatedAt = new Date().toISOString();
  const document = {
    title: "Approved Forecast Accuracy",
    entity: { id: entity.id, name: entity.display_name || entity.legal_name || "Legal Entity" },
    period: { id: period.id, name: periodName(period), start_date: period.start_date, end_date: period.end_date, status: period.status || null },
    currency: { code: entity.currency || approvedVersion?.currency_code || null },
    sections: [
      {
        title: "Accuracy Status",
        rows: [
          { label: "Accuracy Status", value: accuracyStatus === "final" ? "Final — accounting period is closed or locked" : accuracyStatus === "preliminary" ? "Preliminary — accounting period remains open" : "Unavailable" },
          { label: "Accounting Period Status", value: period.status || "open" },
          { label: "Approved Forecast Source", value: approvedVersion ? `SCENARIOS_VS_BUDGET v${approvedVersion.version_number}` : "None" },
          ...(accuracyReason ? [{ label: "Accuracy Reason", value: accuracyReason }] : []),
          { label: "Included P&L Ledger Lines", value: String(actual.included_ledger_lines) },
          { label: "Excluded Year-end Closing Lines", value: String(actual.excluded_year_end_close_lines) },
        ],
      },
      { title: "Actual vs Approved Base Forecast", rows: accuracyReady ? comparisonRows(comparisons) : [{ label: "Comparison", value: accuracyReason || "Forecast accuracy is unavailable" }] },
      {
        title: "Actual Period P&L",
        rows: [
          moneyRow("Revenue", actual.revenue), moneyRow("COGS / Direct Costs", actual.cogs), moneyRow("Gross Profit", actual.gross_profit),
          moneyRow("Operating Expenses", actual.operating_expenses), moneyRow("Operating Profit", actual.operating_profit),
          percentRow("Gross Margin", actual.gross_margin_percent), percentRow("Operating Margin", actual.operating_margin_percent),
        ],
      },
      {
        title: "Forecast Evidence",
        rows: [
          { label: "Approved Version", value: approvedVersion ? `v${approvedVersion.version_number}` : "Unavailable" },
          { label: "Approved At", value: approvedVersion?.approved_at || "Unavailable" },
          { label: "Snapshot Generated At", value: approvedVersion?.source_generated_at || snapshot?.generated_at || "Unavailable" },
          { label: "Variance Convention", value: "Actual minus approved forecast; positive cost variance means actual cost exceeded forecast" },
          { label: "Absolute Error % Basis", value: "Absolute actual-to-forecast variance divided by the absolute approved forecast amount" },
          { label: "Closing Treatment", value: "YEAR_END_CLOSE transfer journals are excluded so closed nominal accounts do not erase period P&L; other legitimate close adjustments remain included" },
        ],
      },
    ],
    generated_at: generatedAt,
  };

  return {
    success: true,
    accuracy_ready: accuracyReady,
    accuracy_status: accuracyStatus,
    accuracy_reason: accuracyReason,
    period_final: periodFinal,
    organization_id: organizationId,
    entity_id: entityId,
    period_id: periodId,
    currency_code: entity.currency || approvedVersion?.currency_code || null,
    actual,
    approved_forecast: approvedForecast,
    comparisons: accuracyReady ? comparisons : null,
    approved_version: approvedVersion ? { id: approvedVersion.id, version_number: approvedVersion.version_number, scenario_kind: approvedVersion.scenario_kind, status: approvedVersion.status, approved_at: approvedVersion.approved_at, source_generated_at: approvedVersion.source_generated_at } : null,
    document,
    generated_at: generatedAt,
  };
}
