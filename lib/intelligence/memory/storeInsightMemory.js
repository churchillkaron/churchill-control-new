import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export default async function storeInsightMemory({
  tenant_id,
  category,
  payload,
}) {

  try {

    const {
      data,
      error,
    } = await supabaseAdmin
      .from("ai_memory")
      .insert([
        {
          tenant_id,
          category,
          payload,
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
      memory: data,
    };

  } catch (error) {

    return {
      success: false,
      error:
        error.message,
    };
  }
}
