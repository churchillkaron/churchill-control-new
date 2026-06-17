import { supabaseAdmin } from "@/lib/shared/supabase/admin";

async function safeQuery(callback, fallback) {
  try {
    const result = await callback();

    if (result?.error) {
      console.warn("DASHBOARD_QUERY_WARNING", result.error.message);
      return fallback;
    }

    return result?.data ?? fallback;
  } catch (error) {
    console.warn("DASHBOARD_QUERY_FAILED", error?.message);
    return fallback;
  }
}

export async function loadExecutiveDashboard({ tenantId } = {}) {
  if (!tenantId) {
    return {
      financials: {},
      posMetrics: {},
      approvals: [],
      operationalAnalytics: {},
      monitoring: {},
      workflowLogs: [],
      aiDecisions: [],
      kitchen: {},
      predictions: [],
      runtime: {
        generatedAt: new Date().toISOString(),
        tenantId: null,
        workflowCount: 0,
        aiDecisionCount: 0,
        approvalCount: 0,
        predictionCount: 0,
        kitchenStatus: "LOW",
      },
    };
  }

  const orders = await safeQuery(
    () =>
      supabaseAdmin
        .from("orders")
        .select("id,total,status,created_at")
        .eq("tenant_id", tenantId)
        .limit(200),
    []
  );

  const orderItems = await safeQuery(
    () =>
      supabaseAdmin
        .from("order_items")
        .select("id,status,station,price,quantity,created_at,ready_at,served_at")
        .eq("tenant_id", tenantId)
        .limit(500),
    []
  );

  const workflowLogs = await safeQuery(
    () =>
      supabaseAdmin
        .from("workflow_logs")
        .select("*")
        .eq("tenant_id", tenantId)
        .limit(20),
    []
  );

  const aiDecisions = await safeQuery(
    () =>
      supabaseAdmin
        .from("ai_decisions")
        .select("*")
        .eq("tenant_id", tenantId)
        .limit(20),
    []
  );

  const approvals = await safeQuery(
    () =>
      supabaseAdmin
        .from("approval_requests")
        .select("*")
        .eq("tenant_id", tenantId)
        .limit(50),
    []
  );

  const revenue = orders.reduce(
    (sum, order) => sum + Number(order.total || 0),
    0
  );

  const kitchenItems = orderItems.filter(
    item => String(item.station || "").toUpperCase() !== "BAR"
  );

  const barItems = orderItems.filter(
    item => String(item.station || "").toUpperCase() === "BAR"
  );

  const pending = kitchenItems.filter(item => item.status === "PENDING").length;
  const preparing = kitchenItems.filter(item => item.status === "PREPARING").length;
  const ready = kitchenItems.filter(item => item.status === "READY").length;

  const kitchenLoad =
    pending + preparing > 15
      ? "HIGH"
      : pending + preparing > 7
      ? "MEDIUM"
      : "LOW";

  return {
    financials: {
      revenue,
      orders: orders.length,
    },

    posMetrics: {
      totalOrders: orders.length,
      totalItems: orderItems.length,
      openOrders: orders.filter(order => order.status === "OPEN").length,
    },

    approvals,

    operationalAnalytics: {
      orderItems: orderItems.length,
      kitchenItems: kitchenItems.length,
      barItems: barItems.length,
    },

    monitoring: {
      status: "OK",
      generatedAt: new Date().toISOString(),
    },

    workflowLogs,

    aiDecisions,

    kitchen: {
      totalItems: kitchenItems.length,
      pending,
      preparing,
      ready,
      kitchenLoad,
      stationLoad: {
        kitchen: kitchenItems.length,
        bar: barItems.length,
      },
    },

    predictions: [],

    runtime: {
      generatedAt: new Date().toISOString(),
      tenantId,
      workflowCount: workflowLogs.length,
      aiDecisionCount: aiDecisions.length,
      approvalCount: approvals.length,
      predictionCount: 0,
      kitchenStatus: kitchenLoad,
    },
  };
}

export default loadExecutiveDashboard;
