import { supabase } from "@/lib/supabase";

export async function registerDomainRules(data) {
  const { data: rules, error } =
    await supabase
      .from(
        "accounting_domain_registry"
      )
      .insert(data)
      .select()
      .single();

  if (error) {
    throw error;
  }

  return rules;
}
