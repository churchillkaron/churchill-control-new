import { createServerSupabase } from "@/lib/shared/supabase/server";
import { supabase } from "@/lib/supabase";

export async function getLedgerBalances({
  tenantId,
  startDate,
  endDate,
}) {
  let query = supabase
    .from("general_ledger")
    .select(`
      account_id,
      debit,
      credit,
      chart_of_accounts!fk_general_ledger_account (
        id,
        code,
        name,
        category,
        normal_balance
      )
    `)
    .eq("tenant_id", tenantId);

  if (startDate) {
    query = query.gte(
      "transaction_date",
      startDate
    );
  }

  if (endDate) {
    query = query.lte(
      "transaction_date",
      endDate
    );
  }

  const { data, error } =
    await query;

  if (error) {
    throw error;
  }

  const grouped = {};

  for (const row of data || []) {
    const account =
      Array.isArray(
        row.chart_of_accounts
      )
        ? row.chart_of_accounts[0]
        : row.chart_of_accounts;

    if (!account) continue;

    if (!grouped[row.account_id]) {
      grouped[row.account_id] = {
        accountId:
          row.account_id,

        code:
          account.code,

        name:
          account.name,

        category:
          account.category,

        normalBalance:
          account.normal_balance,

        debit: 0,
        credit: 0,
        balance: 0,
      };
    }

    const debit =
      Number(row.debit || 0);

    const credit =
      Number(row.credit || 0);

    grouped[row.account_id].debit +=
      debit;

    grouped[row.account_id].credit +=
      credit;

    grouped[row.account_id].balance +=
      debit - credit;
  }

  return Object.values(
    grouped
  );
}
