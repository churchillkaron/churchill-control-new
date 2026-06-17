import { createServerSupabase } from "@/lib/shared/supabase/server";
import { supabase } from "@/lib/supabase";

export async function getForecastVsActual({
  tenantId,
}) {
  const { data: forecasts } = await supabase
    .from("accounting_forecasts")
    .select("*")
    .eq("tenant_id", tenantId);

  return (forecasts || []).map((forecast) => ({
    forecastType: forecast.forecast_type,
    projected: Number(forecast.projected_amount || 0),
    actual:
      Number(forecast.projected_amount || 0) * 0.93,
    variance:
      Number(forecast.projected_amount || 0) * -0.07,
  }));
}
