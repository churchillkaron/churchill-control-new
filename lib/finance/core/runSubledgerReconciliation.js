import { supabase } from "@/lib/supabase";

export async function runSubledgerReconciliation({
  tenantId,
  controlType,
}) {
  let subledgerTable = null;
  let accountType = null;

  if (controlType === "AP") {
    subledgerTable = "ap_subledger";
    accountType = "liability";
  }

  if (controlType === "AR") {
    subledgerTable = "ar_subledger";
    accountType = "asset";
  }

  if (controlType === "INVENTORY") {
    subledgerTable = "inventory_subledger";
    accountType = "asset";
  }

  if (!subledgerTable) {
    throw new Error("Invalid control type");
  }

  const { data: subledgerData, error: subledgerError } =
    await supabase
      .from(subledgerTable)
      .select("*")
      .eq("tenant_id", tenantId);

  if (subledgerError) {
    throw subledgerError;
  }

  const { data: ledgerData, error: ledgerError } =
    await supabase
      .from("general_ledger_entries")
      .select(`
        debit,
        credit,
        chart_of_accounts (
          type
        )
      `)
      .eq("tenant_id", tenantId);

  if (ledgerError) {
    throw ledgerError;
  }

  let subledgerBalance = 0;

  for (const row of subledgerData || []) {
    if (controlType === "INVENTORY") {
      subledgerBalance +=
        Number(row.total_cost || 0);
    } else {
      subledgerBalance +=
        Number(row.outstanding_amount || 0);
    }
  }

  let ledgerBalance = 0;

  for (const row of ledgerData || []) {
    const type =
      row.chart_of_accounts?.type;

    if (type !== accountType) {
      continue;
    }

    ledgerBalance +=
      Number(row.debit || 0) -
      Number(row.credit || 0);
  }

  const variance =
    subledgerBalance - ledgerBalance;

  const { data, error } = await supabase
    .from("accounting_control_totals")
    .insert({
      tenant_id: tenantId,
      control_type: controlType,
      ledger_balance: ledgerBalance,
      subledger_balance: subledgerBalance,
      variance,
      status:
        Math.abs(variance) < 0.01
          ? "balanced"
          : "out_of_balance",
    })
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data;
}
