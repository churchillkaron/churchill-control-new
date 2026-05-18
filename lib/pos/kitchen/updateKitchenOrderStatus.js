import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export default async function updateKitchenOrderStatus({
  order_id,
  status,
}) {

  try {

    const {
      data,
      error,
    } = await supabaseAdmin
      .from("orders")
      .update({

        status,
      })
      .eq(
        "id",
        order_id
      )
      .select()
      .single();

    if (error) {
      throw error;
    }

    return {

      success: true,

      order:
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
