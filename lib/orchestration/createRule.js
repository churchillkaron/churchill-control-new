import { supabase } from "@/lib/supabase";

export async function createRule({
  tenantId,
  ruleName,
  entityType,
  triggerEvent,
  conditionDefinition,
  actionDefinition,
}) {
  const { data, error } =
    await supabase
      .from("orchestration_rules")
      .insert({
        tenant_id: tenantId,
        rule_name: ruleName,
        entity_type: entityType,
        trigger_event: triggerEvent,
        condition_definition:
          conditionDefinition,
        action_definition:
          actionDefinition,
      })
      .select()
      .single();

  if (error) {
    throw error;
  }

  return data;
}
