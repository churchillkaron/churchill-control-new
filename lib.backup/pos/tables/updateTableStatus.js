import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export default async function updateTableStatus({
  table_id,
  status,
  active_order_id = null,
}) {

  try {

    const {
      data,
      error,
    } = await supabaseAdmin
      .from("pos_tables")
      .update({

        status,

        active_order_id,
      })
      .eq(
        "id",
        table_id
      )
      .select()
      .single();

    if (error) {
      throw error;
    }

    return {

      success: true,

      table:
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
