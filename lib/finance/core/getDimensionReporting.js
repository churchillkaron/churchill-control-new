import { supabase } from "@/lib/supabase";

export async function getDimensionReporting({
  tenantId,
  dimensionType,
  dimensionId,
  startDate,
  endDate,
}) {
  let query = supabase
    .from("general_ledger_entries")
    .select(`
      id,
      entry_date,
      debit,
      credit,
      balance,
      account_id,
      journal_line_dimensions (
        dimension_id,
        accounting_dimensions (
          id,
          dimension_type,
          dimension_code,
          dimension_name
        )
      ),
      chart_of_accounts (
        code,
        name,
        type
      )
    `)
    .eq("tenant_id", tenantId);

  if (startDate) {
    query = query.gte("entry_date", startDate);
  }

  if (endDate) {
    query = query.lte("entry_date", endDate);
  }

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  const filtered = [];

  for (const row of data || []) {
    const dimensions =
      row.journal_line_dimensions || [];

    let matched = false;

    for (const item of dimensions) {
      const dim =
        item.accounting_dimensions;

      if (!dim) continue;

      if (
        dimensionType &&
        dim.dimension_type !== dimensionType
      ) {
        continue;
      }

      if (
        dimensionId &&
        dim.id !== dimensionId
      ) {
        continue;
      }

      matched = true;
    }

    if (matched) {
      filtered.push(row);
    }
  }

  const grouped = {};

  for (const row of filtered) {
    const account =
      row.chart_of_accounts;

    if (!account) continue;

    if (!grouped[account.code]) {
      grouped[account.code] = {
        code: account.code,
        name: account.name,
        type: account.type,
        debit: 0,
        credit: 0,
        balance: 0,
      };
    }

    grouped[account.code].debit +=
      Number(row.debit || 0);

    grouped[account.code].credit +=
      Number(row.credit || 0);

    grouped[account.code].balance +=
      Number(row.balance || 0);
  }

  return Object.values(grouped);
}
