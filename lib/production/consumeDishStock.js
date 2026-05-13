import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export async function consumeDishStock({
  tenantId,
  dishId,
  quantity = 1,
  referenceId,
  source = "ORDER_COMPLETED",
}) {
  try {
    const { data: stockRow, error: stockError } =
      await supabaseAdmin
        .from("dish_stock")
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("dish_id", dishId)
        .single();

    if (stockError) throw stockError;

    const currentQty =
      Number(stockRow?.quantity || 0);

    if (currentQty < quantity) {
      return {
        success: false,
        error: "INSUFFICIENT_DISH_STOCK",
        current_quantity: currentQty,
        required_quantity: quantity,
      };
    }

    const newQty = currentQty - quantity;

    const { error: updateError } =
      await supabaseAdmin
        .from("dish_stock")
        .update({
          quantity: newQty,
        })
        .eq("tenant_id", tenantId)
        .eq("dish_id", dishId);

    if (updateError) throw updateError;

    const { error: movementError } =
      await supabaseAdmin
        .from("stock_movements")
        .insert({
          tenant_id: tenantId,
          item_type: "DISH",
          item_id: dishId,
          movement_type: "SALE",
          quantity: -quantity,
          reference_id: referenceId,
        });

    if (movementError) throw movementError;

    return {
      success: true,
      previous_quantity: currentQty,
      new_quantity: newQty,
      deducted_quantity: quantity,
    };
  } catch (error) {
    console.error(
      "CONSUME DISH STOCK ERROR:",
      error
    );

    return {
      success: false,
      error: error.message,
    };
  }
}
