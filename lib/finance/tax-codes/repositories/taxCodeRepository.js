import { supabaseAdmin } from "@/lib/shared/supabase/admin";


export async function upsertTaxCode({
  organization_id,
  values,
}) {

  const { data, error } =
    await supabaseAdmin
      .from("tax_rules")
      .upsert({
        organization_id,
        tax_code:
          values.code,
        tax_name:
          values.name,
        tax_rate:
          values.rate,
        tax_regime:
          values.regime,
        accounting_standard:
          values.standard,
        effective_from:
          values.effective_from || null,
        effective_to:
          values.effective_to || null,
        is_active:
          true,
      })
      .select()
      .single();


  if(error) throw error;

  return data;
}
