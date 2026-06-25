import { createServerSupabase } from "@/lib/shared/supabase/server";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export default async function generateProfitLoss({
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

    let revenue = 0;

    let expenses = 0;

    for (const entry of data || []) {

      const amount =
        Number(
          entry.amount || 0
        );

      if (
        entry.account_name
          ?.toLowerCase()
          .includes(
            "revenue"
          )
      ) {

        revenue += amount;
      }

      if (
        entry.account_name
          ?.toLowerCase()
          .includes(
            "expense"
          )
      ) {

        expenses += amount;
      }
    }

    return {

      success: true,

      revenue,

      expenses,

      profit:
        revenue -
        expenses,
    };

  } catch (error) {

    return {

      success: false,

      error:
        error.message,
    };
  }
}
