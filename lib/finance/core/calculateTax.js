import { createServerSupabase } from "@/lib/shared/supabase/server";
import { supabase } from "@/lib/supabase";

export async function calculateTax({
  tenantId,
  referenceType,
  referenceId,
  taxableAmount,
  taxName,
}) {
  const config =
    await supabase
      .from("tax_configurations")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("tax_name", taxName)
      .single();

  if (!config.data) {
    throw new Error(
      "Tax configuration missing"
    );
  }

  const rate =
    Number(
      config.data.tax_rate || 0
    );

  const taxAmount =
    Number(
      taxableAmount || 0
    ) * rate;

  const { data, error } =
    await supabase
      .from("tax_calculations")
      .insert({
        tenant_id: tenantId,
        reference_type:
          referenceType,
        reference_id:
          referenceId,
        taxable_amount:
          taxableAmount,
        tax_amount:
          taxAmount,
        tax_rate: rate,
        tax_name: taxName,
      })
      .select()
      .single();

  if (error) {
    throw error;
  }

  return data;
}
