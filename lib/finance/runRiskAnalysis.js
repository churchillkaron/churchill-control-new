import { supabaseAdmin } from "@/lib/shared/supabase/admin";

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

  const { data, error } = await supabaseAdmin
    .from("accounting_risk_analysis")
    .insert(risks)
    .select();

  if (error) {
    throw error;
  }

  return data;
}
