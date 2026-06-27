import { supabase } from "@/lib/shared/supabase/client";

export async function loadPaidOrders(
  organization_id
) {

  if (!organization_id) {
    return [];
  }

  const {
    data,
    error,
  } = await supabase
    .from("orders")
    .select("*")
    .eq(
      "organization_id",
      organization_id
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
