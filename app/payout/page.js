"use client";

import { useEffect, useState } from "react";
import AppShell from "../AppShell";

export default function Payout() {
  const [revenue, setRevenue] = useState(0);
  const [serviceCharge, setServiceCharge] = useState(0);
  const [fohPool, setFohPool] = useState(0);
  const [staffBreakdown, setStaffBreakdown] = useState([]);
  const [serviceLevel, setServiceLevel] = useState(5);

  const loadData = () => {
    const historyDay =
      JSON.parse(localStorage.getItem("history_day")) || {};
    const history =
      JSON.parse(localStorage.getItem("history")) || [];

    const orders = historyDay.paidOrders || [];
    const totalRevenue = historyDay.revenue || 0;

    setRevenue(totalRevenue);

    // 🔥 SAME SERVICE LEVEL LOGIC (SYSTEM-WIDE)
    const last30Days = history.slice(-30);

    let level = 5;

    if (last30Days.length > 0) {
      const avgRevenue =
        last30Days.reduce((sum, d) => sum + (d.revenue || 0), 0) /
        last30Days.length;

      const avgOrders =
        last30Days.reduce(
          (sum, d) => sum + (d.paidOrders?.length || 0),
          0
        ) / last30Days.length;

      const avgOrderValue =
        avgRevenue / (avgOrders || 1);

      if (avgOrderValue > 500 && avgOrders > 80) level = 7;
      else if (avgOrderValue > 350 && avgOrders > 40) level = 6;
    }

    setServiceLevel(level);

    const service = totalRevenue * (level / 100);
    setServiceCharge(service);

    const foh = service * 0.5;
    setFohPool(foh);

    // 🔥 STAFF PERFORMANCE CALC
    const staffMap = {};

    orders.forEach((order) => {
      if (!order.staff) return;

      if (!staffMap[order.staff]) {
        staffMap[order.staff] = {
          revenue: 0,
          orders: 0,
        };
      }

      staffMap[order.staff].revenue += order.total;
      staffMap[order.staff].orders += 1;
    });

    const totalFOHRevenue =
      Object.values(staffMap).reduce((sum, s) => sum + s.revenue, 0) || 1;

    const breakdown = Object.entries(staffMap).map(([name, data]) => {
      const avgOrder = data.revenue / data.orders;

      // 🔥 PERFORMANCE SCORE (same system)
      const score =
        (data.revenue / totalFOHRevenue) * 50 +
        (data.orders / orders.length) * 30 +
        (avgOrder / 1000) * 20;

      let level = "GOOD";
      let multiplier = 1;

      if (score < 40) {
        level = "CRITICAL";
        multiplier = 0.2;
      } else if (score < 60) {
        level = "BAD";
        multiplier = 0.4;
      } else if (score < 80) {
        level = "WARNING";
        multiplier = 0.7;
      }

      return {
        name,
        revenue: data.revenue,
        orders: data.orders,
        score: Math.round(score),
        level,
        multiplier,
      };
    });

    // 🔥 DISTRIBUTION BASED ON MULTIPLIER
    const totalWeight = breakdown.reduce(
      (sum, s) => sum + s.multiplier,
      0
    );

    breakdown.forEach((s) => {
      s.payout = Math.round((s.multiplier / totalWeight) * foh);
    });

    breakdown.sort((a, b) => b.payout - a.payout);

    setStaffBreakdown(breakdown);
  };

  useEffect(() => {
    loadData();

    const handleStorageChange = () => {
      loadData();
    };

    window.addEventListener("storage", handleStorageChange);

    return () => {
      window.removeEventListener("storage", handleStorageChange);
    };
  }, []);

  return (
    <AppShell>
      <div className="space-y-14">

        {/* HEADER */}
        <div>
          <h1 className="text-3xl text-white/90">
            Payout System
          </h1>
          <p className="text-white/50 text-sm">
            Service charge distribution based on real performance
          </p>
        </div>

        {/* HERO */}
        <div className="grid md:grid-cols-4 gap-6">

          <Card label="Revenue" value={`THB ${revenue.toLocaleString()}`} />
          <Card label="Service Level" value={`${serviceLevel}%`} />
          <Card label="Service Charge" value={`THB ${Math.round(serviceCharge).toLocaleString()}`} />
          <Card label="FOH Pool" value={`THB ${Math.round(fohPool).toLocaleString()}`} highlight />

        </div>

        {/* STAFF */}
        <div className="space-y-6">

          <h2 className="text-xl text-white/80">
            FOH Payout
          </h2>

          {staffBreakdown.length === 0 && (
            <div className="text-white/40">
              No paid orders yet
            </div>
          )}

          {staffBreakdown.map((s, i) => (
            <div key={i} className="bg-white/[0.06] border border-white/10 p-6 rounded-2xl">

              <div className="flex justify-between mb-3">
                <div>{s.name}</div>
                <div className="text-[#ff7a00]">
                  THB {s.payout.toLocaleString()}
                </div>
              </div>

              <div className="text-sm text-white/60 space-y-1">
                <div>Revenue: THB {s.revenue.toLocaleString()}</div>
                <div>Orders: {s.orders}</div>
                <div>Score: {s.score}</div>
                <div className="text-[#ffb36b]">{s.level}</div>
              </div>

            </div>
          ))}

        </div>

      </div>
    </AppShell>
  );
}

function Card({ label, value, highlight }) {
  return (
    <div className="bg-white/[0.05] border border-white/10 p-6 rounded-2xl">
      <div className="text-white/40 text-sm">{label}</div>
      <div className={`text-xl mt-1 ${highlight ? "text-[#ff7a00]" : ""}`}>
        {value}
      </div>
    </div>
  );
}