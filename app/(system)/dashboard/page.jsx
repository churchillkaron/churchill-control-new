"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

const TENANT_ID = "76e2caa6-dd78-49e5-b0f5-1ff94185c2d4";

function money(value) {
  return `฿${Number(value || 0).toLocaleString(undefined, {
    maximumFractionDigits: 0,
  })}`;
}

function percent(value) {
  return `${Number(value || 0).toFixed(0)}%`;
}

function getTodayRange() {
  const now = new Date();

  const start = new Date(now);
  start.setHours(0, 0, 0, 0);

  const end = new Date(now);
  end.setHours(23, 59, 59, 999);

  return {
    start: start.toISOString(),
    end: end.toISOString(),
  };
}

function getScoreStatus(score) {
  const value = Number(score || 0);

  if (value >= 90) {
    return {
      label: "GOOD",
      color: "text-green-400",
      bg: "bg-green-500/10",
      border: "border-green-500/20",
    };
  }

  if (value >= 70) {
    return {
      label: "WARNING",
      color: "text-yellow-400",
      bg: "bg-yellow-500/10",
      border: "border-yellow-500/20",
    };
  }

  if (value >= 40) {
    return {
      label: "BAD",
      color: "text-orange-400",
      bg: "bg-orange-500/10",
      border: "border-orange-500/20",
    };
  }

  return {
    label: "CRITICAL",
    color: "text-red-400",
    bg: "bg-red-500/10",
    border: "border-red-500/20",
  };
}

export default function DashboardPage() {
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);

  const [revenue, setRevenue] = useState(0);
  const [cost, setCost] = useState(0);
  const [profit, setProfit] = useState(0);
  const [orders, setOrders] = useState(0);
  const [avgOrder, setAvgOrder] = useState(0);

  const [todayOrders, setTodayOrders] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [lowIngredients, setLowIngredients] = useState([]);
  const [lowDishes, setLowDishes] = useState([]);

  const [latestHistory, setLatestHistory] = useState(null);
  const [staff, setStaff] = useState([]);

  const [openOrders, setOpenOrders] = useState([]);
  const [kitchenPending, setKitchenPending] = useState([]);
  const [recentHistory, setRecentHistory] = useState([]);

  const [systemStatus, setSystemStatus] = useState("READY");

  const loadFinance = async () => {
    const { start, end } = getTodayRange();

    const { data, error } = await supabase
      .from("order_profit_view")
      .select("revenue, cost, profit, created_at")
      .eq("tenant_id", TENANT_ID)
      .gte("created_at", start)
      .lte("created_at", end);

    if (error) {
      console.error("FINANCE LOAD ERROR:", error);
      setRevenue(0);
      setCost(0);
      setProfit(0);
      setOrders(0);
      setAvgOrder(0);
      return;
    }

    const rows = data || [];

    const totalRevenue = rows.reduce(
      (sum, row) => sum + Number(row.revenue || 0),
      0
    );

    const totalCost = rows.reduce(
      (sum, row) => sum + Number(row.cost || 0),
      0
    );

    const totalProfit = rows.reduce(
      (sum, row) => sum + Number(row.profit || 0),
      0
    );

    setRevenue(totalRevenue);
    setCost(totalCost);
    setProfit(totalProfit);
    setOrders(rows.length);
    setAvgOrder(rows.length > 0 ? totalRevenue / rows.length : 0);
  };

  const loadTodayOrders = async () => {
    const { start, end } = getTodayRange();

    const { data, error } = await supabase
      .from("orders")
      .select("*")
      .eq("tenant_id", TENANT_ID)
      .gte("created_at", start)
      .lte("created_at", end)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("ORDER LOAD ERROR:", error);
      setTodayOrders([]);
      setOpenOrders([]);
      setKitchenPending([]);
      return;
    }

    const rows = data || [];

    setTodayOrders(rows);

    setOpenOrders(
      rows.filter((order) => {
        const status = String(order.status || "").toLowerCase();
        return status !== "paid" && status !== "closed";
      })
    );

    setKitchenPending(
      rows.filter((order) => {
        const kitchenStatus = String(order.kitchen_status || "").toLowerCase();
        return kitchenStatus !== "done" && kitchenStatus !== "served";
      })
    );
  };

  const loadAlerts = async () => {
    const { data, error } = await supabase
      .from("alerts")
      .select("*")
      .eq("tenant_id", TENANT_ID)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("ALERT LOAD ERROR:", error);
      setAlerts([]);
      return;
    }

    const rows = data || [];
    setAlerts(rows);

    const hasCritical = rows.some(
      (alert) => String(alert.severity || "").toLowerCase() === "critical"
    );

    setSystemStatus(hasCritical ? "BLOCKED" : "READY");
  };

  const loadTasks = async () => {
    const { data, error } = await supabase
      .from("tasks")
      .select("*")
      .eq("tenant_id", TENANT_ID)
      .eq("status", "open")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("TASK LOAD ERROR:", error);
      setTasks([]);
      return;
    }

    setTasks(data || []);
  };

  const loadLowIngredients = async () => {
    const { data, error } = await supabase
      .from("ingredients")
      .select("id, name, quantity")
      .eq("tenant_id", TENANT_ID);

    if (error) {
      console.error("INGREDIENT LOAD ERROR:", error);
      setLowIngredients([]);
      return;
    }

    setLowIngredients(
      (data || [])
        .filter((item) => Number(item.quantity || 0) <= 5)
        .sort((a, b) => Number(a.quantity || 0) - Number(b.quantity || 0))
    );
  };

  const loadLowDishes = async () => {
    const { data: stock, error: stockError } = await supabase
      .from("dish_stock")
      .select("dish_id, quantity")
      .eq("tenant_id", TENANT_ID);

    if (stockError) {
      console.error("DISH STOCK LOAD ERROR:", stockError);
      setLowDishes([]);
      return;
    }

    const { data: dishes, error: dishError } = await supabase
      .from("dishes")
      .select("id, name")
      .eq("tenant_id", TENANT_ID);

    if (dishError) {
      console.error("DISH LOAD ERROR:", dishError);
      setLowDishes([]);
      return;
    }

    const dishMap = {};

    for (const dish of dishes || []) {
      dishMap[dish.id] = dish.name;
    }

    const low = (stock || [])
      .filter((item) => Number(item.quantity || 0) <= 5)
      .map((item) => ({
        dish_id: item.dish_id,
        name: dishMap[item.dish_id] || item.dish_id,
        quantity: Number(item.quantity || 0),
      }))
      .sort((a, b) => a.quantity - b.quantity);

    setLowDishes(low);
  };

  const loadHistory = async () => {
    const { data, error } = await supabase
      .from("history_days")
      .select("*")
      .eq("tenant_id", TENANT_ID)
      .order("created_at", { ascending: false })
      .limit(7);

    if (error) {
      console.error("HISTORY LOAD ERROR:", error);
      setLatestHistory(null);
      setStaff([]);
      setRecentHistory([]);
      return;
    }

    const rows = data || [];
    const latest = rows[0] || null;

    setRecentHistory(rows);
    setLatestHistory(latest);
    setStaff(Array.isArray(latest?.staff_data) ? latest.staff_data : []);
  };

  const loadDashboard = async () => {
    setLoading(true);

    await Promise.all([
      loadFinance(),
      loadTodayOrders(),
      loadAlerts(),
      loadTasks(),
      loadLowIngredients(),
      loadLowDishes(),
      loadHistory(),
    ]);

    setLastUpdated(new Date());
    setLoading(false);
  };

  useEffect(() => {
    loadDashboard();

    const ordersChannel = supabase
      .channel("dashboard-orders")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "orders",
          filter: `tenant_id=eq.${TENANT_ID}`,
        },
        () => {
          loadFinance();
          loadTodayOrders();
        }
      )
      .subscribe();

    const alertsChannel = supabase
      .channel("dashboard-alerts")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "alerts",
          filter: `tenant_id=eq.${TENANT_ID}`,
        },
        () => {
          loadAlerts();
        }
      )
      .subscribe();

    const tasksChannel = supabase
      .channel("dashboard-tasks")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "tasks",
          filter: `tenant_id=eq.${TENANT_ID}`,
        },
        () => {
          loadTasks();
        }
      )
      .subscribe();

    const ingredientsChannel = supabase
      .channel("dashboard-ingredients")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "ingredients",
          filter: `tenant_id=eq.${TENANT_ID}`,
        },
        () => {
          loadLowIngredients();
        }
      )
      .subscribe();

    const dishStockChannel = supabase
      .channel("dashboard-dish-stock")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "dish_stock",
          filter: `tenant_id=eq.${TENANT_ID}`,
        },
        () => {
          loadLowDishes();
        }
      )
      .subscribe();

    const historyChannel = supabase
      .channel("dashboard-history")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "history_days",
          filter: `tenant_id=eq.${TENANT_ID}`,
        },
        () => {
          loadHistory();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(ordersChannel);
      supabase.removeChannel(alertsChannel);
      supabase.removeChannel(tasksChannel);
      supabase.removeChannel(ingredientsChannel);
      supabase.removeChannel(dishStockChannel);
      supabase.removeChannel(historyChannel);
    };
  }, []);

  const fohScore = Number(latestHistory?.foh_score || 0);
  const barScore = Number(latestHistory?.bar_score || 0);
  const kitchenScore = Number(latestHistory?.kitchen_score || 0);

  const serviceCharge =
    Number(latestHistory?.service_charge || 0) ||
    Number(latestHistory?.service_pool || 0);

  const payoutPool =
    Number(latestHistory?.payout_pool || 0) ||
    Number(latestHistory?.service_pool || 0) ||
    serviceCharge;

  const staffSorted = useMemo(() => {
    return [...staff].sort(
      (a, b) => Number(b.score || 0) - Number(a.score || 0)
    );
  }, [staff]);

  const topStaff = staffSorted.slice(0, 5);

  const lowStaff = staffSorted
    .filter((member) => Number(member.score || 0) < 70)
    .sort((a, b) => Number(a.score || 0) - Number(b.score || 0))
    .slice(0, 5);

  const payoutPreview = [...staff].sort(
    (a, b) =>
      Number(b.payrollAmount || b.payout || 0) -
      Number(a.payrollAmount || a.payout || 0)
  );

  const criticalAlerts = alerts.filter(
    (alert) => String(alert.severity || "").toLowerCase() === "critical"
  );

  const warningAlerts = alerts.filter(
    (alert) => String(alert.severity || "").toLowerCase() === "warning"
  );

  const cards = [
    { name: "POS", href: "/pos" },
    { name: "Kitchen", href: "/kitchen" },
    { name: "Tables", href: "/tables" },
    { name: "Production", href: "/production" },
    { name: "Control Final", href: "/control-final" },
    { name: "History", href: "/history" },
    { name: "Approvals", href: "/management/approval" },
    { name: "Accounting", href: "/accounting" },
    { name: "Payout", href: "/payout" },
  ];

  const fohStatus = getScoreStatus(fohScore);
  const barStatus = getScoreStatus(barScore);
  const kitchenStatus = getScoreStatus(kitchenScore);

  return (
    <div className="min-h-screen text-white p-6 max-w-7xl mx-auto space-y-8">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div>
          <div className="text-white/50 text-sm">Owner Control Center</div>
          <h1 className="text-3xl font-semibold">Dashboard</h1>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-white/40 text-xs">
            {lastUpdated
              ? `Updated ${lastUpdated.toLocaleTimeString()}`
              : "Not updated yet"}
          </div>

          <button
            onClick={loadDashboard}
            className="bg-white/10 hover:bg-white/20 border border-white/10 px-4 py-2 rounded-xl text-sm"
          >
            Refresh
          </button>
        </div>
      </div>

      {loading && (
        <div className="bg-white/5 border border-white/10 rounded-2xl p-4 text-white/50">
          Loading dashboard...
        </div>
      )}

      <div className="bg-white/5 border border-white/10 rounded-3xl p-8">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          <div className="lg:col-span-2">
            <div className="text-white/50 text-sm">Revenue Today</div>

            <div className="text-5xl mt-2 font-bold">
              {money(revenue)}
            </div>

            <div className="text-sm text-white/60 mt-3">
              Orders: {orders} | Avg Order: {money(avgOrder)}
            </div>
          </div>

          <div>
            <div className="text-white/50 text-sm">COGS</div>
            <div className="text-2xl mt-2 text-red-400">
              {money(cost)}
            </div>
          </div>

          <div>
            <div className="text-white/50 text-sm">Profit</div>
            <div
              className={`text-2xl mt-2 ${
                profit >= 0 ? "text-blue-400" : "text-red-400"
              }`}
            >
              {money(profit)}
            </div>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-black/20 rounded-2xl p-4 border border-white/10">
            <div className="text-white/50 text-sm">System Status</div>
            <div
              className={`text-2xl mt-1 font-semibold ${
                systemStatus === "READY" ? "text-green-400" : "text-red-400"
              }`}
            >
              {systemStatus}
            </div>
          </div>

          <div className="bg-black/20 rounded-2xl p-4 border border-white/10">
            <div className="text-white/50 text-sm">Critical Alerts</div>
            <div className="text-2xl mt-1 text-red-400">
              {criticalAlerts.length}
            </div>
          </div>

          <div className="bg-black/20 rounded-2xl p-4 border border-white/10">
            <div className="text-white/50 text-sm">Open Tasks</div>
            <div className="text-2xl mt-1 text-yellow-400">
              {tasks.length}
            </div>
          </div>

          <div className="bg-black/20 rounded-2xl p-4 border border-white/10">
            <div className="text-white/50 text-sm">Open Orders</div>
            <div className="text-2xl mt-1 text-orange-400">
              {openOrders.length}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div
          className={`${fohStatus.bg} ${fohStatus.border} border rounded-2xl p-6`}
        >
          <div className="text-white/50 text-sm">FOH Performance</div>
          <div className="text-4xl mt-2 font-bold">{percent(fohScore)}</div>
          <div className={`mt-2 ${fohStatus.color}`}>
            {fohStatus.label}
          </div>
        </div>

        <div
          className={`${barStatus.bg} ${barStatus.border} border rounded-2xl p-6`}
        >
          <div className="text-white/50 text-sm">Bar Performance</div>
          <div className="text-4xl mt-2 font-bold">{percent(barScore)}</div>
          <div className={`mt-2 ${barStatus.color}`}>
            {barStatus.label}
          </div>
        </div>

        <div
          className={`${kitchenStatus.bg} ${kitchenStatus.border} border rounded-2xl p-6`}
        >
          <div className="text-white/50 text-sm">Kitchen Performance</div>
          <div className="text-4xl mt-2 font-bold">
            {percent(kitchenScore)}
          </div>
          <div className={`mt-2 ${kitchenStatus.color}`}>
            {kitchenStatus.label}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
          <div className="text-white/50 text-sm">Latest Service Charge</div>
          <div className="text-3xl mt-2 text-orange-400">
            {money(serviceCharge)}
          </div>
          <div className="text-white/40 text-sm mt-2">
            From latest locked history day
          </div>
        </div>

        <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
          <div className="text-white/50 text-sm">Latest Payout Pool</div>
          <div className="text-3xl mt-2 text-green-400">
            {money(payoutPool)}
          </div>
          <div className="text-white/40 text-sm mt-2">
            Saved from Control Final
          </div>
        </div>

        <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
          <div className="text-white/50 text-sm">Staff in Latest Close</div>
          <div className="text-3xl mt-2">{staff.length}</div>
          <div className="text-white/40 text-sm mt-2">
            Staff snapshot from history_days
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
          <div className="flex justify-between items-center mb-4">
            <div>
              <div className="text-lg">Top Staff</div>
              <div className="text-white/40 text-sm">
                Read from latest Control Final snapshot
              </div>
            </div>

            <Link
              href="/history"
              className="text-sm text-orange-400 hover:text-orange-300"
            >
              View history
            </Link>
          </div>

          {topStaff.length === 0 ? (
            <div className="text-white/40">No staff performance data</div>
          ) : (
            <div className="space-y-3">
              {topStaff.map((member, index) => (
                <div
                  key={`${member.id || member.name}-${index}`}
                  className="flex justify-between bg-black/20 rounded-xl p-3"
                >
                  <div>
                    <div>{member.name || "Staff"}</div>
                    <div className="text-white/40 text-xs">
                      {member.role || member.dept || "Team"}
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="text-green-400">
                      {percent(member.score)}
                    </div>
                    <div className="text-white/40 text-xs">
                      {money(member.payrollAmount || member.payout || 0)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
          <div className="text-lg mb-1">Needs Attention</div>
          <div className="text-white/40 text-sm mb-4">
            Staff below 70% from latest locked day
          </div>

          {lowStaff.length === 0 ? (
            <div className="text-white/40">No low performance staff</div>
          ) : (
            <div className="space-y-3">
              {lowStaff.map((member, index) => (
                <div
                  key={`${member.id || member.name}-low-${index}`}
                  className="flex justify-between bg-red-500/10 border border-red-500/20 rounded-xl p-3"
                >
                  <div>
                    <div>{member.name || "Staff"}</div>
                    <div className="text-white/40 text-xs">
                      {member.role || member.dept || "Team"}
                    </div>
                  </div>

                  <div className="text-red-400">
                    {percent(member.score)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
        <div className="flex justify-between items-center mb-4">
          <div>
            <div className="text-lg">Final Staff Payout Preview</div>
            <div className="text-white/40 text-sm">
              Saved from latest Control Final. Dashboard does not calculate this.
            </div>
          </div>

          <Link
            href="/payout"
            className="text-sm text-orange-400 hover:text-orange-300"
          >
            Open payout
          </Link>
        </div>

        {payoutPreview.length === 0 ? (
          <div className="text-white/40">No payout data</div>
        ) : (
          <div className="space-y-2">
            {payoutPreview.map((member, index) => (
              <div
                key={`${member.id || member.name}-payout-${index}`}
                className="grid grid-cols-3 gap-4 bg-black/20 rounded-xl p-3 text-sm"
              >
                <div>{member.name || "Staff"}</div>

                <div className="text-white/50">
                  {member.role || member.dept || "Team"} | Score{" "}
                  {percent(member.score)}
                </div>

                <div className="text-right text-green-400">
                  {money(member.payrollAmount || member.payout || 0)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bg-purple-500/10 border border-purple-500/20 rounded-2xl p-6">
        <div className="flex justify-between items-center mb-4">
          <div>
            <div className="text-lg">AI Alerts</div>
            <div className="text-white/40 text-sm">
              Alerts from database only
            </div>
          </div>

          <div className="text-white/40 text-sm">
            {alerts.length} total
          </div>
        </div>

        {alerts.length === 0 ? (
          <div className="text-white/40">No alerts</div>
        ) : (
          <div className="space-y-2">
            {alerts.slice(0, 10).map((alert) => (
              <div
                key={alert.id}
                className={`rounded-xl p-3 border ${
                  String(alert.severity || "").toLowerCase() === "critical"
                    ? "bg-red-500/10 border-red-500/20 text-red-300"
                    : String(alert.severity || "").toLowerCase() === "warning"
                    ? "bg-yellow-500/10 border-yellow-500/20 text-yellow-300"
                    : "bg-blue-500/10 border-blue-500/20 text-blue-300"
                }`}
              >
                <div>{alert.message}</div>
                <div className="text-white/30 text-xs mt-1">
                  {alert.created_at
                    ? new Date(alert.created_at).toLocaleString()
                    : ""}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
          <div className="flex justify-between items-center mb-4">
            <div>
              <div className="text-lg">Open Tasks</div>
              <div className="text-white/40 text-sm">Task system</div>
            </div>

            <div className="text-yellow-400">{tasks.length}</div>
          </div>

          {tasks.length === 0 ? (
            <div className="text-white/40">No tasks</div>
          ) : (
            <div className="space-y-2">
              {tasks.slice(0, 8).map((task) => (
                <div key={task.id} className="bg-black/20 rounded-xl p-3">
                  <div className="text-sm">{task.message}</div>
                  <div className="text-white/30 text-xs mt-1">
                    {task.created_at
                      ? new Date(task.created_at).toLocaleString()
                      : ""}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
          <div className="flex justify-between items-center mb-4">
            <div>
              <div className="text-lg">Low Ingredients</div>
              <div className="text-white/40 text-sm">Raw stock</div>
            </div>

            <div className="text-yellow-400">{lowIngredients.length}</div>
          </div>

          {lowIngredients.length === 0 ? (
            <div className="text-white/40">All ingredients OK</div>
          ) : (
            <div className="space-y-2">
              {lowIngredients.map((item) => (
                <div
                  key={item.id}
                  className="flex justify-between bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-3"
                >
                  <div>{item.name}</div>
                  <div className="text-yellow-300">{item.quantity}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
          <div className="flex justify-between items-center mb-4">
            <div>
              <div className="text-lg">Low Dish Stock</div>
              <div className="text-white/40 text-sm">Ready-to-sell stock</div>
            </div>

            <div className="text-orange-400">{lowDishes.length}</div>
          </div>

          {lowDishes.length === 0 ? (
            <div className="text-white/40">Dish stock OK</div>
          ) : (
            <div className="space-y-2">
              {lowDishes.map((dish) => (
                <div
                  key={dish.dish_id}
                  className="flex justify-between bg-orange-500/10 border border-orange-500/20 rounded-xl p-3"
                >
                  <div>{dish.name}</div>
                  <div className="text-orange-300">{dish.quantity}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
          <div className="text-lg mb-4">Kitchen Pending</div>

          {kitchenPending.length === 0 ? (
            <div className="text-white/40">No kitchen pending orders</div>
          ) : (
            <div className="space-y-2">
              {kitchenPending.slice(0, 8).map((order) => (
                <div
                  key={order.id}
                  className="flex justify-between bg-black/20 rounded-xl p-3"
                >
                  <div>
                    <div>Table {order.table_number || order.table || "-"}</div>
                    <div className="text-white/40 text-xs">
                      {order.kitchen_status || "pending"}
                    </div>
                  </div>

                  <div className="text-right">
                    <div>{money(order.total)}</div>
                    <div className="text-white/30 text-xs">
                      {order.created_at
                        ? new Date(order.created_at).toLocaleTimeString()
                        : ""}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
          <div className="text-lg mb-4">Recent Closed Days</div>

          {recentHistory.length === 0 ? (
            <div className="text-white/40">No history yet</div>
          ) : (
            <div className="space-y-2">
              {recentHistory.map((day) => (
                <div
                  key={day.id}
                  className="grid grid-cols-3 gap-4 bg-black/20 rounded-xl p-3 text-sm"
                >
                  <div>
                    {day.day_date
                      ? new Date(day.day_date).toLocaleDateString()
                      : day.created_at
                      ? new Date(day.created_at).toLocaleDateString()
                      : "-"}
                  </div>

                  <div className="text-white/50">
                    FOH {percent(day.foh_score)}
                  </div>

                  <div className="text-right text-green-400">
                    {money(day.final_revenue || day.revenue || 0)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
        <div className="text-lg mb-4">Navigation</div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {cards.map((card) => (
            <Link
              key={card.href}
              href={card.href}
              className="bg-black/20 border border-white/10 p-5 rounded-2xl text-center hover:bg-white/10 transition"
            >
              {card.name}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}