import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const tenant_id = "76e2caa6-dd78-49e5-b0f5-1ff94185c2d4";




export async function POST() {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceKey) {
  throw new Error("Missing Supabase environment variables");
}

const supabase = createClient(supabaseUrl, serviceKey);
    const alerts = [];

    const createTaskIfNotExists = async (message, type) => {
      const { data: existing } = await supabase
        .from("tasks")
        .select("id")
        .eq("tenant_id", tenant_id)
        .eq("message", message)
        .eq("status", "open")
        .maybeSingle();

      if (existing) return;

      await supabase.from("tasks").insert({
        tenant_id,
        type,
        message,
        status: "open",
      });
    };

    const now = new Date();
    const start = new Date(now.setHours(0, 0, 0, 0)).toISOString();
    const end = new Date(now.setHours(23, 59, 59, 999)).toISOString();

    const { data: profitData } = await supabase
      .from("order_profit_view")
      .select("revenue, profit, created_at")
      .eq("tenant_id", tenant_id)
      .gte("created_at", start)
      .lte("created_at", end);

    let totalRevenue = 0;
    let totalProfit = 0;

    for (const row of profitData || []) {
      totalRevenue += Number(row.revenue || 0);
      totalProfit += Number(row.profit || 0);
    }

    if (totalRevenue > 0) {
      const margin = (totalProfit / totalRevenue) * 100;

      if (margin < 0) {
        alerts.push({
          alert_type: "finance",
          severity: "critical",
          message: "🚨 Negative profit today",
        });
      } else if (margin < 20) {
        alerts.push({
          alert_type: "finance",
          severity: "warning",
          message: "⚠ Low profit margin today",
        });

        await createTaskIfNotExists("Review low margin dishes", "analysis");
      }
    }

    const { data: ingredients } = await supabase
      .from("ingredients")
      .select("id, name, quantity")
      .eq("tenant_id", tenant_id);

    for (const item of ingredients || []) {
      const qty = parseInt(item.quantity ?? 0, 10);
      const name = item.name || item.id;

      if (qty <= 5 && qty > 0) {
        alerts.push({
          alert_type: "stock",
          severity: "warning",
          message: `⚠ Low ingredient: ${name}`,
        });

        await createTaskIfNotExists(`Order more: ${name}`, "purchase");
      }
    }

    const { data: dishStock } = await supabase
      .from("dish_stock")
      .select("*")
      .eq("tenant_id", tenant_id);

    const { data: dishes } = await supabase
      .from("dishes")
      .select("id, name")
      .eq("tenant_id", tenant_id);

    const { data: sales } = await supabase
      .from("daily_sales_items")
      .select("dish_id, quantity")
      .eq("tenant_id", tenant_id)
      .gte("created_at", start)
      .lte("created_at", end);

    const dishMap = {};
    for (const d of dishes || []) {
      dishMap[d.id] = d.name;
    }

    const salesMap = {};
    for (const s of sales || []) {
      if (!salesMap[s.dish_id]) salesMap[s.dish_id] = 0;
      salesMap[s.dish_id] += Number(s.quantity || 0);
    }

    for (const item of dishStock || []) {
      const qty = parseInt(item.quantity ?? 0, 10);
      const name = dishMap[item.dish_id] || item.dish_id;
      const soldToday = salesMap[item.dish_id] || 0;

      if (qty <= 2) {
        alerts.push({
          alert_type: "stock",
          severity: "critical",
          message: `🚨 LOW STOCK CRITICAL: ${name}`,
        });

        await createTaskIfNotExists(`URGENT: Produce ${name}`, "production");
      } else if (qty <= 5 && soldToday > 0) {
        alerts.push({
          alert_type: "stock",
          severity: "warning",
          message: `⚠ Low dish stock: ${name}`,
        });
      }
    }

    const { data: activeOrders } = await supabase
      .from("orders")
      .select("id")
      .eq("tenant_id", tenant_id)
      .in("kitchen_status", ["pending", "cooking"]);

    if ((activeOrders || []).length === 0) {
      alerts.push({
        alert_type: "operations",
        severity: "info",
        message: "⚠ Kitchen idle (no active orders)",
      });

      await createTaskIfNotExists(
        "Run promotion or notify staff",
        "operations"
      );
    }

    await supabase.from("alerts").delete().eq("tenant_id", tenant_id);

    const uniqueMap = new Map();
    for (const a of alerts) {
      if (!uniqueMap.has(a.message)) {
        uniqueMap.set(a.message, a);
      }
    }

    const uniqueAlerts = Array.from(uniqueMap.values());

    if (uniqueAlerts.length > 0) {
      const insertData = uniqueAlerts.map((a) => ({
        tenant_id,
        alert_type: a.alert_type,
        severity: a.severity,
        message: a.message,
        created_at: new Date().toISOString(),
      }));

      await supabase.from("alerts").insert(insertData);
    }

    return Response.json({
      success: true,
      alerts_created: uniqueAlerts.length,
    });
  } catch (err) {
    console.error("CONTROL SCAN ERROR:", err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}