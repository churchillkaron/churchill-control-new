import { supabaseAdmin } from "@/lib/shared/supabase/admin";

function isCashAccount(account) {
  const category = String(account?.account_category || "").toUpperCase();
  const type = String(account?.account_type || "").toUpperCase();
  const code = String(account?.account_code || "");

  return [
    "CASH",
    "BANK",
    "CASH_AND_CASH_EQUIVALENTS",
    "CASH_EQUIVALENT",
  ].includes(type) || [
    "CASH",
    "BANK",
    "CASH_AND_CASH_EQUIVALENTS",
  ].includes(category) || code.startsWith("100") || code.startsWith("101");
}

export async function runLiquidityAnalysis({
  organizationId,
  entityId,
}) {
  if (!organizationId) {
    throw new Error("organizationId required");
  }

  if (!entityId) {
    throw new Error("entityId required");
  }

  const [ledgerResult, payableResult] = await Promise.all([
    supabaseAdmin
      .from("general_ledger")
      .select(`
        debit,
        credit,
        account_id,
        chart_of_accounts!fk_general_ledger_account(
          account_code,
          account_name,
          account_category,
          account_type
        )
      `)
      .eq("organization_id", organizationId)
      .eq("entity_id", entityId),
    supabaseAdmin
      .from("accounts_payable")
      .select("outstanding_balance, amount, status")
      .eq("organization_id", organizationId)
      .eq("entity_id", entityId),
  ]);

  if (ledgerResult.error) throw ledgerResult.error;
  if (payableResult.error) throw payableResult.error;

  let availableCash = 0;
  for (const row of ledgerResult.data || []) {
    const account = Array.isArray(row.chart_of_accounts)
      ? row.chart_of_accounts[0]
      : row.chart_of_accounts;

    if (!isCashAccount(account)) continue;

    availableCash +=
      Number(row.debit || 0) -
      Number(row.credit || 0);
  }

  let outstandingPayables = 0;
  for (const row of payableResult.data || []) {
    if (String(row.status || "").toUpperCase() === "PAID") continue;
    outstandingPayables += Number(
      row.outstanding_balance ?? row.amount ?? 0
    );
  }

  const ratio = outstandingPayables > 0
    ? availableCash / outstandingPayables
    : null;

  return {
    available_cash: availableCash,
    outstanding_payables: outstandingPayables,
    liquidity_ratio: ratio,
    liquidity_status:
      ratio === null
        ? "no_current_payables"
        : ratio >= 1
          ? "healthy"
          : ratio >= 0.5
            ? "warning"
            : "critical",
  };
}
