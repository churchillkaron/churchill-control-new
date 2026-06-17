import { createServerSupabase } from "@/lib/shared/supabase/server";
import { supabase } from "@/lib/supabase";

export async function getAutonomousCloseStatus({
  tenantId,
}) {
  const { data, error } =
    await supabase
      .from(
        "accounting_autonomous_close_cycles"
      )
      .select("*")
      .eq("tenant_id", tenantId)
      .order("created_at", {
        ascending: false,
      })
      .limit(10);

  if (error) {
    throw error;
  }

  return data;
}
