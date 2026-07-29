import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { resolveActiveFinanceCurrency } from "@/lib/finance/currencies/FinanceCurrencyPolicy";

export async function getEntityCurrency({
  organizationId,
  entityId,
}) {
  if (!organizationId) throw new Error("organizationId required");
  if (!entityId) return null;

  const { data, error } = await supabaseAdmin
    .from("legal_entities")
    .select("currency, is_active")
    .eq("organization_id", organizationId)
    .eq("id", entityId)
    .maybeSingle();

  if (error) throw error;
  if (!data || data.is_active === false) return null;

  const configured = await resolveActiveFinanceCurrency({
    organizationId,
    code: data.currency,
  });

  return configured?.code || null;
}

export const CurrencyRuntime = {
  getEntityCurrency,
};
