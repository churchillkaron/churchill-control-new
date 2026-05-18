import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export default async function storeProcurementOutcome({
  tenant_id,
  supplier,
  ingredient,
  outcome,
  savings = 0,
}) {

  try {

    const {
      data,
      error,
    } = await supabaseAdmin
      .from("ai_procurement_memory")
      .insert([
        {

          tenant_id,

          supplier,

          ingredient,

          outcome,

          savings,

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
