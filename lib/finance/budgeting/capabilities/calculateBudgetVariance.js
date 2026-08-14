import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const PAGE_SIZE = 1000;

function normalize(value) {
  return String(value || "").trim().toUpperCase();
}

function signedAmount(row, account) {
  const debit = Number(row.debit || 0);
  const credit = Number(row.credit || 0);
  return normalize(account?.normal_balance) === "CREDIT"
    ? credit - debit
    : debit - credit;
}

function keysForAccount(account) {
  return [
    account?.account_category,
    account?.account_type,
    account?.account_name,
    account?.account_code,
  ]
    .map(normalize)
    .filter(Boolean);
}

async function loadLedgerRows({
  organizationId,
  entityId,
  startDate,
  endDate,
}) {
  const rows = [];

  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabaseAdmin
      .from("general_ledger")
      .select("id, account_id, debit, credit, transaction_date")
      .eq("organization_id", organizationId)
      .eq("entity_id", entityId)
      .gte("transaction_date", startDate)
      .lte("transaction_date", endDate)
      .order("transaction_date", { ascending: true })
      .order("id", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw error;

    const page = data || [];
    rows.push(...page);

    if (page.length < PAGE_SIZE) break;
  }

  return rows;
}

export async function calculateBudgetVariance({
  organizationId,
  entityId,
  periodId,
}) {
  if (!organizationId) throw new Error("organizationId required");
  if (!entityId) throw new Error("entityId required");
  if (!periodId) throw new Error("periodId required");

  const { data: period, error: periodError } = await supabaseAdmin
    .from("accounting_periods")
    .select("id, start_date, end_date")
    .eq("organization_id", organizationId)
    .eq("entity_id", entityId)
    .eq("id", periodId)
    .maybeSingle();

  if (periodError) throw periodError;
  if (!period) throw new Error("Invalid accounting period for entity");

  const { data: budgets, error: budgetError } = await supabaseAdmin
    .from("finance_budgets")
    .select("category, amount")
    .eq("organization_id", organizationId)
    .eq("entity_id", entityId)
    .eq("period_id", periodId)
    .order("created_at", { ascending: true });

  if (budgetError) throw budgetError;
  if (!budgets?.length) return [];

  const { data: accounts, error: accountError } = await supabaseAdmin
    .from("chart_of_accounts")
    .select("id, account_code, account_name, account_category, account_type, normal_balance")
    .eq("organization_id", organizationId);

  if (accountError) throw accountError;

  const accountById = new Map(
    (accounts || []).map(account => [account.id, account])
  );
  const actualByKey = new Map();

  const ledgerRows = await loadLedgerRows({
    organizationId,
    entityId,
    startDate: period.start_date,
    endDate: period.end_date,
  });

  for (const row of ledgerRows) {
    const account = accountById.get(row.account_id);
    if (!account) continue;

    const amount = signedAmount(row, account);
    for (const key of keysForAccount(account)) {
      actualByKey.set(key, (actualByKey.get(key) || 0) + amount);
    }
  }

  return budgets.map(budget => {
    const budgetAmount = Number(budget.amount || 0);
    const actualAmount = actualByKey.get(normalize(budget.category)) || 0;
    const variance = actualAmount - budgetAmount;
    const variancePercent =
      budgetAmount > 0
        ? (variance / budgetAmount) * 100
        : 0;

    return {
      category: budget.category,
      budget: Number(budgetAmount.toFixed(2)),
      actual: Number(actualAmount.toFixed(2)),
      variance: Number(variance.toFixed(2)),
      variance_percent: Number(variancePercent.toFixed(2)),
    };
  });
}
