import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export default async function runAdaptiveLearning({
  tenant_id,
}) {

  try {

    const {
      data: finance,
    } = await supabaseAdmin
      .from("ai_finance_memory")
      .select("*")
      .eq(
        "tenant_id",
        tenant_id
      );

    const {
      data: operations,
    } = await supabaseAdmin
      .from("ai_operations_memory")
      .select("*")
      .eq(
        "tenant_id",
        tenant_id
      );

    const {
      data: procurement,
    } = await supabaseAdmin
      .from("ai_procurement_memory")
      .select("*")
      .eq(
        "tenant_id",
        tenant_id
      );

    const learning = {

      finance_patterns:
        finance?.length || 0,

      operations_patterns:
        operations?.length || 0,

      procurement_patterns:
        procurement?.length || 0,

      adaptive_score:
        (
          (
            finance?.length || 0
          ) +
          (
            operations?.length || 0
          ) +
          (
            procurement?.length || 0
          )
        ) * 10,
    };

    return {

      success: true,

      learning,
    };

  } catch (error) {

    return {

      success: false,

      error:
        error.message,
    };
  }
}
