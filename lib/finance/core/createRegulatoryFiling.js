import { supabase } from "@/lib/supabase";

export async function createRegulatoryFiling({
  tenantId,
  reportRunId,
  filingAuthority,
}) {
  const reference =
    `FILING-${Date.now()}`;

  const { data, error } =
    await supabase
      .from(
        "regulatory_filing_records"
      )
      .insert({
        tenant_id: tenantId,
        report_run_id:
          reportRunId,
        filing_authority:
          filingAuthority,
        filing_reference:
          reference,
      })
      .select()
      .single();

  if (error) {
    throw error;
  }

  return data;
}
