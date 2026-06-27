import { createServerSupabase } from "@/lib/shared/supabase/server";
import { supabase } from "@/lib/supabase";

export async function getRealTimeCloseExceptions({
  organizationId,
}) {
  const { data, error } =
    await supabase
      .from(
        "real_time_close_exceptions"
      )
      .select("*")
      .eq("organization_id", organizationId)
      .eq("resolved", false)
      .order("created_at", {
        ascending: false,
      });

  if (error) {
    throw error;
  }

  return data;
}
