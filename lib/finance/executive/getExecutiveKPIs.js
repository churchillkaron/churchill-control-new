import { createServerSupabase } from "@/lib/shared/supabase/server";
export async function getExecutiveKPIs() {
  return {
    ebitdaMargin: 28.4,
    grossProfitMargin: 61.8,
    netProfitMargin: 22.1,
    laborCostRatio: 18.2,
    foodCostRatio: 29.5,
    operatingCashflow: 1250000,
    burnRate: 240000,
    runwayMonths: 18,
  };
}
