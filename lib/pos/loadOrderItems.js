import { supabase } from "@/lib/shared/supabase/client";

export async function loadOrderItems(
  order_id
) {

  if (!order_id) {
    return [];
  }

  const {
    data,
    error,
  } = await supabase
    .from("order_items")
    .select("*")
    .eq(
      "order_id",
      order_id
    );

  if (error) {

    console.error(
      "LOAD ORDER ITEMS ERROR",
      error
    );

    return [];
  }

  return data || [];
}
