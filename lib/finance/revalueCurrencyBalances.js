import { createServerSupabase } from "@/lib/shared/supabase/server";
import { supabase } from "@/lib/supabase";

export async function revalueCurrencyBalances({
  organizationId,
  accountId,
  baseCurrency,
  targetCurrency,
  oldValue,
  newValue,
}) {
  const gainLoss = Number(newValue || 0) - Number(oldValue || 0);

  const { data, error } = await supabase
    .from("currency_revaluations")
    .insert({
      organization_id: organizationId,
      account_id: accountId,
      base_currency: baseCurrency,
      target_currency: targetCurrency,
      old_value: oldValue,
      new_value: newValue,
      gain_loss: gainLoss,
    })
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data;
}
