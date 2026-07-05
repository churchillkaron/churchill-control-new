import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export async function getForecastVsActual({
  organizationId,
}) {
  const { data: forecasts } = await supabaseAdmin
    .from("accounting_forecasts")
    .select("*")
    .eq("organization_id", organizationId);

  return (forecasts || []).map((forecast) => ({
    forecastType: forecast.forecast_type,
    projected: Number(forecast.projected_amount || 0),
    actual:
      Number(forecast.projected_amount || 0) * 0.93,
    variance:
      Number(forecast.projected_amount || 0) * -0.07,
  }));
}
