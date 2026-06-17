import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export async function calculateOrganizationProfit(organizationId) {
  if (!organizationId) return null;

  const { data: invoices } =
    await supabaseAdmin
      .from("billing_invoices")
      .select("amount,status")
      .eq("organization_id", organizationId);

  const revenue =
    (invoices || [])
      .filter(invoice =>
        ["paid", "issued", "sent"].includes(
          String(invoice.status || "").toLowerCase()
        )
      )
      .reduce(
        (sum, invoice) =>
          sum + Number(invoice.amount || 0),
        0
      );

  const { data: usage } =
    await supabaseAdmin
      .from("ai_usage_logs")
      .select("cost")
      .eq("organization_id", organizationId);

  const aiCost =
    (usage || []).reduce(
      (sum, row) =>
        sum + Number(row.cost || 0),
      0
    );

  const profit =
    revenue - aiCost;

  const margin =
    revenue > 0
      ? (profit / revenue) * 100
      : 0;

  return {
    organizationId,
    revenue,
    aiCost,
    profit,
    margin: Number(margin.toFixed(2)),
  };
}
