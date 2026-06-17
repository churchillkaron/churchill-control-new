import { createServerSupabase } from "@/lib/shared/supabase/server";
import { supabase } from "@/lib/supabase";

export async function runTaxFiling({
  tenantId,
  filingPeriod,
  taxName,
}) {
  const taxes =
    await supabase
      .from("tax_calculations")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("tax_name", taxName);

  let taxable = 0;
  let tax = 0;

  for (const row of taxes.data || []) {
    taxable += Number(
      row.taxable_amount || 0
    );

    tax += Number(
      row.tax_amount || 0
    );
  }

  const { data, error } =
    await supabase
      .from("tax_filing_records")
      .insert({
        tenant_id: tenantId,
        filing_period:
          filingPeriod,
        tax_name: taxName,
        taxable_total:
          taxable,
        tax_total: tax,
      })
      .select()
      .single();

  if (error) {
    throw error;
  }

  return data;
}
