import { supabaseAdmin } from "@/lib/shared/supabase/admin";

/**
 * Locks filing after submission to authority
 */
export async function lockTaxFiling({
  tenantId,
  filingId
}) {

  const { data, error } = await supabaseAdmin
    .from("tax_filings")
    .update({
      status: "LOCKED",
      locked_at: new Date().toISOString()
    })
    .eq("id", filingId)
    .eq("tenant_id", tenantId)
    .select()
    .single();

  if (error) throw error;

  return {
    success: true,
    filing: data
  };
}
