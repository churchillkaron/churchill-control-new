import { supabase } from "@/lib/supabase";

export async function getRuleActions({
  tenantId,
  triggerEvent,
}) {
  const { data, error } =
    await supabase
      .from("orchestration_rules")
      .select(`
        id,
        rule_name,
        action_definition
      `)
      .eq("tenant_id", tenantId)
      .eq(
        "trigger_event",
        triggerEvent
      )
      .eq("active", true);

  if (error) {
    throw error;
  }

  return data;
}
