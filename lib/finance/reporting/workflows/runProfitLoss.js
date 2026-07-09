import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export default async function runProfitLoss({ organizationId }) {
  if (!organizationId) {
    throw new Error("organizationId required");
  }

  const { data, error } = await supabaseAdmin
    .from("order_profit_view")
    .select("*")
    .eq("organization_id", organizationId);

  if (error) throw error;

  const rows = data || [];

  const revenue = rows.reduce((s, r) => s + Number(r.revenue || 0), 0);
  const cost = rows.reduce((s, r) => s + Number(r.cost || 0), 0);
  const profit = revenue - cost;

  return {
    success: true,
    revenue,
    cost,
    profit,
  };
}
