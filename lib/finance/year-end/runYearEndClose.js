import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { createJournalEntry } from "@/lib/finance/accounting/createJournalEntry";

export default async function runYearEndClose({
  tenant_id,
  fiscal_year,
}) {
  try {
    const { data: retainedEarnings } = await supabaseAdmin
      .from("chart_of_accounts")
      .select("id, code")
      .eq("tenant_id", tenant_id)
      .eq("code", "3100")
      .single();

    const { data: incomeSummary } = await supabaseAdmin
      .from("chart_of_accounts")
      .select("id, code")
      .eq("tenant_id", tenant_id)
      .eq("code", "3900")
      .single();

    if (!retainedEarnings) {
      throw new Error("Retained Earnings account missing (3100)");
    }

    if (!incomeSummary) {
      throw new Error("Income Summary account missing (3900)");
    }

    const { data: balances } = await supabaseAdmin
      .from("general_ledger")
      .select("account_id,debit,credit");

    let incomeSummaryBalance = 0;

    for (const row of balances || []) {
      if (row.account_id === incomeSummary.id) {
        incomeSummaryBalance +=
          Number(row.credit || 0) -
          Number(row.debit || 0);
      }
    }

    if (Math.abs(incomeSummaryBalance) < 0.01) {
      return {
        success: true,
        message: "Nothing to close",
        fiscal_year,
      };
    }

    const amount = Math.abs(incomeSummaryBalance);

    await createJournalEntry({
      tenantId: tenant_id,
      entryDate: `${fiscal_year}-12-31`,
      description: `Year End Close ${fiscal_year}`,
      sourceType: "year_end_close",
      sourceId: fiscal_year,
      createdBy: "system",
      lines: incomeSummaryBalance > 0
        ? [
            {
              account_id: incomeSummary.id,
              debit: amount,
              credit: 0,
              description: "Close Income Summary",
            },
            {
              account_id: retainedEarnings.id,
              debit: 0,
              credit: amount,
              description: "Transfer to Retained Earnings",
            },
          ]
        : [
            {
              account_id: retainedEarnings.id,
              debit: amount,
              credit: 0,
              description: "Transfer loss to Retained Earnings",
            },
            {
              account_id: incomeSummary.id,
              debit: 0,
              credit: amount,
              description: "Close Income Summary",
            },
          ],
    });

    return {
      success: true,
      fiscal_year,
      amount,
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  }
}
