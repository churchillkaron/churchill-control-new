import { createServerSupabase } from "@/lib/shared/supabase/server";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export default async function generateBalanceSheet({
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

    let assets = 0;

    let liabilities = 0;

    let equity = 0;

    for (const entry of data || []) {

      const amount =
        Number(
          entry.amount || 0
        );

      const account =
        (
          entry.account_name || ""
        ).toLowerCase();

      if (
        account.includes(
          "bank"
        ) ||
        account.includes(
          "cash"
        )
      ) {

        assets += amount;
      }

      if (
        account.includes(
          "payable"
        )
      ) {

        liabilities += amount;
      }

      if (
        account.includes(
          "equity"
        )
      ) {

        equity += amount;
      }
    }

    return {

      success: true,

      assets,

      liabilities,

      equity,
    };

  } catch (error) {

    return {

      success: false,

      error:
        error.message,
    };
  }
}
