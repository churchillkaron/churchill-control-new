import { supabase } from "@/lib/shared/supabase/client";

export async function loadTableSessions(
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
    .in(
      "status",
      [
        "OPEN",
        "ACTIVE",
        "ORDERING",
        "READY_FOR_PAYMENT",
      ]
    );

  if (error) {

    console.error(
      "LOAD TABLE SESSIONS ERROR",
      error
    );

    return [];
  }

  return data || [];
}
