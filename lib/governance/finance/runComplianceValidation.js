import { supabase } from "@/lib/supabase";

export async function runComplianceValidation({
  tenantId,
}) {
  const findings = [];

  const { data: journals } =
    await supabase
      .from("journal_entries")
      .select("*")
      .eq("tenant_id", tenantId);

  for (const journal of journals || []) {
    if (!journal.reference) {
      findings.push({
        severity: "medium",
        issue:
          "Journal missing reference",
        journalId:
          journal.id,
      });
    }
  }

  const status =
    findings.length > 0
      ? "warning"
      : "passed";

  const { data, error } =
    await supabase
      .from("compliance_runs")
      .insert({
        tenant_id: tenantId,
        compliance_type:
          "financial_controls",
        status,
        findings,
      })
      .select()
      .single();

  if (error) {
    throw error;
  }

  return data;
}
