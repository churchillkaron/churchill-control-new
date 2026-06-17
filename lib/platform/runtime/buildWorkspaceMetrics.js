import { supabase } from "@/lib/supabase";
import { calculateKPIs } from "@/lib/intelligence/kpi/kpiEngine";

export async function buildWorkspaceMetrics({
  tenantId,
}) {

  const [
    salesResponse,
    tablesResponse,
    profitabilityResponse,
    inventoryResponse,
  ] = await Promise.all([

    supabase
      .from("daily_sales_items")
      .select("*")
      .eq("tenant_id", tenantId),

    supabase
      .from("table_sessions")
      .select("*")
      .eq("tenant_id", tenantId),

    supabase
      .from("profitability_snapshots")
      .select("*")
      .eq("tenant_id", tenantId),

    supabase
      .from("inventory_stock_ledger")
      .select("*")
      .eq("tenant_id", tenantId),

  ]);

  const sales =
    salesResponse.data || [];

  const tables =
    tablesResponse.data || [];

  const profitability =
    profitabilityResponse.data || [];

  const inventory =
    inventoryResponse.data || [];

  const revenue =
    sales.reduce(
      (sum, row) =>
        sum +
        (
          Number(row.price || 0) *
          Number(row.quantity || 1)
        ),
      0
    );

  const orders =
    sales.length;

  const activeTables =
    tables.filter(
      row =>
        row.status === "ACTIVE"
    ).length;

  let netProfit = 0;
  let grossProfit = 0;
  let laborCost = 0;

  for (const row of profitability) {

    netProfit += Number(
      row.net_profit || 0
    );

    grossProfit += Number(
      row.gross_profit || 0
    );

    laborCost += Number(
      row.labor_cost || 0
    );

  }

  let inventoryValue = 0;

  for (const row of inventory) {

    inventoryValue += Number(
      row.inventory_value || 0
    );

  }

  const foodCost =
    revenue > 0
      ? ((revenue - grossProfit) / revenue) * 100
      : 0;

  const kpi =
    calculateKPIs({

      revenue,

      orders,

      tables:
        activeTables,

      laborCost,

      foodCost,

      refunds: 0,

    });

  return {

    revenue: {
      title: "Revenue",
      value: revenue,
      prefix: "THB ",
    },

    service_charge: {
      title: "Service Charge",
      value: revenue * 0.05,
      prefix: "THB ",
    },

    orders: {
      title: "Orders",
      value: orders,
    },

    avg_order: {
      title: "Average Order",
      value: kpi.avgOrderValue,
      prefix: "THB ",
    },

    occupied_tables: {
      title: "Occupied Tables",
      value: activeTables,
    },

    inventory: {
      title: "Inventory Value",
      value: inventoryValue,
      prefix: "THB ",
    },

    net_profit: {
      title: "Net Profit",
      value: netProfit,
      prefix: "THB ",
    },

    gross_profit: {
      title: "Gross Profit",
      value: grossProfit,
      prefix: "THB ",
    },

    labor_ratio: {
      title: "Labor Ratio",
      value: kpi.laborRatio,
      suffix: "%",
    },

    revenue_per_table: {
      title: "Revenue Per Table",
      value: kpi.revenuePerTable,
      prefix: "THB ",
    },

    koi: {
      title: "KOI",
      value: kpi.operationalScore,
      suffix: "%",
      description: kpi.state,
    },

  };

}
