import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export default async function storeOperationalOutcome({
  tenant_id,
  category,
  metric_name,
  metric_value,
  metadata = {},
}) {

  try {

    const {
      data,
      error,
    } = await supabaseAdmin
      .from("ai_operations_memory")
      .insert([
        {

          tenant_id,

          category,

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
