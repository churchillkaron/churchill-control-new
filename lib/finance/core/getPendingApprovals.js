import { supabase } from "@/lib/supabase";

export async function getPendingApprovals({
  tenantId,
}) {
  const { data, error } =
    await supabase
      .from(
        "accounting_approval_workflows"
      )
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("status", "pending")
      .order("created_at", {
        ascending: true,
      });

  if (error) {
    throw error;
  }

  return data;
}
