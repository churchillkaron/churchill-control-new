import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export default async function predictCashFlow({
  tenant_id,
}) {

  try {

    const {
      data: ledger,
      error,
    } = await supabaseAdmin
      .from("bank_ledger")
      .select("*")
      .eq(
        "tenant_id",
        tenant_id
      );

    if (error) {
      throw error;
    }

    let inflow = 0;

    let outflow = 0;

    for (const row of ledger || []) {

      const amount =
        Number(
          row.amount || 0
        );

      if (
        row.direction ===
        "INFLOW"
      ) {

        inflow += amount;

      } else {

        outflow += amount;
      }
    }

    const netCashFlow =
      inflow - outflow;

    const projected30Days =
      netCashFlow * 1.15;

    return {

      success: true,

      inflow,

      outflow,

      net_cashflow:
        netCashFlow,

      projected_30_days:
        Number(
          projected30Days.toFixed(2)
        ),
    };

  } catch (error) {

    return {

      success: false,

      error:
        error.message,
    };
  }
}
