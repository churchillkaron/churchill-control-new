import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export async function getLedgerBalances({
  organizationId,
  entityId,
  startDate,
  endDate,
}) {
  let query =
    supabaseAdmin
      .from("general_ledger")
      .select(`
        account_id,
        debit,
        credit,
        chart_of_accounts(
          account_code,
          account_name,
          account_type,
          normal_balance
        )
      `)
      .eq(
        "organization_id",
        organizationId
      )
      .eq(
        "entity_id",
        entityId
      );

  if (startDate) {
    query =
      query.gte(
        "posting_date",
        startDate
      );
  }

  if (endDate) {
    query =
      query.lte(
        "posting_date",
        endDate
      );
  }

  const {
    data,
    error,
  } = await query;

  if (error) {
    throw error;
  }

  const balances = {};

  for (const row of data || []) {

    const account =
      Array.isArray(
        row.chart_of_accounts
      )
        ? row.chart_of_accounts[0]
        : row.chart_of_accounts;

    if (!balances[row.account_id]) {
      balances[row.account_id] = {
        accountId:
          row.account_id,
        accountCode:
          account.account_code,
        accountName:
          account.account_name,
        accountType:
          account.account_type,
        normalBalance:
          account.normal_balance,
        debit: 0,
        credit: 0,
        balance: 0,
      };
    }

    balances[row.account_id].debit +=
      Number(row.debit || 0);

    balances[row.account_id].credit +=
      Number(row.credit || 0);

    balances[row.account_id].balance +=
      Number(row.debit || 0) -
      Number(row.credit || 0);
  }

  return Object.values(
    balances
  );
}
