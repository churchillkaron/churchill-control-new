import { loadLedgerAccountBalances } from "@/lib/finance/reporting/reports/loadLedgerAccountBalances";
import { buildFinanceAccountHealth } from "@/lib/finance/ui/FinanceAccountHealth";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { fetchCompleteFinancePopulation } from "@/lib/finance/data/fetchCompleteFinancePopulation";

function clean(value) {
  return String(value ?? "").trim();
}

function dateKey(value) {
  return value ? String(value).slice(0, 10) : null;
}

function chunks(values, size = 200) { const rows = Array.isArray(values) ? values : []; const out = []; for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size)); return out; }

function earlierDate(left, right) {
  if (!left) return right || null;
  if (!right) return left || null;
  return left <= right ? left : right;
}

async function loadPeriod({ organizationId, entityId, periodId }) {
  if (!periodId) return null;

  const [financialResult, accountingResult] = await Promise.all([
    supabaseAdmin
      .from("financial_periods")
      .select("id,organization_id,entity_id,period_name,start_date,end_date,status,closed_at")
      .eq("id", periodId)
      .eq("organization_id", organizationId)
      .maybeSingle(),
    supabaseAdmin
      .from("accounting_periods")
      .select("id,organization_id,entity_id,period_name,start_date,end_date,status,closed_at")
      .eq("id", periodId)
      .eq("organization_id", organizationId)
      .maybeSingle(),
  ]);

  if (financialResult.error) throw financialResult.error;
  if (accountingResult.error) throw accountingResult.error;

  const candidates = [financialResult.data, accountingResult.data].filter(Boolean);
  return candidates.find((row) => !entityId || !row.entity_id || row.entity_id === entityId) || null;
}

export async function loadFinanceAccountHealthRuntime({
  organizationId,
  entityId,
  periodId,
  period = null,
  currency = null,
} = {}) {
  const orgId = clean(organizationId);
  const legalEntityId = clean(entityId);
  const accountingPeriodId = clean(periodId);
  if (!orgId || !legalEntityId || !accountingPeriodId) {
    throw new Error("organizationId, entityId and periodId are required");
  }

  const resolvedPeriod = period || await loadPeriod({
    organizationId: orgId,
    entityId: legalEntityId,
    periodId: accountingPeriodId,
  });
  const periodStart = dateKey(resolvedPeriod?.start_date);
  const periodEnd = dateKey(resolvedPeriod?.end_date);
  if (!periodStart || !periodEnd) {
    return {
      success: true,
      ready: false,
      context: {
        organization_id: orgId,
        entity_id: legalEntityId,
        period_id: accountingPeriodId,
        period_start: periodStart,
        period_end: periodEnd,
        period_status: resolvedPeriod?.status || null,
        currency: currency || null,
      },
      health: null,
    };
  }

  const today = new Date().toISOString().slice(0, 10);
  const asOfDate = earlierDate(periodEnd, today);

  const [closingResult, periodResult, bankPopulation] = await Promise.all([
    loadLedgerAccountBalances({
      organizationId: orgId,
      entityId: legalEntityId,
      startDate: null,
      endDate: asOfDate,
    }),
    loadLedgerAccountBalances({
      organizationId: orgId,
      entityId: legalEntityId,
      startDate: periodStart,
      endDate: asOfDate,
    }),
    fetchCompleteFinancePopulation({
      label: "Account Health bank accounts",
      buildQuery: (from, to) => supabaseAdmin.from("bank_accounts")
        .select("id,entity_id,finance_account_id,active,updated_at")
        .eq("organization_id", orgId)
        .order("id", { ascending: true })
        .range(from, to),
    }),
  ]);

  const bankAccounts = (bankPopulation.rows || []).filter(
    (row) => row.active !== false && (!row.entity_id || row.entity_id === legalEntityId),
  );
  const bankIds = bankAccounts.map((row) => row.id).filter(Boolean);

  let reconciliationRuns = [];
  for (const batch of chunks(bankIds)) {
    const population = await fetchCompleteFinancePopulation({
      label: "Account Health bank reconciliation runs",
      buildQuery: (from, to) => supabaseAdmin.from("finance_bank_reconciliation_runs")
        .select("id,bank_account_id,reconciliation_date,difference_amount,status,created_at")
        .eq("organization_id", orgId)
        .eq("entity_id", legalEntityId)
        .in("bank_account_id", batch)
        .lte("reconciliation_date", asOfDate)
        .order("reconciliation_date", { ascending: false })
        .order("created_at", { ascending: false })
        .order("id", { ascending: true })
        .range(from, to),
    });
    reconciliationRuns.push(...(population.rows || []));
  }
  reconciliationRuns.sort((a, b) => String(b.reconciliation_date || "").localeCompare(String(a.reconciliation_date || "")) || String(b.created_at || "").localeCompare(String(a.created_at || "")) || String(a.id).localeCompare(String(b.id)));

  const health = buildFinanceAccountHealth({
    closingResult,
    periodResult,
    bankAccounts,
    reconciliationRuns,
    periodStart,
    periodEnd,
    asOfDate,
  });

  return {
    success: true,
    ready: true,
    context: {
      organization_id: orgId,
      entity_id: legalEntityId,
      period_id: accountingPeriodId,
      period_start: periodStart,
      period_end: periodEnd,
      as_of: asOfDate,
      period_status: resolvedPeriod?.status || null,
      currency: currency || null,
    },
    health,
    generated_at: new Date().toISOString(),
  };
}
