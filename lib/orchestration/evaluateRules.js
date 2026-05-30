import { supabase } from "@/lib/supabase";

export async function evaluateRules({
  tenantId,
  triggerEvent,
  payload,
}) {
  const rules =
    await supabase
      .from("orchestration_rules")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq(
        "trigger_event",
        triggerEvent
      )
      .eq("active", true);

  const executed = [];

  for (const rule of rules.data || []) {
    const condition =
      rule.condition_definition;

    let passed = true;

    if (
      condition?.field &&
      condition?.operator ===
        "greater_than"
    ) {
      passed =
        Number(
          payload[
            condition.field
          ] || 0
        ) >
        Number(
          condition.value || 0
        );
    }

    if (!passed) {
      continue;
    }

    await supabase
      .from(
        "orchestration_rule_executions"
      )
      .insert({
        tenant_id: tenantId,
        rule_id: rule.id,
        trigger_event:
          triggerEvent,
        execution_result:
          "executed",
        execution_payload:
          payload,
      });

    executed.push({
      ruleId: rule.id,
      ruleName:
        rule.rule_name,
    });
  }

  return executed;
}
