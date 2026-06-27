import { createServerSupabase } from "@/lib/shared/supabase/server";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export default async function runVarianceAnalysis({
  organization_id,
  fiscal_year,
}) {

  try {

    const {
      data: budgets,
      error: budgetError,
    } = await supabaseAdmin
      .from("budgets")
      .select("*")
      .eq(
        "organization_id",
        organization_id
      )
      .eq(
        "fiscal_year",
        fiscal_year
      );

    if (budgetError) {
      throw budgetError;
    }

    const {
      data: ledger,
      error: ledgerError,
    } = await supabaseAdmin
      .from("general_ledger")
      .select("*")
      .eq(
        "organization_id",
        organization_id
      );

    if (ledgerError) {
      throw ledgerError;
    }

    const analysis = [];

    for (const budget of budgets || []) {

      const actual =
        (ledger || [])
          .filter(
            (
              row
            ) =>
              row.account_name ===
              budget.account_name
          )
          .reduce(
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

      const variance =
        actual -
        Number(
          budget.budget_amount || 0
        );

      analysis.push({

        account_name:
          budget.account_name,

        budget:
          budget.budget_amount,

        actual,

        variance,
      });
    }

    return {

      success: true,

      analysis,
    };

  } catch (error) {

    return {

      success: false,

      error:
        error.message,
    };
  }
}
