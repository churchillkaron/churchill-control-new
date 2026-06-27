import { createServerSupabase } from "@/lib/shared/supabase/server";
import { supabase } from "@/lib/supabase";

function categoryMatch(category, values) {
  const c =
    String(category || "")
      .toLowerCase();

  return values.some((v) =>
    c.includes(v)
  );
}

export async function generateConsolidatedReport({
  organizationIds,
  startDate,
  endDate,
}) {
  const combined = [];

  for (const organizationId of organizationIds) {
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
      .eq(
        "organization_id",
        organizationId
      );

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

    const {
      data,
      error,
    } = await query;

    if (error) {
      throw error;
    }

    combined.push(
      ...(data || [])
    );
  }

  const grouped = {};

  for (const row of combined) {
    const account =
      Array.isArray(
        row.chart_of_accounts
      )
        ? row.chart_of_accounts[0]
        : row.chart_of_accounts;

    if (!account) continue;

    if (!grouped[account.code]) {
      grouped[account.code] = {
        accountId:
          account.id,
        code:
          account.code,
        name:
          account.name,
        category:
          account.category,
        debit: 0,
        credit: 0,
        balance: 0,
      };
    }

    const debit =
      Number(row.debit || 0);

    const credit =
      Number(row.credit || 0);

    grouped[account.code].debit +=
      debit;

    grouped[account.code].credit +=
      credit;

    grouped[account.code].balance +=
      debit - credit;
  }

  let assets = 0;
  let liabilities = 0;
  let equity = 0;
  let revenue = 0;
  let cogs = 0;
  let expenses = 0;

  for (const item of Object.values(grouped)) {
    const debit =
      Number(item.debit || 0);

    const credit =
      Number(item.credit || 0);

    if (
      categoryMatch(
        item.category,
        ["asset"]
      )
    ) {
      assets += debit - credit;
    }

    else if (
      categoryMatch(
        item.category,
        ["liabil"]
      )
    ) {
      liabilities +=
        credit - debit;
    }

    else if (
      categoryMatch(
        item.category,
        ["equity"]
      )
    ) {
      equity +=
        credit - debit;
    }

    else if (
      categoryMatch(
        item.category,
        ["revenue"]
      )
    ) {
      revenue +=
        credit - debit;
    }

    else if (
      categoryMatch(
        item.category,
        ["cogs"]
      )
    ) {
      cogs +=
        debit - credit;
    }

    else if (
      categoryMatch(
        item.category,
        [
          "operating expense",
          "financial expense",
          "expense",
        ]
      )
    ) {
      expenses +=
        debit - credit;
    }
  }

  return {
    accounts:
      Object.values(
        grouped
      ),

    balanceSheet: {
      assets,
      liabilities,
      equity,
      balanced:
        Math.abs(
          assets -
            (
              liabilities +
              equity
            )
        ) < 0.01,
    },

    profitLoss: {
      revenue,
      cogs,
      grossProfit:
        revenue - cogs,
      expenses,
      netProfit:
        revenue -
        cogs -
        expenses,
    },
  };
}
