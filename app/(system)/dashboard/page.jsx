"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import AppShell from "../../AppShell";
import { supabase } from "@/lib/supabase";

function safeJsonParse(value, fallback) {
  try {
    const parsed = JSON.parse(value);
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

function normalizeText(value) {
  return String(value || "").trim().toLowerCase();
}

function getStaffDisplayName(member) {
  return member?.staff_name || member?.name || member?.staff || "Staff";
}

export default function DashboardPage() {
  const [revenue, setRevenue] = useState(0);
  const [orders, setOrders] = useState(0);
  const [avg, setAvg] = useState(0);
  const [performance, setPerformance] = useState(0);
const [controlAlerts, setControlAlerts] = useState([]);
  const [realRevenue, setRealRevenue] = useState(0);
  const [realCost, setRealCost] = useState(0);
  const [realProfit, setRealProfit] = useState(0);
const [tasks, setTasks] = useState([]);
  const [revTrend, setRevTrend] = useState(0);
  const [orderTrend, setOrderTrend] = useState(0);
const [lowIngredients, setLowIngredients] = useState([]);
  const [staff, setStaff] = useState([]);
  const [payouts, setPayouts] = useState([]);

  const [serviceCharge, setServiceCharge] = useState(0);
  const [adjustedPool, setAdjustedPool] = useState(0);
  const [basePerStaff, setBasePerStaff] = useState(0);

  const [departmentPenalties, setDepartmentPenalties] = useState([]);
  const [approvalImpact, setApprovalImpact] = useState([]);

  const [serviceLevel, setServiceLevel] = useState(5);
  const [pendingApprovals, setPendingApprovals] = useState(0);
  const [systemStatus, setSystemStatus] = useState("OPEN");

  const loadFinance = async () => {
    const tenant_id = "76e2caa6-dd78-49e5-b0f5-1ff94185c2d4";

    const today = new Date();
    const start = new Date(today.setHours(0, 0, 0, 0)).toISOString();
    const end = new Date(today.setHours(23, 59, 59, 999)).toISOString();

    const { data, error } = await supabase
      .from("order_profit_view")
      .select("revenue, cost, profit, created_at")
      .eq("tenant_id", tenant_id)
      .gte("created_at", start)
      .lte("created_at", end);

    if (error) {
      console.error("FINANCE ERROR:", error);
      setRealRevenue(0);
      setRealCost(0);
      setRealProfit(0);
      return {
        revenue: 0,
        cost: 0,
        profit: 0,
      };
    }

    let financeRevenue = 0;
    let financeCost = 0;
    let financeProfit = 0;

    for (const row of data || []) {
      financeRevenue += Number(row.revenue || 0);
      financeCost += Number(row.cost || 0);
      financeProfit += Number(row.profit || 0);
    }

    setRevenue(financeRevenue);
setOrders((data || []).length);

const avgOrder =
  (data || []).length > 0
    ? financeRevenue / data.length
    : 0;

setAvg(avgOrder);

    return {
      revenue: financeRevenue,
      cost: financeCost,
      profit: financeProfit,
    };
  };


const loadControlAlerts = async () => {
  const tenant_id = "76e2caa6-dd78-49e5-b0f5-1ff94185c2d4";

  const { data, error } = await supabase
    .from("alerts") // ✅ FIXED (ONLY SOURCE NOW)
    .select("*")
    .eq("tenant_id", tenant_id)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("ALERT ERROR:", error);
    return;
  }

  console.log("ALERTS LOADED:", data);

  setControlAlerts(data || []);
};

const loadTrends = async () => {
  const tenant_id = "76e2caa6-dd78-49e5-b0f5-1ff94185c2d4";

  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  const startToday = new Date(today.setHours(0,0,0,0)).toISOString();
  const endToday = new Date(today.setHours(23,59,59,999)).toISOString();

  const startYesterday = new Date(yesterday.setHours(0,0,0,0)).toISOString();
  const endYesterday = new Date(yesterday.setHours(23,59,59,999)).toISOString();

  const { data: todayOrders } = await supabase
    .from("orders")
    .select("total")
    .gte("created_at", startToday)
    .lte("created_at", endToday);

  const { data: yesterdayOrders } = await supabase
    .from("orders")
    .select("total")
    .gte("created_at", startYesterday)
    .lte("created_at", endYesterday);

  const todayRevenue = (todayOrders || []).reduce(
    (s, o) => s + Number(o.total || 0),
    0
  );

  const yesterdayRevenue = (yesterdayOrders || []).reduce(
    (s, o) => s + Number(o.total || 0),
    0
  );

  const revChange =
    yesterdayRevenue === 0
      ? 0
      : ((todayRevenue - yesterdayRevenue) / yesterdayRevenue) * 100;

  const orderChange =
    yesterdayOrders.length === 0
      ? 0
      : ((todayOrders.length - yesterdayOrders.length) /
          yesterdayOrders.length) *
        100;

  setRevTrend(Math.round(revChange));
  setOrderTrend(Math.round(orderChange));
};
const getServicePercent = (score) => {
  if (score >= 90) return 0.07;
  if (score >= 70) return 0.06;
  return 0.05;
};

const calculatePending = () => {
  const rejections = safeJsonParse(
    localStorage.getItem("approval_rejections"),
    []
  );

  const attendance = safeJsonParse(
    localStorage.getItem("staff_attendance"),
    []
  );

  const history = safeJsonParse(localStorage.getItem("history"), []);

  const pendingLate = attendance.filter(
    (item) => item.late && item.status === "pending"
  ).length;

  const pendingSalary = (history[history.length - 1]?.staff || []).filter(
    (member) => !member.approved
  ).length;

  const totalPending = pendingLate + pendingSalary + rejections.length;
setPendingApprovals(totalPending);

// ⚠️ DO NOT override alert-based status
setSystemStatus((prev) => {
  if (prev === "BLOCKED") return prev; // alerts always win
  if (totalPending > 0) return "READY"; // ⚠ don't turn system red
  return "READY";
});
};
const loadTasks = async () => {
  const tenant_id = "76e2caa6-dd78-49e5-b0f5-1ff94185c2d4";

  const { data, error } = await supabase
    .from("tasks")
    .select("*")
    .eq("tenant_id", tenant_id)
    .eq("status", "open")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("TASK LOAD ERROR:", error);
    return;
  }

  console.log("TASKS LOADED:", data);

  setTasks(data || []);
};
let hasRun = false;
useEffect(() => {
  if (hasRun) return;
  hasRun = true;

  const run = async () => {
    try {
      console.log("RUNNING...");
await loadTasks();
      const finance = await loadFinance();

      // 🔹 Load performance first
      await fetchPerformance(finance?.serviceCharge, finance?.revenue);

      // 🔹 Load existing alerts
      await loadControlAlerts();

      // 🔹 Run scan and wait for it
      await fetch("/api/control/scan", { method: "POST" });

      console.log("SCAN DONE → RELOAD ALERTS");
const tenant_id = "76e2caa6-dd78-49e5-b0f5-1ff94185c2d4";

const { data: ingredients } = await supabase
  .from("ingredients")
  .select("name, quantity")
  .eq("tenant_id", tenant_id);

const low = (ingredients || []).filter(i => Number(i.quantity) <= 5);

setLowIngredients(low);
      const { data, error } = await supabase
        .from("alerts")
        .select("*")
        .eq("tenant_id", tenant_id)
        .order("created_at", { ascending: false });

      if (error) {
        console.error("ALERT ERROR:", error);
        return;
      }

      console.log("ALERTS AFTER SCAN:", data);

      setControlAlerts(data || []);

      const hasCritical = (data || []).some(
        (a) => a.severity === "critical"
      );

      if (hasCritical) {
        setSystemStatus("BLOCKED");
      } else {
        setSystemStatus("READY");
      }

      // 🔹 Other systems
      
      calculatePending();
      await loadTrends();

    } catch (err) {
      console.error("RUN FAILED:", err);
    }
  };

  run();

}, []);

  const fetchPerformance = async (sc, rev) => {
    try {
      console.log("CALLING PERFORMANCE API");
      const res = await fetch("/api/performance/list", {
        method: "GET",
        cache: "no-store",
      });

      const result = await res.json();
 console.log("PERFORMANCE RESPONSE:", result);
      if (
        !result.success ||
        !Array.isArray(result.data) ||
        result.data.length === 0
      ) {
        setStaff([]);
        setPayouts([]);
        setDepartmentPenalties([]);
        setApprovalImpact([]);
        setPerformance(0);
        setAdjustedPool(0);
        setBasePerStaff(0);
        setServiceLevel(5);
        return;
      }

      const data = result.data;
      setStaff(data);

      const avgScore = Math.round(
        data.reduce((sum, person) => sum + Number(person.score || 0), 0) /
          data.length
      );

      setPerformance(avgScore);

      const servicePercent = getServicePercent(avgScore);
      setServiceLevel(servicePercent * 100);

      const dynamicServiceCharge = Number(rev || 0) * servicePercent;
      const serviceChargeForCalculation =
        rev !== undefined ? dynamicServiceCharge : sc;

      setServiceCharge(serviceChargeForCalculation);

      let systemMultiplier = 1;
      if (avgScore >= 90) systemMultiplier = 1;
      else if (avgScore >= 70) systemMultiplier = 0.7;
      else if (avgScore >= 40) systemMultiplier = 0.4;
      else systemMultiplier = 0.2;

      const poolAfterSystem = serviceChargeForCalculation * systemMultiplier;
      setAdjustedPool(poolAfterSystem);

      const base = data.length > 0 ? poolAfterSystem / data.length : 0;
      setBasePerStaff(base);

      const deptMap = {};

      data.forEach((person) => {
        const deptKey = normalizeText(person.department) || "unknown";
        if (!deptMap[deptKey]) deptMap[deptKey] = [];
        deptMap[deptKey].push(person);
      });

      const rejections = safeJsonParse(
        localStorage.getItem("approval_rejections"),
        []
      );

      const marketingMisses = safeJsonParse(
        localStorage.getItem("marketing_submission_penalties"),
        []
      );

      const deptPenaltyRows = [];
      const payoutRows = [];
      const approvalRows = [];

      Object.entries(deptMap).forEach(([dept, members]) => {
        const deptAvg = Math.round(
          members.reduce(
            (sum, member) => sum + Number(member.score || 0),
            0
          ) / members.length
        );

        let deptMultiplier = 1;
        if (deptAvg >= 90) deptMultiplier = 1;
        else if (deptAvg >= 70) deptMultiplier = 0.85;
        else if (deptAvg >= 40) deptMultiplier = 0.6;
        else deptMultiplier = 0.3;

        const foodRejectCount = rejections.filter(
          (entry) =>
            normalizeText(entry.applies_to) === "kitchen_team" &&
            dept === "kitchen"
        ).length;

        const routineRejectCount = rejections.filter((entry) => {
          const appliesTo = normalizeText(entry.applies_to);
          const entryDept = normalizeText(entry.department);
          return appliesTo === dept || entryDept === dept;
        }).length;

        const departmentHardPenalty =
          foodRejectCount * 0.15 + routineRejectCount * 0.1;

        deptPenaltyRows.push({
          dept,
          avg: deptAvg,
          multiplier: deptMultiplier,
          foodRejectCount,
          routineRejectCount,
          departmentHardPenalty,
        });

        members.forEach((member) => {
          const displayName = getStaffDisplayName(member);
          const memberName = normalizeText(displayName);
          const memberDept = normalizeText(member.department) || dept;

          let individualMultiplier = 1;
          if (Number(member.score || 0) >= 90) individualMultiplier = 1.1;
          else if (Number(member.score || 0) >= 70) individualMultiplier = 1;
          else if (Number(member.score || 0) >= 40) individualMultiplier = 0.7;
          else individualMultiplier = 0.4;

          let attendancePenalty = 1;
          if (member.late) attendancePenalty -= 0.1;
          if (member.absent) attendancePenalty -= 0.3;

          const personalMarketingPenaltyCount = marketingMisses.filter(
            (entry) => normalizeText(entry.name) === memberName
          ).length;

          const personalMarketingHardPenalty =
            personalMarketingPenaltyCount * 0.15;

          let hardPenaltyMultiplier =
            1 - departmentHardPenalty - personalMarketingHardPenalty;

          if (hardPenaltyMultiplier < 0.2) hardPenaltyMultiplier = 0.2;

          const payout =
            base *
            deptMultiplier *
            individualMultiplier *
            attendancePenalty *
            hardPenaltyMultiplier;

          payoutRows.push({
            name: displayName,
            dept: memberDept || "unknown",
            score: Number(member.score || 0),
            payout,
            late: Boolean(member.late),
            absent: Boolean(member.absent),
            foodRejectCount,
            routineRejectCount,
            personalMarketingPenaltyCount,
            hardPenaltyMultiplier,
          });

          if (
            foodRejectCount > 0 ||
            routineRejectCount > 0 ||
            personalMarketingPenaltyCount > 0
          ) {
            approvalRows.push({
              name: displayName,
              dept: memberDept || "unknown",
              foodRejectCount,
              routineRejectCount,
              personalMarketingPenaltyCount,
              hardPenaltyMultiplier,
            });
          }
        });
      });

      setDepartmentPenalties(deptPenaltyRows);
      setPayouts(payoutRows.sort((a, b) => b.payout - a.payout));
      setApprovalImpact(approvalRows);
    } catch (err) {
      console.error(err);
    }
  };

  const getStatus = () => {
    if (performance >= 90) return { label: "GOOD", color: "text-green-400" };
    if (performance >= 70)
      return { label: "WARNING", color: "text-yellow-400" };
    return { label: "BAD", color: "text-red-400" };
  };

  const status = getStatus();

  const alerts = [];
  if (revenue < 5000) alerts.push("⚠ Low revenue today");
  if (performance < 70) alerts.push("⚠ Staff performance is low");
  if (avg < 300) alerts.push("⚠ Low average order value");
  if (approvalImpact.length > 0)
    alerts.push("⚠ Approval penalties are reducing payouts");
  if (pendingApprovals > 0)
    alerts.push("⚠ Pending approvals are blocking system readiness");

  const topStaff = payouts.slice(0, 3);

  const lowStaff = payouts
    .filter((person) => person.score < 70)
    .sort((a, b) => a.score - b.score)
    .slice(0, 3);

  const cards = [
    { name: "POS", href: "/pos" },
    { name: "Kitchen", href: "/kitchen" },
    { name: "Tables", href: "/tables" },
    { name: "Production", href: "/production" },
    { name: "Control", href: "/control-final" },
    { name: "Attendance", href: "/attendance" },
    { name: "History", href: "/history" },
    { name: "Approvals", href: "/management/approval" },
    { name: "Accounting", href: "/accounting" },
    { name: "Payout", href: "/payout" },
  ];

  const Trend = ({ value }) => {
  if (value > 0)
    return <span className="text-green-400">↑ {value}%</span>;

  if (value < 0)
    return <span className="text-red-400">↓ {Math.abs(value)}%</span>;

  return <span className="text-white/40">–</span>;
};

  return (
    <AppShell>
      <div className="min-h-screen text-white p-6 max-w-7xl mx-auto space-y-10">
        {/* HERO */}
        <div className="bg-white/5 border border-white/10 rounded-3xl p-8">
          <div className="text-white/50 text-sm">System Overview</div>

          <div className="text-4xl mt-2 font-bold">
            ฿{revenue.toLocaleString()}
          </div>

          <div className="text-sm text-white/60 mt-2">
            Orders: {orders} | Avg: ฿{avg.toLocaleString()}
          </div>

          <div className="mt-4 flex gap-6 text-lg flex-wrap">
            <div>Performance: {performance}%</div>
            <div className={status.color}>{status.label}</div>
            <div className="text-orange-400">
              Service Level: {serviceLevel}%
            </div>
          </div>

          <div className="mt-4 flex gap-6 text-lg flex-wrap">
            <div className="text-green-400">
              Real Revenue: ฿{realRevenue.toFixed(0)}
            </div>
            <div className="text-red-400">COGS: ฿{realCost.toFixed(0)}</div>
            <div className="text-blue-400 font-bold">
              Profit: ฿{realProfit.toFixed(0)}
            </div>
          </div>
        </div>

        {/* SYSTEM STATUS */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <div className="text-white/50 text-sm">System Status</div>
              <div
                className={`text-2xl mt-1 font-semibold ${
                  systemStatus === "READY" ? "text-green-400" : "text-red-400"
                }`}
              >
                {systemStatus}
              </div>
            </div>

            <div>
              <div className="text-white/50 text-sm">Pending Approvals</div>
              <div className="text-2xl mt-1 font-semibold text-yellow-400">
                {pendingApprovals}
              </div>
            </div>

            <div>
              <div className="text-white/50 text-sm">
                Service Charge Level
              </div>
              <div className="text-2xl mt-1 font-semibold text-orange-400">
                {serviceLevel}%
              </div>
            </div>
          </div>
        </div>

        {/* POOL */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
          <div>Service Charge: ฿{serviceCharge.toFixed(0)}</div>
          <div className="text-orange-400 mt-1">
            Adjusted Pool: ฿{adjustedPool.toFixed(0)}
          </div>
          <div className="text-green-400 font-bold mt-2">
            Base Per Staff: ฿{basePerStaff.toFixed(0)}
          </div>
        </div>

        {/* TRENDS */}
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
            <div className="text-white/50 text-sm">Revenue Change</div>
            <div className="text-xl mt-1">
              <Trend value={revTrend} />
            </div>
          </div>

          <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
            <div className="text-white/50 text-sm">Order Change</div>
            <div className="text-xl mt-1">
              <Trend value={orderTrend} />
            </div>
          </div>
        </div>

        {/* SYSTEM ALERTS */}
      <div className="bg-purple-500/10 border border-purple-500/20 rounded-2xl p-4">
  <div className="text-white/70 text-sm mb-2">AI Alerts</div>

  {controlAlerts && controlAlerts.length > 0 ? (
  controlAlerts.map((alert, index) => (
    <div
      key={alert.id || index}
      className={`text-sm mb-1 ${
        alert.severity === "critical"
          ? "text-red-400"
          : alert.severity === "warning"
          ? "text-yellow-400"
          : "text-blue-400"
      }`}
    >
      {alert.message}
    </div>
  ))
) : (
  <div className="text-white/40 text-sm">
    Checking system...
  </div>
)}
</div>
        {/* ALERTS */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
  <div className="text-white/70 text-sm mb-2">Tasks</div>

  {tasks.length === 0 ? (
    <div className="text-white/40 text-sm">No tasks</div>
  ) : (
    tasks.map((task, i) => (
      <div key={task.id || i} className="text-sm mb-1 text-white">
        • {task.message}
      </div>
    ))
  )}
</div>
<div className="bg-white/5 p-4 rounded-xl">
  <div className="text-white font-semibold mb-2">Low Ingredients</div>

  {lowIngredients.length > 0 ? (
    lowIngredients.map((item, i) => (
      <div key={i} className="text-yellow-400 text-sm">
        {item.name} ({item.quantity})
      </div>
    ))
  ) : (
    <div className="text-white/40 text-sm">All ingredients OK</div>
  )}
</div>

        {/* DEPARTMENT IMPACT */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
          <div className="text-lg mb-3">Department Impact</div>

          {departmentPenalties.length === 0 ? (
            <div className="text-white/40">No department data</div>
          ) : (
            departmentPenalties.map((department, index) => (
              <div key={index} className="flex justify-between mb-2 text-sm">
                <div>{department.dept.toUpperCase()}</div>

                <div className="text-right">
                  <div>{department.avg}%</div>
                  <div className="text-white/40">
                    food rejects: {department.foodRejectCount} | routine
                    rejects: {department.routineRejectCount}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* APPROVAL HARD PENALTY IMPACT */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
          <div className="text-lg mb-3">Approval Impact on Payout</div>

          {approvalImpact.length === 0 ? (
            <div className="text-white/50">No approval penalties active</div>
          ) : (
            approvalImpact.map((item, index) => (
              <div
                key={`${item.name}-${index}`}
                className="flex justify-between mb-2 text-sm"
              >
                <div>
                  {item.name} ({item.dept})
                </div>

                <div className="text-right">
                  <div className="text-orange-300">
                    payout x {item.hardPenaltyMultiplier.toFixed(2)}
                  </div>
                  <div className="text-white/40">
                    food: {item.foodRejectCount} | routine:{" "}
                    {item.routineRejectCount} | marketing:{" "}
                    {item.personalMarketingPenaltyCount}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* TOP PERFORMERS */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
          <div className="text-lg mb-3">Top Performers</div>

          {topStaff.length === 0 ? (
            <div className="text-white/40">No data</div>
          ) : (
            topStaff.map((staffMember, index) => (
              <div key={index} className="flex justify-between mb-2">
                <div>{staffMember.name}</div>
                <div className="text-green-400">{staffMember.score}%</div>
              </div>
            ))
          )}
        </div>

        {/* NEEDS ATTENTION */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
          <div className="text-lg mb-3">Needs Attention</div>

          {lowStaff.length === 0 ? (
            <div className="text-white/50">All staff performing well</div>
          ) : (
            lowStaff.map((staffMember, index) => (
              <div key={index} className="flex justify-between mb-2">
                <div>{staffMember.name}</div>
                <div className="text-red-400">{staffMember.score}%</div>
              </div>
            ))
          )}
        </div>

        {/* FINAL PAYOUT */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
          <div className="text-lg mb-4">Final Staff Payout</div>

          {payouts.length === 0 ? (
            <div className="text-white/40">No payout data</div>
          ) : (
            payouts.map((payout, index) => (
              <div key={index} className="flex justify-between mb-2 text-sm">
                <div>
                  {payout.name} ({payout.dept})
                  {payout.late && " ⚠ Late"}
                  {payout.absent && " ❌ Absent"}
                </div>

                <div className="text-green-400">
                  ฿{payout.payout.toFixed(0)}
                </div>
              </div>
            ))
          )}
        </div>

        {/* NAV */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {cards.map((card, index) => (
            <Link
              key={index}
              href={card.href}
              className="bg-white/5 p-6 rounded-2xl text-center hover:bg-white/10 transition"
            >
              {card.name}
            </Link>
          ))}
        </div>
      </div>
    </AppShell>
  );
}