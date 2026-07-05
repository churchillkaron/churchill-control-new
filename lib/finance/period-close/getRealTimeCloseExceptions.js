import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export async function getRealTimeCloseExceptions({
  organizationId,
}) {
  const { data, error } =
    await supabaseAdmin
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
