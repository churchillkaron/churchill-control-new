import { supabase } from "@/lib/shared/supabase/client";

export async function loadActiveOrders(
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
      "ACTIVE"
    )
    .order(
      "created_at",
      {
        ascending: false,
      }
    );

  if (error) {

    console.error(
      "LOAD ORDERS ERROR",
      error
    );

    return [];
  }

  return data || [];
}
