import { createServerSupabase } from "@/lib/shared/supabase/server";
import { supabase } from "@/lib/supabase";

export async function getSelfHealingHistory({
  tenantId,
}) {
  const { data, error } =
    await supabase
      .from(
        "accounting_self_healing_actions"
      )
      .select("*")
      .eq("tenant_id", tenantId)
      .order("created_at", {
        ascending: false,
      });

  if (error) {
    throw error;
  }

  return data;
}
