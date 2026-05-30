import {
  createJournalEntry,
} from "@/lib/finance/accounting/createJournalEntry";

import { supabaseAdmin }
from "@/lib/shared/supabase/admin";

export async function periodCloseWorkflow(
  payload
) {

  console.log(
    "[WORKFLOW] PERIOD_CLOSE",
    payload?.period
  );

  const tenantId =
    payload?.tenantId;

  const period =
    payload?.period;

  if (!period) {

    throw new Error(
      "PERIOD_REQUIRED"
    );

  }

  // -------------------------
  // LOAD P&L DATA
  // -------------------------

  const {
    data: ledger,
    error,
  } = await supabaseAdmin

    .from("general_ledger")

    .select(`
      *,
      chart_of_accounts!fk_general_ledger_account (
        id,
        code,
        name,
        category
      )
    `)

    .eq(
      "tenant_id",
      tenantId
    )

    .eq(
      "posting_period",
      period
    );

  if (error) {

    throw error;

  }

  let netIncome = 0;

  for (const line of ledger || []) {

    const account =
      Array.isArray(
        line.chart_of_accounts
      )
        ? line.chart_of_accounts[0]
        : line.chart_of_accounts;

    const category =
      String(
        account?.category || ""
      ).toLowerCase();

    const debit =
      Number(line.debit || 0);

    const credit =
      Number(line.credit || 0);

    // -------------------------
    // REVENUE
    // -------------------------

    if (
      category.includes(
        "revenue"
      )
    ) {

      netIncome +=
        credit - debit;

    }

    // -------------------------
    // COGS / EXPENSES
    // -------------------------

    if (
      category.includes(
        "cogs"
      ) ||

      category.includes(
        "expense"
      )
    ) {

      netIncome -=
        debit - credit;

    }

  }

  // -------------------------
  // EQUITY ACCOUNT
  // -------------------------

  const {
    data: accounts,
  } = await supabaseAdmin

    .from("chart_of_accounts")

    .select("*");

  const retainedEarnings =
    accounts?.find(
      (a) =>
        a.code === "3100"
    );

  const incomeSummary =
    accounts?.find(
      (a) =>
        a.code === "3900"
    );

  if (
    !retainedEarnings ||
    !incomeSummary
  ) {

    throw new Error(
      "Retained earnings or income summary missing"
    );

  }

  // -------------------------
  // CLOSE ENTRY
  // -------------------------

  const journal =
    await createJournalEntry({

      tenantId,

      entryDate:
        new Date()
          .toISOString()
          .slice(0, 10),

      description:
        `Period Close ${period}`,

      sourceType:
        "period_close",

      sourceId:
        "00000000-0000-0000-0000-000000000001",

      createdBy:
        payload?.createdBy || "system",

      lines: [

        {

          account_id:
            incomeSummary.id,

          debit:
            netIncome > 0
              ? netIncome
              : 0,

          credit:
            netIncome < 0
              ? Math.abs(netIncome)
              : 0,

          description:
            "Close net income",

        },

        {

          account_id:
            retainedEarnings.id,

          debit:
            netIncome < 0
              ? Math.abs(netIncome)
              : 0,

          credit:
            netIncome > 0
              ? netIncome
              : 0,

          description:
            "Retained earnings",

        },

      ],

    });

  return {

    success: true,

    workflow:
      "periodCloseWorkflow",

    period,

    netIncome,

    journal,

  };

}
