import { supabase } from "@/lib/supabase";

export async function runComplianceScoring({
  tenantId,
}) {
  const { data: violations } =
    await supabase
      .from(
        "accounting_event_policy_violations"
      )
      .select("*")
      .eq("tenant_id", tenantId);

  const totalViolations =
    violations?.length || 0;

  const score =
    Math.max(
      0,
      100 - totalViolations * 5
    );

  const { data, error } =
    await supabase
      .from("compliance_scores")
      .insert({
        tenant_id: tenantId,
        compliance_area:
          "GLOBAL_FINANCE",
        compliance_score:
          score,
        total_violations:
          totalViolations,
      })
      .select()
      .single();

  if (error) {
    throw error;
  }

  return data;
}
