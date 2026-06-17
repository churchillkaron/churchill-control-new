import { createServerSupabase } from "@/lib/shared/supabase/server";
import { supabase } from "@/lib/supabase";

export async function runAutonomousFinanceActions({
  tenantId,
}) {
  const { data: recommendations } =
    await supabase
      .from(
        "accounting_recommendations"
      )
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("priority", "high")
      .eq("status", "open");

  const actions = [];

  for (const rec of recommendations || []) {
    actions.push({
      tenant_id: tenantId,
      action_type:
        rec.recommendation_type,
      action_payload: {
        recommendationId:
          rec.id,
        title:
          rec.title,
      },
      execution_status:
        "queued",
    });
  }

  if (actions.length === 0) {
    return [];
  }

  const { data, error } =
    await supabase
      .from(
        "autonomous_finance_actions"
      )
      .insert(actions)
      .select();

  if (error) {
    throw error;
  }

  return data;
}
