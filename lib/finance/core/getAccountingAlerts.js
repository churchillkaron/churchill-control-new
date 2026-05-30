import { supabase } from "@/lib/supabase";

export async function getAccountingAlerts({
  tenantId,
}) {
  const { data, error } =
    await supabase
      .from("accounting_alerts")
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
