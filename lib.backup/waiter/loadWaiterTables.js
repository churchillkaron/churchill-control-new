import { supabase } from "@/lib/shared/supabase/client";

export async function loadWaiterTables(
  tenant_id
) {

  if (!tenant_id) {
    return [];
  }

  const {
    data,
    error,
  } = await supabase
    .from("table_sessions")
    .select("*")
    .eq(
      "tenant_id",
      tenant_id
    )
    .eq(
      "status",
      "ACTIVE"
    );

  if (error) {

    console.error(
      "WAITER TABLE ERROR",
      error
    );

    return [];
  }

  return data || [];
}
