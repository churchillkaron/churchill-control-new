import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export default async function storeFinancialOutcome({
  tenant_id,
  outcome_type,
  metric_name,
  metric_value,
  metadata = {},
}) {

  try {

    const {
      data,
      error,
    } = await supabaseAdmin
      .from("ai_finance_memory")
      .insert([
        {

          tenant_id,

          outcome_type,

          metric_name,

          metric_value,

          metadata,

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

      memory:
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
