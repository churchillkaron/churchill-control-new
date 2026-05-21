import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export default async function getTables({
  tenant_id,
}) {

  try {

    const {
      data,
      error,
    } = await supabaseAdmin
      .from("pos_tables")
      .select(`
        id,
        table_number,
        seats,
        status,
        active_order_id,
        created_at
      `)
      .eq(
        "tenant_id",
        tenant_id
      )
      .order(
        "table_number",
        {
          ascending: true,
        }
      );

    if (error) {
      throw error;
    }

    return {

      success: true,

      tables:
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
