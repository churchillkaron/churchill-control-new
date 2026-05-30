import { supabase } from "@/lib/supabase";

export async function getAIInsights({
  tenantId,
}) {
  const insights = [
    {
      tenant_id: tenantId,
      insight_type: "optimization",
      title: "Reduce Food Waste",
      description: "Inventory variance suggests 8% food waste increase",
      severity: "medium",
    },
    {
      tenant_id: tenantId,
      insight_type: "revenue",
      title: "High Weekend Revenue Trend",
      description: "Weekend revenue increased 18% month-over-month",
      severity: "low",
    },
  ];

  const { data, error } = await supabase
    .from("ai_finance_insights")
    .insert(insights)
    .select();

  if (error) {
    throw error;
  }

  return data;
}
