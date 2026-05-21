import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export default async function getKitchenOrders({
  tenant_id,
}) {

  try {

    const {
      data,
      error,
    } = await supabaseAdmin
      .from("orders")
      .select(`
        id,
        table_number,
        total_amount,
        status,
        kitchen_status,
        created_at,
        order_items (
          id,
          item_name,
          quantity,
          price
        )
      `)
      .eq(
        "tenant_id",
        tenant_id
      )
      .in(
        "kitchen_status",
        [
          "PENDING",
          "SENT",
          "COOKING",
          "READY",
        ]
      )
      .order(
        "created_at",
        {
          ascending: true,
        }
      );

    if (error) {
      throw error;
    }

    return {

      success: true,

      orders:
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
