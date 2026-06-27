import { supabase } from "@/lib/shared/supabase/client";

export async function loadTableSessions(
  organization_id
) {

  if (!organization_id) {
    return [];
  }

  const {
    data,
    error,
  } = await supabase
    .from("table_sessions")
    .select("*")
    .eq(
      "organization_id",
      organization_id
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
