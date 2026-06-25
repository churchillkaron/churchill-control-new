import { createServerSupabase } from "@/lib/shared/supabase/server";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export default async function generateTrialBalance({
  tenant_id,
}) {

  try {

    const {
      data,
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

    const accounts = {};

    for (const entry of data || []) {

      if (
        !accounts[
          entry.account_name
        ]
      ) {

        accounts[
          entry.account_name
        ] = {

          debit: 0,

          credit: 0,
        };
      }

      if (
        entry.entry_type ===
        "DEBIT"
      ) {

        accounts[
          entry.account_name
        ].debit +=
          Number(
            entry.amount || 0
          );

      } else {

        accounts[
          entry.account_name
        ].credit +=
          Number(
            entry.amount || 0
          );
      }
    }

    return {

      success: true,

      trial_balance:
        accounts,
    };

  } catch (error) {

    return {

      success: false,

      error:
        error.message,
    };
  }
}
