import { supabase } from "@/lib/shared/supabase/client";

export async function loadCustomerFlow(
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
    .order(
      "created_at",
      {
        ascending: false,
      }
    )
    .limit(50);

  if (error) {

    console.error(
      "CUSTOMER FLOW ERROR",
      error
    );

    return [];
  }

  return data || [];
}
