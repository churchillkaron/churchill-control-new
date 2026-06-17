import { createServerSupabase } from "@/lib/shared/supabase/server";
import { supabase } from "@/lib/supabase";

import { calculateRetainedEarnings } from "./calculateRetainedEarnings";
import { postJournalEntrySafe } from "./postJournalEntrySafe";
import { lockAccountingPeriod } from "./lockAccountingPeriod";

export async function runYearEndClose({
  tenantId,
  accountingPeriodId,
  startDate,
  endDate,
  retainedEarningsAccountId,
  incomeSummaryAccountId,
}) {
  const retainedEarnings =
    await calculateRetainedEarnings({
      tenantId,
      startDate,
      endDate,
    });

  const journal =
    await postJournalEntrySafe({
      tenantId,
      entryDate: endDate,
      description:
        "Year-end retained earnings closing",
      reference:
        "YEAR_END_CLOSE",
      lines: [
        {
          accountId:
            incomeSummaryAccountId,
          debit:
            retainedEarnings > 0
              ? retainedEarnings
              : 0,
          credit:
            retainedEarnings < 0
              ? Math.abs(
                  retainedEarnings
                )
              : 0,
          memo:
            "Close income summary",
        },
        {
          accountId:
            retainedEarningsAccountId,
          debit:
            retainedEarnings < 0
              ? Math.abs(
                  retainedEarnings
                )
              : 0,
          credit:
            retainedEarnings > 0
              ? retainedEarnings
              : 0,
          memo:
            "Transfer to retained earnings",
        },
      ],
    });

  await lockAccountingPeriod({
    periodId:
      accountingPeriodId,
  });

  const { data, error } =
    await supabase
      .from("year_end_closings")
      .insert({
        tenant_id: tenantId,
        accounting_period_id:
          accountingPeriodId,
        retained_earnings_amount:
          retainedEarnings,
        closing_status:
          "completed",
      })
      .select()
      .single();

  if (error) {
    throw error;
  }

  return {
    closing: data,
    journal,
  };
}
