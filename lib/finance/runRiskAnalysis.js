import { createServerSupabase } from "@/lib/shared/supabase/server";
import { supabase } from "@/lib/supabase";

export async function runRiskAnalysis({
  organizationId,
}) {
  const risks = [
    {
      organization_id: organizationId,
      risk_type: "cashflow",
      severity: "medium",
      notes: "Cash reserves below recommended threshold",
    },
    {
      organization_id: organizationId,
      risk_type: "vendor_dependency",
      severity: "low",
      notes: "High dependency on single supplier",
    },
  ];

  const { data, error } = await supabase
    .from("accounting_risk_analysis")
    .insert(risks)
    .select();

  if (error) {
    throw error;
  }

  return data;
}
