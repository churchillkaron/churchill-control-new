import { supabase } from "@/lib/supabase";

export async function getContinuousCloseStatus({
  tenantId,
}) {
  const { data, error } =
    await supabase
      .from(
        "accounting_continuous_close_runs"
      )
      .select("*")
      .eq("tenant_id", tenantId)
      .order("started_at", {
        ascending: false,
      })
      .limit(1)
      .single();

  if (error) {
    throw error;
  }

  return data;
}
