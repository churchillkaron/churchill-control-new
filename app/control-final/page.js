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

  // 🔥 NEW: SAVE DAY WITH FULL LOCKED DATA
  const saveDay = () => {
    const orders = JSON.parse(localStorage.getItem("orders")) || [];

    if (orders.length === 0) {
      alert("No data to save");
      return;
    }

    const revenue = orders.reduce((sum, o) => sum + Number(o.total), 0);
    const serviceCharge = revenue * 0.05;

    // 🔥 DEFAULT VALUES (same as payout page)
    const barWaste = 0;
    const kitchenCost = 30;

    // FOH
    let fohLevel = 0;
    if (revenue >= 50000) fohLevel = 100;
    else if (revenue >= 30000) fohLevel = 70;
    else if (revenue >= 15000) fohLevel = 40;

    // BAR
    let barLevel = 0;
    if (barWaste < 1000) barLevel = 100;
    else if (barWaste < 2000) barLevel = 70;
    else if (barWaste < 4000) barLevel = 40;

    // KITCHEN
    let kitchenLevel = 0;
    if (kitchenCost <= 30) kitchenLevel = 100;
    else if (kitchenCost <= 35) kitchenLevel = 70;
    else if (kitchenCost <= 40) kitchenLevel = 40;

    // Pools
    const fohPool = serviceCharge * 0.5;
    const barPool = serviceCharge * 0.3;
    const kitchenPool = serviceCharge * 0.2;

    // Final payouts
    const fohPayout = fohPool * (fohLevel / 100);
    const barPayout = barPool * (barLevel / 100);
    const kitchenPayout = kitchenPool * (kitchenLevel / 100);

    const today = new Date().toLocaleDateString("en-GB");

    const existingHistory =
      JSON.parse(localStorage.getItem("history")) || [];

    const newDay = {
      date: today,
      revenue,
      serviceCharge,
      payouts: {
        foh: fohPayout,
        bar: barPayout,
        kitchen: kitchenPayout,
      },
      orders,
    };

    const updatedHistory = [newDay, ...existingHistory];

    localStorage.setItem("history", JSON.stringify(updatedHistory));

    // 🔥 RESET DAY
    localStorage.removeItem("orders");

    alert("Day closed and saved");

    window.location.reload();
  };

  return (
    <div className="relative min-h-screen text-white">

      <div className="max-w-7xl mx-auto px-6 pt-28 space-y-8">

        <div className="flex justify-between text-sm text-white/60">
          <div>{staffName}</div>
          <div>{staffRole}</div>
        </div>

        <h1 className="text-3xl md:text-5xl font-semibold">
          Control Final
        </h1>

        {/* SAVE DAY */}
        <button
          onClick={saveDay}
          className="bg-[#ff7a00] px-6 py-3 rounded-xl"
        >
          Close Day & Save
        </button>

        {/* REVENUE */}
        <div>
          <p>Total Revenue</p>
          <h2>THB {totalRevenue.toLocaleString()}</h2>
        </div>

      </div>
    </div>
  );
}