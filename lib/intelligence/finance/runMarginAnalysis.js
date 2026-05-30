import { supabase } from "@/lib/supabase";

export async function runMarginAnalysis({
  tenantId,
}) {
  const { data, error } =
    await supabase
      .from("cogs_postings")
      .select("*")
      .eq("tenant_id", tenantId);

  if (error) {
    throw error;
  }

  let revenue = 0;
  let cogs = 0;
  let profit = 0;

  for (const row of data || []) {
    revenue += Number(
      row.revenue_amount || 0
    );

    cogs += Number(
      row.cogs_amount || 0
    );

    profit += Number(
      row.gross_profit || 0
    );
  }

  const margin =
    revenue > 0
      ? (profit / revenue) * 100
      : 0;

  return {
    revenue,
    cogs,
    profit,
    margin,
  };
}
