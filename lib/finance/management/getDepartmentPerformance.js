import { createServerSupabase } from "@/lib/shared/supabase/server";
import { supabase } from "@/lib/supabase";

export async function getDepartmentPerformance({
  tenantId,
}) {
  const { data, error } = await supabase
    .from("department_performance")
    .select("*")
    .eq("tenant_id", tenantId);

  if (error) {
    throw error;
  }

  return data || [];
}
