import { createServerSupabase } from "@/lib/shared/supabase/server";
import { supabase } from "@/lib/supabase";

export async function runCurrencyTranslation({
  tenantId,
  sourceCurrency,
  targetCurrency,
  exchangeRate,
  amount,
}) {
  const translated =
    Number(amount || 0) *
    Number(exchangeRate || 1);

  const { data, error } =
    await supabase
      .from(
        "foreign_currency_translation"
      )
      .insert({
        tenant_id: tenantId,
        source_currency:
          sourceCurrency,
        target_currency:
          targetCurrency,
        exchange_rate:
          exchangeRate,
        translated_amount:
          translated,
      })
      .select()
      .single();

  if (error) {
    throw error;
  }

  return data;
}
