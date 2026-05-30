import { supabase } from "@/lib/supabase";

export async function getEnterpriseActions({
  tenantId,
}) {
  const { data: recommendations } =
    await supabase
      .from(
        "accounting_recommendations"
      )
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("status", "open");

  const { data: autonomous } =
    await supabase
      .from(
        "autonomous_finance_actions"
      )
      .select("*")
      .eq("tenant_id", tenantId);

  return {
    recommendations:
      recommendations || [],
    autonomousActions:
      autonomous || [],
  };
}
