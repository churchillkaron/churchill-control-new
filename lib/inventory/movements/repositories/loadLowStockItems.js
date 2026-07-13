import { supabase } from "@/lib/shared/supabase/client";

export async function loadLowStockItems(
  organization_id
) {

  if (!organization_id) {
    return [];
  }

  const {
    data,
    error,
  } = await supabase
    .from("dishes")
    .select("*")
    .eq(
      "organization_id",
      organization_id
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
