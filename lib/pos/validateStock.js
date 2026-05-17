import { supabase } from "@/lib/shared/supabase/client";

export async function validateStock({
  tenantId,
  orderItems,
}) {
  if (!tenantId) {
    throw new Error(
      "Tenant not loaded"
    );
  }

  const dishIds =
    orderItems.map(
      (item) => item.dish_id
    );

  const {
    data: stockData,
    error,
  } = await supabase
    .from("dish_stock")
    .select(
      "dish_id, quantity"
    )
    .eq("tenant_id", tenantId)
    .in("dish_id", dishIds);

  if (error) {
    console.error(
      "STOCK VALIDATION ERROR:",
      error
    );

    throw new Error(
      "Could not validate stock"
    );
  }

  const stockMap = {};

  for (const stock of stockData || []) {
    stockMap[
      stock.dish_id
    ] = Number(
      stock.quantity || 0
    );
  }

  for (const item of orderItems) {
    const available =
      stockMap[
        item.dish_id
      ] || 0;

    const needed =
      Number(
        item.quantity || 1
      );

    if (
      available < needed
    ) {
      return {
        valid: false,

        message: `Not enough stock for ${item.item_name}. Available: ${available}`,
      };
    }
  }

  return {
    valid: true,
  };
}
