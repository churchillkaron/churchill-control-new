import { supabaseAdmin } from "@/lib/shared/supabase/admin";

/**
 * Accounting Firm Approval Layer
 */
export async function approveTaxFiling({
  organizationId,
  filingId,
  approvedBy
}) {

  const { data, error } = await supabaseAdmin
    .from("tax_filings")
    .update({
      status: "APPROVED",
      approved_by: approvedBy,
      approved_at: new Date().toISOString()
    })
    .eq("id", filingId)
    .eq("organization_id", organizationId)
    .select()
    .single();

  if (error) throw error;

  return {
    success: true,
    filing: data
  };
}
