import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export default async function createPurchaseOrder({
  tenant_id,
  vendor_id,
  items = [],
  created_by = "SYSTEM",
}) {

  try {

    let totalAmount = 0;

    for (const item of items) {

      totalAmount +=
        Number(item.quantity || 0) *
        Number(item.price || 0);
    }

    // ===== CREATE PO =====
    const {
      data: po,
      error: poError,
    } = await supabaseAdmin
      .from("purchase_orders")
      .insert([
        {

          tenant_id,

          vendor_id,

          status:
            "PENDING_APPROVAL",

          total_amount:
            Number(
              totalAmount.toFixed(2)
            ),

          created_by,

          created_at:
            new Date().toISOString(),
        },
      ])
      .select()
      .single();

    if (poError) {
      throw poError;
    }

    // ===== CREATE ITEMS =====
    const poItems =
      items.map(
        (
          item
        ) => ({

          tenant_id,

          purchase_order_id:
            po.id,

          ingredient_id:
            item.ingredient_id,

          ingredient_name:
            item.ingredient_name,

          quantity:
            item.quantity,

          price:
            item.price,

          line_total:
            Number(item.quantity || 0) *
            Number(item.price || 0),

          created_at:
            new Date().toISOString(),
        })
      );

    const {
      error: itemError,
    } = await supabaseAdmin
      .from(
        "purchase_order_items"
      )
      .insert(
        poItems
      );

    if (itemError) {
      throw itemError;
    }

    return {

      success: true,

      purchase_order:
        po,
    };

  } catch (error) {

    return {

      success: false,

      error:
        error.message,
    };
  }
}
