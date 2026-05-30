import { supabase } from "@/lib/supabase";

export async function validateEventPolicy({
  tenantId,
  event,
  userRole,
}) {
  const { data: policies, error } =
    await supabase
      .from(
        "accounting_event_policies"
      )
      .select("*")
      .eq("tenant_id", tenantId)
      .eq(
        "event_type",
        event.event_type
      );

  if (error) {
    throw error;
  }

  for (const policy of policies || []) {
    if (
      policy.max_amount &&
      Number(
        event.payload?.amount || 0
      ) >
        Number(policy.max_amount)
    ) {
      await supabase
        .from(
          "accounting_event_policy_violations"
        )
        .insert({
          tenant_id: tenantId,
          policy_id:
            policy.id,
          event_id:
            event.id,
          violation_type:
            "MAX_AMOUNT_EXCEEDED",
          violation_message:
            "Event exceeds policy limit",
        });

      throw new Error(
        "Policy violation: max amount exceeded"
      );
    }

    if (
      policy.allowed_roles &&
      !policy.allowed_roles.includes(
        userRole
      )
    ) {
      await supabase
        .from(
          "accounting_event_policy_violations"
        )
        .insert({
          tenant_id: tenantId,
          policy_id:
            policy.id,
          event_id:
            event.id,
          violation_type:
            "ROLE_VIOLATION",
          violation_message:
            "Role not authorized",
        });

      throw new Error(
        "Policy violation: unauthorized role"
      );
    }
  }

  return {
    valid: true,
  };
}
