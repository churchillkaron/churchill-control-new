import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export async function resolveOrganizationCurrency({
  organization_id,
} = {}) {
  if (!organization_id) {
    throw new Error("organization_id required");
  }

  const { data, error } = await supabaseAdmin
    .from("organizations")
    .select("default_currency")
    .eq("id", organization_id)
    .maybeSingle();

  if (error) throw error;

  const currency = String(data?.default_currency || "")
    .trim()
    .toUpperCase();

  if (!currency) {
    throw new Error("ORGANIZATION_DEFAULT_CURRENCY_REQUIRED");
  }

  return currency;
}
