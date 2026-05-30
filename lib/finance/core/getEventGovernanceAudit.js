import { supabase } from "@/lib/supabase";

export async function getEventGovernanceAudit({
  tenantId,
}) {
  const { data, error } =
    await supabase
      .from(
        "accounting_event_policy_violations"
      )
      .select(`
        *,
        accounting_event_policies (
          policy_name,
          event_type
        )
      `)
      .eq("tenant_id", tenantId)
      .order("created_at", {
        ascending: false,
      });

  if (error) {
    throw error;
  }

  return data;
}
