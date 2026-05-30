import { supabase } from "@/lib/supabase";

export async function runFXRevaluation({
  tenantId,
  sourceCurrency,
  targetCurrency,
  amount,
}) {
  const { data: rate } =
    await supabase
      .from(
        "consolidation_exchange_rates"
      )
      .select("*")
      .eq(
        "base_currency",
        sourceCurrency
      )
      .eq(
        "target_currency",
        targetCurrency
      )
      .order("effective_date", {
        ascending: false,
      })
      .limit(1)
      .single();

  if (!rate) {
    throw new Error(
      "Exchange rate not found"
    );
  }

  const converted =
    Number(amount || 0) *
    Number(
      rate.exchange_rate || 1
    );

  return {
    sourceCurrency,
    targetCurrency,
    originalAmount: amount,
    exchangeRate:
      rate.exchange_rate,
    convertedAmount:
      converted,
  };
}
