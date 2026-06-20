import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export async function getTaxRule({
  taxRegime,
  accountingStandard,
  taxCode
}) {
  const { data, error } = await supabaseAdmin
    .from("tax_rules")
    .select("*")
    .eq("tax_regime", taxRegime)
    .eq("accounting_standard", accountingStandard)
    .eq("tax_code", taxCode)
    .eq("is_active", true)
    .single();

  if (error) return null;

  return data;
}
