import { createServerSupabase } from "@/lib/shared/supabase/server";
import { supabase } from "@/lib/supabase";

export async function configureTaxRule({
  tenantId,
  taxName,
  taxRate,
  taxType,
  outputAccount,
  inputAccount,
}) {
  const { data, error } =
    await supabase
      .from("tax_configurations")
      .insert({
        tenant_id: tenantId,
        tax_name: taxName,
        tax_rate: taxRate,
        tax_type: taxType,
        output_account:
          outputAccount,
        input_account:
          inputAccount,
      })
      .select()
      .single();

  if (error) {
    throw error;
  }

  return data;
}
