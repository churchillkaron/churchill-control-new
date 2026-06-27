import { createServerSupabase } from "@/lib/shared/supabase/server";
import { supabase } from "@/lib/supabase";

export async function getExecutiveFinancialSummary({
  organizationId,
}) {
  const summary = {
    organization_id: organizationId,
    summary_period: "current_month",
    revenue: 4800000,
    expenses: 3150000,
    profit: 1650000,
    cashflow: 1220000,
    ai_summary:
      "Revenue growth is strong with stable operational margins and positive cashflow.",
  };

  const { data, error } = await supabase
    .from("executive_financial_summaries")
    .insert(summary)
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data;
}
