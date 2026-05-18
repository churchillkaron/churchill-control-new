import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export default async function detectFinancialRisk({
  tenant_id,
}) {

  try {

    const {
      data: payables,
      error,
    } = await supabaseAdmin
      .from("accounts_payable")
      .select("*")
      .eq(
        "tenant_id",
        tenant_id
      );

    if (error) {
      throw error;
    }

    const totalLiabilities =
      (payables || []).reduce(
        (
          sum,
          row
        ) =>
          sum +
          Number(
            row.amount || 0
          ),
        0
      );

    let riskLevel =
      "LOW";

    if (
      totalLiabilities >
      500000
    ) {

      riskLevel =
        "HIGH";

    } else if (
      totalLiabilities >
      100000
    ) {

      riskLevel =
        "MEDIUM";
    }

    return {

      success: true,

      liabilities:
        totalLiabilities,

      risk_level:
        riskLevel,
    };

  } catch (error) {

    return {

      success: false,

      error:
        error.message,
    };
  }
}
