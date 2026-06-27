import { createServerSupabase } from "@/lib/shared/supabase/server";
import { supabase } from "@/lib/supabase";

export async function runForecasting({
  organizationId,
}) {
  const forecasts = [
    {
      organization_id: organizationId,
      forecast_type: "cashflow",
      forecast_period: "next_30_days",
      projected_amount: 1250000,
    },
    {
      organization_id: organizationId,
      forecast_type: "revenue",
      forecast_period: "next_quarter",
      projected_amount: 4800000,
    },
  ];

  const { data, error } = await supabase
    .from("accounting_forecasts")
    .insert(forecasts)
    .select();

  if (error) {
    throw error;
  }

  return data;
}
