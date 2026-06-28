import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export default async function generateTrialBalance({
  organization_id,
  entity_id,
  startDate,
  endDate,
}) {
  if (!organization_id) {
    throw new Error("organization_id required");
  }

  if (!entity_id) {
    throw new Error("entity_id required");
  }

  let query = supabaseAdmin
    .from("general_ledger")
    .select(`
      *,
      chart_of_accounts!fk_general_ledger_account (
        id,
        code,
        name,
        category,
        normal_balance
      )
    `)
    .eq("organization_id", organization_id)
    .eq("entity_id", entity_id);

  if (startDate) {
    query = query.gte("posting_date", startDate);
  }

  if (endDate) {
    query = query.lte("posting_date", endDate);
  }

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  const accounts = {};

  for (const line of data || []) {
    const account = Array.isArray(line.chart_of_accounts)
      ? line.chart_of_accounts[0]
      : line.chart_of_accounts;

    const accountId = account?.id || line.account_id;

    if (!accountId) {
      continue;
    }

    if (!accounts[accountId]) {
      accounts[accountId] = {
        account_id: accountId,
        code: account?.code || "",
        name: account?.name || "Unknown Account",
        category: account?.category || "",
        normal_balance: account?.normal_balance || "",
        total_debits: 0,
        total_credits: 0,
        balance: 0,
      };
    }

    const debit = Number(line.debit || 0);
    const credit = Number(line.credit || 0);

    accounts[accountId].total_debits += debit;
    accounts[accountId].total_credits += credit;
    accounts[accountId].balance += debit - credit;
  }

  const rows = Object.values(accounts).sort((a, b) =>
    String(a.code).localeCompare(String(b.code))
  );

  const totalDebits = rows.reduce(
    (sum, row) => sum + row.total_debits,
    0
  );

  const totalCredits = rows.reduce(
    (sum, row) => sum + row.total_credits,
    0
  );

  return {
    success: true,
    organizationId: organization_id,
    entityId: entity_id,
    rows,
    totalDebits,
    totalCredits,
    balanced: Math.abs(totalDebits - totalCredits) < 0.01,
  };
}
