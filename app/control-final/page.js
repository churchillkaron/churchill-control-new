"use client";

import { useEffect, useState } from "react";

export default function ControlFinal() {
  const [staffName, setStaffName] = useState("");
  const [staffRole, setStaffRole] = useState("");
  const [totalRevenue, setTotalRevenue] = useState(0);
  const [totalOrders, setTotalOrders] = useState(0);
  const [avgOrderValue, setAvgOrderValue] = useState(0);

  useEffect(() => {
    const name = localStorage.getItem("staffName");
    const role = localStorage.getItem("staffRole");

    if (!name || !role) {
      window.location.href = "/";
    } else {
      setStaffName(name);
      setStaffRole(role);
    }

    loadRevenue();
  }, []);

  const loadRevenue = () => {
    const orders = JSON.parse(localStorage.getItem("orders")) || [];
    const revenue = orders.reduce((sum, o) => sum + Number(o.total), 0);
    const count = orders.length;
    const avg = count > 0 ? revenue / count : 0;

    setTotalRevenue(revenue);
    setTotalOrders(count);
    setAvgOrderValue(avg);
  };

  // 🔥 NEW: MONTHLY SERVICE CHARGE LOGIC
  const getServiceChargePercent = () => {
    const history = JSON.parse(localStorage.getItem("history")) || [];

    const sorted = [...history].sort(
      (a, b) => new Date(b.date) - new Date(a.date)
    );

    const last30 = sorted.slice(0, 30);

    if (last30.length === 0) return 5;

    const scores = last30.map((day) => day.scores?.foh || 0);

    const avgScore =
      scores.reduce((sum, val) => sum + val, 0) / scores.length;

    if (avgScore >= 85) return 7;
    if (avgScore >= 70) return 6;
    return 5;
  };

  const getFohStatus = (revenue, ordersCount, avgValue) => {
    let revenueScore = 0;
    let orderScore = 0;
    let avgScore = 0;

    if (revenue >= 50000) revenueScore = 100;
    else if (revenue >= 30000) revenueScore = 70;
    else if (revenue >= 15000) revenueScore = 40;
    else revenueScore = 20;

    if (ordersCount >= 40) orderScore = 100;
    else if (ordersCount >= 25) orderScore = 70;
    else if (ordersCount >= 10) orderScore = 40;
    else orderScore = 20;

    if (avgValue >= 1500) avgScore = 100;
    else if (avgValue >= 1000) avgScore = 70;
    else if (avgValue >= 700) avgScore = 40;
    else avgScore = 20;

    const finalScore =
      revenueScore * 0.5 +
      orderScore * 0.3 +
      avgScore * 0.2;

    if (finalScore >= 85) {
      return { status: "GOOD", level: 100, score: finalScore };
    } else if (finalScore >= 60) {
      return { status: "WARNING", level: 70, score: finalScore };
    } else if (finalScore >= 35) {
      return { status: "BAD", level: 40, score: finalScore };
    } else {
      return { status: "CRITICAL", level: 20, score: finalScore };
    }
  };

  const saveDay = () => {
    const orders = JSON.parse(localStorage.getItem("orders")) || [];

    if (orders.length === 0) {
      alert("No data to save");
      return;
    }

    const revenue = orders.reduce((sum, o) => sum + Number(o.total), 0);
    const ordersCount = orders.length;
    const avgValue = ordersCount > 0 ? revenue / ordersCount : 0;

    // 🔥 REPLACED: dynamic service charge
    const percent = getServiceChargePercent();
    const serviceCharge = revenue * (percent / 100);

    const barWaste = Number(localStorage.getItem("barWaste")) || 0;
    const kitchenCost = Number(localStorage.getItem("kitchenCost")) || 30;

    const fohResult = getFohStatus(revenue, ordersCount, avgValue);
    const fohLevel = fohResult.level;
    const fohStatus = fohResult.status;
    const fohScore = fohResult.score;

    let barLevel = 0;
    let barStatus = "CRITICAL";

    if (barWaste < 1000) {
      barLevel = 100;
      barStatus = "GOOD";
    } else if (barWaste < 2000) {
      barLevel = 70;
      barStatus = "WARNING";
    } else if (barWaste < 4000) {
      barLevel = 40;
      barStatus = "BAD";
    } else {
      barLevel = 20;
      barStatus = "CRITICAL";
    }

    let kitchenLevel = 0;
    let kitchenStatus = "CRITICAL";

    if (kitchenCost <= 30) {
      kitchenLevel = 100;
      kitchenStatus = "GOOD";
    } else if (kitchenCost <= 35) {
      kitchenLevel = 70;
      kitchenStatus = "WARNING";
    } else if (kitchenCost <= 40) {
      kitchenLevel = 40;
      kitchenStatus = "BAD";
    } else {
      kitchenLevel = 20;
      kitchenStatus = "CRITICAL";
    }

    const fohPool = serviceCharge * 0.5 * (fohLevel / 100);
    const barPool = serviceCharge * 0.3 * (barLevel / 100);
    const kitchenPool = serviceCharge * 0.2 * (kitchenLevel / 100);

    const staffMap = {};

    orders.forEach((order) => {
      if (!staffMap[order.staff]) {
        staffMap[order.staff] = 0;
      }
      staffMap[order.staff] += Number(order.total);
    });

    const totalFOHRevenue = Object.values(staffMap).reduce((a, b) => a + b, 0);

    const staffBreakdown = Object.entries(staffMap).map(([name, value]) => {
      const share = totalFOHRevenue > 0 ? value / totalFOHRevenue : 0;
      const payout = fohPool * share;

      return {
        name,
        revenue: value,
        payout,
      };
    });

    const today = new Date().toLocaleDateString("en-GB");
    const existingHistory = JSON.parse(localStorage.getItem("history")) || [];

    const newDay = {
      date: today,
      revenue,
      totalOrders: ordersCount,
      avgOrderValue: avgValue,
      serviceCharge,
      levels: {
        foh: fohStatus,
        bar: barStatus,
        kitchen: kitchenStatus,
      },
      scores: {
        foh: Math.round(fohScore),
      },
      payouts: {
        foh: fohPool,
        bar: barPool,
        kitchen: kitchenPool,
      },
      staff: staffBreakdown,
      orders,
    };

    const updatedHistory = [newDay, ...existingHistory];

    localStorage.setItem("history", JSON.stringify(updatedHistory));
    localStorage.removeItem("orders");

    alert(`Day saved with ${percent}% service charge`);
    window.location.reload();
  };

  return (
    <div className="min-h-screen text-white p-10">
      <h1 className="text-3xl">Control Final</h1>

      <button
        onClick={saveDay}
        className="bg-orange-500 px-4 py-2 mt-4"
      >
        Close Day & Save
      </button>

      <div className="mt-6 space-y-2">
        <div>Revenue: THB {totalRevenue.toLocaleString()}</div>
        <div>Total Orders: {totalOrders}</div>
        <div>
          Average Order Value: THB{" "}
          {Math.round(avgOrderValue).toLocaleString()}
        </div>
      </div>
    </div>
  );
}