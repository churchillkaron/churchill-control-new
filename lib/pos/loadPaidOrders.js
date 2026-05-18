import { supabase } from "@/lib/shared/supabase/client";

export async function loadPaidOrders(
  tenant_id
) {

  if (!tenant_id) {
    return [];
  }

  const {
    data,
    error,
  } = await supabase
    .from("orders")
    .select("*")
    .eq(
      "tenant_id",
      tenant_id
    )
    .eq(
      "status",
      "PAID"
    )
    .order(
      "paid_at",
      {
        ascending: false,
      }
    );

  if (error) {

    console.error(
      "LOAD PAID ORDERS ERROR",
      error
    );

    return [];
  }

  return data || [];
}
