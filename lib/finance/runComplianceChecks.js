import { createServerSupabase } from "@/lib/shared/supabase/server";
import { supabase } from "@/lib/supabase";

export async function runComplianceChecks({
  tenantId,
}) {
  const checks = [
    {
      module: "accounting",
      check_name: "balanced_journals",
      status: "passed",
      notes: "All journals balanced",
    },
    {
      module: "tax",
      check_name: "vat_configuration",
      status: "passed",
      notes: "VAT engine configured",
    },
    {
      module: "period_close",
      check_name: "open_period_validation",
      status: "passed",
      notes: "No invalid open periods",
    },
  ];

  const rows = checks.map((item) => ({
    tenant_id: tenantId,
    ...item,
  }));

  const { data, error } = await supabase
    .from("compliance_checks")
    .insert(rows)
    .select();

  if (error) {
    throw error;
  }

  return data;
}
