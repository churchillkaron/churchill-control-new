import { createServerSupabase } from "@/lib/shared/supabase/server";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

import postGeneralLedgerEntry from "@/lib/finance/general-ledger/postGeneralLedgerEntry";

export default async function runYearEndClose({
  tenant_id,
  fiscal_year,
}) {

  try {

    const {
      data: ledger,
      error,
    } = await supabaseAdmin
      .from("general_ledger")
      .select("*")
      .eq(
        "tenant_id",
        tenant_id
      );

    if (error) {
      throw error;
    }

    let retainedEarnings = 0;

    for (const entry of ledger || []) {

      const account =
        (
          entry.account_name || ""
        ).toLowerCase();

      if (
        account.includes(
          "revenue"
        )
      ) {

        retainedEarnings +=
          Number(
            entry.amount || 0
          );
      }

      if (
        account.includes(
          "expense"
        )
      ) {

        retainedEarnings -=
          Number(
            entry.amount || 0
          );
      }
    }

    const posting =
      await postGeneralLedgerEntry({

        tenant_id,

        account_name:
          "Retained Earnings",

        entry_type:
          retainedEarnings >= 0
            ? "CREDIT"
            : "DEBIT",

        amount:
          Math.abs(
            retainedEarnings
          ),

        reference_type:
          "YEAR_END_CLOSE",

        reference_id:
          null,
      });

    if (
      !posting.success
    ) {

      throw new Error(
        posting.error
      );
    }

    return {

      success: true,

      retained_earnings:
        retainedEarnings,

      fiscal_year,
    };

  } catch (error) {

    return {

      success: false,

      error:
        error.message,
    };
  }
}
