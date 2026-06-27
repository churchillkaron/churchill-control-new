import { createServerSupabase } from "@/lib/shared/supabase/server";
import { supabase } from "@/lib/supabase";

export async function getBoardReport({
  organizationId,
}) {
  const report = {
    organization_id: organizationId,
    report_period: "Q2 2026",
    executive_summary:
      "Enterprise operations continue to show strong profitability and cashflow resilience.",
    revenue: 18500000,
    expenses: 12200000,
    profit: 6300000,
  };

  const { data, error } = await supabase
    .from("board_reports")
    .insert(report)
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data;
}
