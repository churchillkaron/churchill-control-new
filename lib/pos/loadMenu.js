import { supabase } from "@/lib/shared/supabase/client";

export async function loadMenu(
  tenantId
) {
  if (!tenantId) {
    throw new Error(
      "Tenant ID required"
    );
  }

  const {
    data: dishes,
    error: dishError,
  } = await supabase
    .from("dishes")
    .select("*")
    .eq("tenant_id", tenantId);

  if (dishError) {
    console.error(
      "MENU LOAD ERROR:",
      dishError
    );

    throw new Error(
      "Failed to load menu"
    );
  }

  const {
    data: stockData,
    error: stockError,
  } = await supabase
    .from("dish_stock")
    .select(
      "dish_id, quantity"
    )
    .eq("tenant_id", tenantId);

  if (stockError) {
    console.error(
      "STOCK LOAD ERROR:",
      stockError
    );

    throw new Error(
      "Failed to load stock"
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

  return (dishes || []).map(
    (dish) => ({
      ...dish,
      stock:
        stockMap[dish.id] ??
        0,
    })
  );
}
