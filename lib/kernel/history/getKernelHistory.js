import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export default async function getKernelHistory({
  tenant_id,
}) {

  try {

    const {
      data,
      error,
    } = await supabaseAdmin
      .from("kernel_snapshots")
      .select("*")
      .eq(
        "tenant_id",
        tenant_id
      )
      .order(
        "created_at",
        {
          ascending: false,
        }
      )
      .limit(25);

    if (error) {
      throw error;
    }

    return {

      success: true,

      history:
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
