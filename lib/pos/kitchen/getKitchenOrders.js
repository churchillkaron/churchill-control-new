import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export default async function getKitchenOrders({
  tenant_id,
}) {

  try {

    const {
      data,
      error,
    } = await supabaseAdmin
      .from("pos_orders")
      .select(`
        id,
        order_number,
        customer_name,
        table_number,
        status,
        total,
        created_at,
        pos_order_items (
          id,
          item_name,
          quantity,
          notes
        )
      `)
      .eq(
        "tenant_id",
        tenant_id
      )
      .in(
        "status",
        [
          "OPEN",
          "IN_PROGRESS",
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
