import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export default async function getInsightMemory({
  tenant_id,
  category,
}) {

  try {

    const {
      data,
      error,
    } = await supabaseAdmin
      .from("ai_memory")
      .select("*")
      .eq(
        "tenant_id",
        tenant_id
      )
      .eq(
        "category",
        category
      )
      .order(
        "created_at",
        {
          ascending: false,
        }
      )
      .limit(20);

    if (error) {
      throw error;
    }

    return {
      success: true,
      memory:
        data || [],
    };

  } catch (error) {

    return {
      success: false,
      error:
        error.message,
    };
  }
}
