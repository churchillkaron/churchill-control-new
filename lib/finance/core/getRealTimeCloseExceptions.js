import { supabase } from "@/lib/supabase";

export async function getRealTimeCloseExceptions({
  tenantId,
}) {
  const { data, error } =
    await supabase
      .from(
        "real_time_close_exceptions"
      )
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("resolved", false)
      .order("created_at", {
        ascending: false,
      });

  if (error) {
    throw error;
  }

  return data;
}
