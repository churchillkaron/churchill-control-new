import { createServerSupabase } from "@/lib/shared/supabase/server";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export default async function createBudget({
  organization_id,
  fiscal_year,
  department,
  account_name,
  budget_amount,
}) {

  try {

    const {
      data,
      error,
    } = await supabaseAdmin
      .from("budgets")
      .insert([
        {

          organization_id,

          fiscal_year,

          department,

          account_name,

          budget_amount,

          created_at:
            new Date().toISOString(),
        },
      ])
      .select()
      .single();

    if (error) {
      throw error;
    }

    return {

      success: true,

      budget:
        data,
    };

  } catch (error) {

    return {

      success: false,

      error:
        error.message,
    };
  }
}
