import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export default async function calculateInventoryValuation({
  tenant_id,
}) {

  try {

    const {
      data: inventory,
      error,
    } = await supabaseAdmin
      .from("inventory_items")
      .select("*")
      .eq(
        "tenant_id",
        tenant_id
      );

    if (error) {
      throw error;
    }

    const items =
      (inventory || []).map(
        (item) => {

          const quantity =
            Number(
              item.quantity || 0
            );

          const cost =
            Number(
              item.average_cost || 0
            );

          return {
            ingredient_id:
              item.id,
            quantity,
            average_cost:
              cost,
            valuation:
              quantity * cost,
          };
        }
      );

    const total =
      items.reduce(
        (sum, item) =>
          sum +
          item.valuation,
        0
      );

    return {
      success: true,
      total_valuation:
        total,
      items,
    };

  } catch (error) {

    return {
      success: false,
      error:
        error.message,
    };
  }
}
