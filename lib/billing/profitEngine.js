import { supabaseAdmin } from "@/lib/shared/supabase/admin";


export async function calculateOrganizationProfit(
  organizationId
) {

  if (!organizationId) {
    return null;
  }


  const { data: invoices } =
    await supabaseAdmin
      .from("billing_invoices")
      .select(
        "amount,status"
      )
      .eq(
        "organization_id",
        organizationId
      );


  const revenue =
    (invoices || [])
      .filter(invoice =>
        [
          "paid",
          "issued",
          "sent",
        ].includes(
          String(
            invoice.status || ""
          ).toLowerCase()
        )
      )
      .reduce(
        (sum, invoice) =>
          sum +
          Number(
            invoice.amount || 0
          ),
        0
      );


  const { data: usage } =
    await supabaseAdmin
      .from("platform_service_usage")
      .select(
        "supplier_cost,customer_price"
      )
      .eq(
        "organization_id",
        organizationId
      );


  const supplierCost =
    (usage || [])
      .reduce(
        (sum,row) =>
          sum +
          Number(
            row.supplier_cost || 0
          ),
        0
      );


  const usageRevenue =
    (usage || [])
      .reduce(
        (sum,row) =>
          sum +
          Number(
            row.customer_price || 0
          ),
        0
      );


  const totalRevenue =
    revenue +
    usageRevenue;


  const profit =
    totalRevenue -
    supplierCost;


  const margin =
    totalRevenue > 0
      ? (
          profit /
          totalRevenue
        ) * 100
      : 0;


  return {

    organizationId,

    revenue:
      totalRevenue,

    supplierCost,

    profit,

    margin:
      Number(
        margin.toFixed(2)
      ),

  };

}
