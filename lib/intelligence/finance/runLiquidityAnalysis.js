import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export async function runLiquidityAnalysis({
  organizationId,
  entityId = null,
}) {

  if (!organizationId) {
    throw new Error("organizationId required");
  }

  let ledger =
    supabaseAdmin
      .from("general_ledger")
      .select(`
        debit,
        credit,
        account_id,
        chart_of_accounts!fk_general_ledger_account(
          account_code,
          account_name,
          account_category
        )
      `)
      .eq(
        "organization_id",
        organizationId
      );

  if (entityId) {
    ledger =
      ledger.eq(
        "entity_id",
        entityId
      );
  }

  const {
    data: ledgerRows,
    error: ledgerError,
  } = await ledger;

  if (ledgerError) {
    throw ledgerError;
  }

  let cash = 0;

  for (const row of ledgerRows || []) {

    const account =
      Array.isArray(row.chart_of_accounts)
        ? row.chart_of_accounts[0]
        : row.chart_of_accounts;

    const category =
      String(
        account?.account_category || ""
      ).toUpperCase();

    const code =
      String(
        account?.account_code || ""
      );

    const isCash =
      category === "ASSET" ||
      code.startsWith("100") ||
      code.startsWith("101") ||
      code.startsWith("110");

    if (!isCash) continue;

    cash +=
      Number(row.debit || 0) -
      Number(row.credit || 0);

  }

  let po =
    supabaseAdmin
      .from("purchase_orders")
      .select("total_amount")
      .eq(
        "organization_id",
        organizationId
      );

  const {
    data: purchaseOrders,
    error: poError,
  } = await po;

  if (poError) {
    throw poError;
  }

  let liabilities = 0;

  for (const row of purchaseOrders || []) {
    liabilities += Number(
      row.total_amount || 0
    );
  }

  const ratio =
    liabilities > 0
      ? cash / liabilities
      : 999;

  return {

    available_cash:
      cash,

    short_term_liabilities:
      liabilities,

    liquidity_ratio:
      ratio,

    liquidity_status:

      ratio >= 1
        ? "healthy"
        : ratio >= 0.5
          ? "warning"
          : "critical",

  };

}
