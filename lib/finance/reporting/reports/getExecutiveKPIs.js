import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { resolveEntity } from "@/lib/platform/entities/resolveEntity";
import { loadLedgerAccountBalances } from "@/lib/finance/reporting/reports/loadLedgerAccountBalances";

function required(value, field) {
  const normalized = String(value || "").trim();
  if (!normalized) throw new Error(`${field} required`);
  return normalized;
}

function percent(numerator, denominator) {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) {
    return null;
  }
  return Number(((numerator / denominator) * 100).toFixed(2));
}

export async function getExecutiveKPIs({
  organizationId,
  entityId,
  periodId = null,
  startDate = null,
  endDate = null,
} = {}) {
  const organization_id = required(organizationId, "organizationId");
  const entity_id = required(entityId, "entityId");
  const entity = await resolveEntity({ organizationId: organization_id, entityId: entity_id });
  if (!entity) throw new Error("Legal entity not found in organisation");

  let period = null;
  if (periodId) {
    const { data, error } = await supabaseAdmin
      .from("accounting_periods")
      .select("id, organization_id, entity_id, name, start_date, end_date")
      .eq("organization_id", organization_id)
      .eq("entity_id", entity.id)
      .eq("id", periodId)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error("Accounting period not found in selected legal entity");
    period = data;
  }

  const start_date = startDate || period?.start_date || null;
  const end_date = endDate || period?.end_date || null;
  const ledger = await loadLedgerAccountBalances({
    organizationId: organization_id,
    entityId: entity.id,
    startDate: start_date,
    endDate: end_date,
  });

  const total = classification =>
    (ledger.rows || [])
      .filter(row => row.classification === classification)
      .reduce((sum, row) => sum + Number(row.amount || 0), 0);

  const revenue = total("revenue");
  const cogs = total("cogs");
  const expenses = total("expense");
  const assets = total("asset") + total("cash");
  const liabilities = total("liability");
  const cash = total("cash");
  const grossProfit = revenue - cogs;
  const netProfit = grossProfit - expenses;
  const equity = total("equity") + netProfit;
  const currency = String(entity.currency || "").trim().toUpperCase() || null;

  const rows = [
    { id: "revenue", name: "Revenue", category: "performance", value: Number(revenue.toFixed(2)), unit: "currency", currency_code: currency },
    { id: "gross_profit", name: "Gross Profit", category: "performance", value: Number(grossProfit.toFixed(2)), unit: "currency", currency_code: currency },
    { id: "net_profit", name: "Net Profit", category: "performance", value: Number(netProfit.toFixed(2)), unit: "currency", currency_code: currency },
    { id: "gross_margin", name: "Gross Profit Margin", category: "margin", value: percent(grossProfit, revenue), unit: "percent" },
    { id: "net_margin", name: "Net Profit Margin", category: "margin", value: percent(netProfit, revenue), unit: "percent" },
    { id: "cash", name: "Cash Position", category: "liquidity", value: Number(cash.toFixed(2)), unit: "currency", currency_code: currency },
    { id: "assets", name: "Assets", category: "position", value: Number(assets.toFixed(2)), unit: "currency", currency_code: currency },
    { id: "liabilities", name: "Liabilities", category: "position", value: Number(liabilities.toFixed(2)), unit: "currency", currency_code: currency },
    { id: "equity", name: "Equity", category: "position", value: Number(equity.toFixed(2)), unit: "currency", currency_code: currency },
  ];

  return {
    success: true,
    organization_id,
    entity_id: entity.id,
    period_id: period?.id || null,
    start_date,
    end_date,
    currency_code: currency,
    rows,
    kpis: rows,
    summary: {
      revenue: Number(revenue.toFixed(2)),
      cogs: Number(cogs.toFixed(2)),
      expenses: Number(expenses.toFixed(2)),
      gross_profit: Number(grossProfit.toFixed(2)),
      net_profit: Number(netProfit.toFixed(2)),
      cash: Number(cash.toFixed(2)),
      assets: Number(assets.toFixed(2)),
      liabilities: Number(liabilities.toFixed(2)),
      equity: Number(equity.toFixed(2)),
      gross_profit_margin: percent(grossProfit, revenue),
      net_profit_margin: percent(netProfit, revenue),
    },
  };
}
