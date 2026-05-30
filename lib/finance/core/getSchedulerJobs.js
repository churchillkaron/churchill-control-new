import { supabase } from "@/lib/supabase";

export async function getSchedulerJobs({
  tenantId,
}) {
  const { data, error } =
    await supabase
      .from(
        "accounting_scheduler_jobs"
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
