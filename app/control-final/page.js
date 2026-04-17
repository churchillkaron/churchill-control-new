"use client";

import { useEffect, useState } from "react";

export default function ControlFinal() {
  const [staffName, setStaffName] = useState("");
  const [staffRole, setStaffRole] = useState("");
  const [totalRevenue, setTotalRevenue] = useState(0);

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
    setTotalRevenue(revenue);
  };

  const saveDay = () => {
    const orders = JSON.parse(localStorage.getItem("orders")) || [];

    if (orders.length === 0) {
      alert("No data to save");
      return;
    }

    const revenue = orders.reduce((sum, o) => sum + Number(o.total), 0);
    const serviceCharge = revenue * 0.05;

    const barWaste = Number(localStorage.getItem("barWaste")) || 0;
    const kitchenCost = Number(localStorage.getItem("kitchenCost")) || 30;

    // =========================
    // LEVEL SYSTEM (WITH TEXT)
    // =========================

    // FOH
    let fohLevel = 0;
    let fohStatus = "CRITICAL";

    if (revenue >= 50000) {
      fohLevel = 100;
      fohStatus = "GOOD";
    } else if (revenue >= 30000) {
      fohLevel = 70;
      fohStatus = "WARNING";
    } else if (revenue >= 15000) {
      fohLevel = 40;
      fohStatus = "BAD";
    }

    // BAR
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
    }

    // KITCHEN
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
    }

    // =========================
    // POOLS
    // =========================

    const fohPool = serviceCharge * 0.5 * (fohLevel / 100);
    const barPool = serviceCharge * 0.3 * (barLevel / 100);
    const kitchenPool = serviceCharge * 0.2 * (kitchenLevel / 100);

    // =========================
    // STAFF SPLIT
    // =========================

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

    // =========================
    // SAVE HISTORY (UPDATED)
    // =========================

    const today = new Date().toLocaleDateString("en-GB");

    const existingHistory =
      JSON.parse(localStorage.getItem("history")) || [];

    const newDay = {
      date: today,
      revenue,
      serviceCharge,

      // 🔥 SAVE LEVELS HERE (NEW)
      levels: {
        foh: fohStatus,
        bar: barStatus,
        kitchen: kitchenStatus,
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

    alert("Day saved with full system data");

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

      <div className="mt-6">
        Revenue: THB {totalRevenue.toLocaleString()}
      </div>

    </div>
  );
}