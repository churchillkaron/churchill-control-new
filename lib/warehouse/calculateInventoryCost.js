import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export default async function calculateInventoryCost({
  ingredient_id,
}) {
  try {
    const { data: transactions } = await supabaseAdmin
      .from("inventory_transactions")
      .select("*")
      .eq("ingredient_id", ingredient_id);

    const totalCost = (transactions || []).reduce(
      (sum, item) => sum + Number(item.total_cost || 0),
      0
    );

    const totalQty = (transactions || []).reduce(
      (sum, item) => sum + Number(item.quantity || 0),
      0
    );

    const averageCost =
      totalQty > 0 ? totalCost / totalQty : 0;

    return {
      success: true,
      ingredient_id,
      total_quantity: totalQty,
      total_cost: totalCost,
      average_cost: averageCost,
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  }
}
