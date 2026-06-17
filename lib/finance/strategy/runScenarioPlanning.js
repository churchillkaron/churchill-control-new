import { createServerSupabase } from "@/lib/shared/supabase/server";
import { supabase } from "@/lib/supabase";

export async function runScenarioPlanning({
  tenantId,
}) {
  const scenarios = [
    {
      tenant_id: tenantId,
      scenario_name: "Optimistic",
      projected_revenue: 6200000,
      projected_expenses: 4100000,
      projected_profit: 2100000,
    },
    {
      tenant_id: tenantId,
      scenario_name: "Conservative",
      projected_revenue: 4800000,
      projected_expenses: 3900000,
      projected_profit: 900000,
    },
  ];

  const { data, error } = await supabase
    .from("scenario_plans")
    .insert(scenarios)
    .select();

  if (error) {
    throw error;
  }

  return data;
}
