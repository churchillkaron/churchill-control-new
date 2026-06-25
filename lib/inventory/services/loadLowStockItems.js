import { supabase } from "@/lib/shared/supabase/client";

export async function loadLowStockItems(
  tenant_id
) {

  if (!tenant_id) {
    return [];
  }

  const {
    data,
    error,
  } = await supabase
    .from("dishes")
    .select("*")
    .eq(
      "tenant_id",
      tenant_id
    )
    .lte(
      "stock_quantity",
      10
    )
    .order(
      "stock_quantity",
      {
        ascending: true,
      }
    );

  if (error) {

    console.error(
      "LOW STOCK ERROR",
      error
    );

    return [];
  }

  return data || [];
}
