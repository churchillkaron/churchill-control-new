import { createServerSupabase } from "@/lib/shared/supabase/server";
import { supabase } from "@/lib/supabase";

export async function runRiskAnalysis({
  tenantId,
}) {
  const risks = [
    {
      tenant_id: tenantId,
      risk_type: "cashflow",
      severity: "medium",
      notes: "Cash reserves below recommended threshold",
    },
    {
      tenant_id: tenantId,
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
