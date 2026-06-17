import { createServerSupabase } from "@/lib/shared/supabase/server";
import { supabase } from "@/lib/supabase";

export async function getAccountingEvents({
  tenantId,
  status,
}) {
  let query = supabase
    .from("accounting_event_bus")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("created_at", {
      ascending: false,
    });

  if (status) {
    query = query.eq(
      "status",
      status
    );
  }

  const { data, error } =
    await query;

  if (error) {
    throw error;
  }

  return data;
}
