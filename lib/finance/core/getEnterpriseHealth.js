import { supabase } from "@/lib/supabase";

export async function getEnterpriseHealth({
  tenantId,
}) {
  const { data, error } =
    await supabase
      .from(
        "enterprise_command_center_snapshots"
      )
      .select("*")
      .eq("tenant_id", tenantId)
      .order("created_at", {
        ascending: false,
      })
      .limit(1)
      .single();

  if (error) {
    throw error;
  }

  return data;
}
