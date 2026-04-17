"use client";

import { useEffect, useState } from "react";

export default function ControlFinal() {
  const [orders, setOrders] = useState([]);
  const [staff, setStaff] = useState([]);

  const [revenue, setRevenue] = useState(0);
  const [totalOrders, setTotalOrders] = useState(0);
  const [avgOrderValue, setAvgOrderValue] = useState(0);

  const [fohLevel, setFohLevel] = useState("GOOD");
  const [barLevel, setBarLevel] = useState("GOOD");
  const [kitchenLevel, setKitchenLevel] = useState("GOOD");

  const [payouts, setPayouts] = useState({
    foh: 0,
    bar: 0,
    kitchen: 0,
  });

  const [staffPayouts, setStaffPayouts] = useState([]);

  useEffect(() => {
    const storedOrders =
      JSON.parse(localStorage.getItem("orders")) || [];

    const storedStaff =
      JSON.parse(localStorage.getItem("staffList")) || [];

    setOrders(storedOrders);
    setStaff(storedStaff);

    const total = storedOrders.reduce(
      (sum, o) => sum + Number(o.total || 0),
      0
    );

    const count = storedOrders.length;

    setRevenue(total);
    setTotalOrders(count);
    setAvgOrderValue(count > 0 ? total / count : 0);
  }, []);

  const levelMultiplier = {
    GOOD: 1,
    WARNING: 0.7,
    BAD: 0.4,
    CRITICAL: 0.2,
  };

  const calculatePayouts = () => {
    const service = revenue * 0.05;

    const fohPool = service * 0.5 * levelMultiplier[fohLevel];
    const barPool = service * 0.3 * levelMultiplier[barLevel];
    const kitchenPool =
      service * 0.2 * levelMultiplier[kitchenLevel];

    setPayouts({
      foh: fohPool,
      bar: barPool,
      kitchen: kitchenPool,
    });

    const fohStaff = staff.filter((s) => s.role === "FOH");

    const perStaff =
      fohStaff.length > 0 ? fohPool / fohStaff.length : 0;

    // ✅ FULL FIX: include level
    const staffBreakdown = fohStaff.map((s) => ({
      ...s,
      payout: perStaff,
      level: levelMultiplier[fohLevel],
    }));

    setStaffPayouts(staffBreakdown);
  };

  const calculateFOHScore = () => {
    let score = 100;

    if (avgOrderValue < 300) score -= 30;
    if (totalOrders < 20) score -= 20;

    return score;
  };

  const closeDay = () => {
    const history =
      JSON.parse(localStorage.getItem("history")) || [];

    const serviceCharge = revenue * 0.05;

    const newDay = {
      date: new Date().toLocaleDateString("en-GB"),
      revenue,
      serviceCharge,

      totalOrders,
      avgOrderValue,

      levels: {
        foh: fohLevel,
        bar: barLevel,
        kitchen: kitchenLevel,
      },

      scores: {
        foh: calculateFOHScore(),
      },

      payouts,
      staff: staffPayouts,
    };

    const updated = [newDay, ...history];

    localStorage.setItem("history", JSON.stringify(updated));

    alert("Day closed and saved to history");
  };

  return (
    <div className="relative min-h-screen text-white overflow-hidden">
      <div className="absolute inset-0 -z-30">
        <img
          src="/bg-hero-control.jpg"
          className="w-full h-full object-cover"
        />
      </div>

      <div className="relative z-10 max-w-6xl mx-auto px-6 pt-24 pb-16 space-y-8">

        <h1 className="text-3xl md:text-5xl font-semibold">
          Control Final
        </h1>

        {/* SUMMARY */}
        <div className="rounded-3xl border border-white/10 bg-black/30 p-6 space-y-2">
          <div>Revenue: THB {revenue.toLocaleString()}</div>
          <div>Orders: {totalOrders}</div>
          <div>Avg Order: THB {Math.round(avgOrderValue)}</div>
          <div>
            Service Charge: THB {(revenue * 0.05).toLocaleString()}
          </div>
        </div>

        {/* LEVELS */}
        <div className="grid md:grid-cols-3 gap-4">
          {[
            ["FOH", fohLevel, setFohLevel],
            ["BAR", barLevel, setBarLevel],
            ["KITCHEN", kitchenLevel, setKitchenLevel],
          ].map(([name, value, setter]) => (
            <div
              key={name}
              className="p-4 bg-black/30 rounded-xl"
            >
              <div>{name}</div>
              <select
                value={value}
                onChange={(e) => setter(e.target.value)}
                className="bg-black/40 p-2 rounded"
              >
                <option>GOOD</option>
                <option>WARNING</option>
                <option>BAD</option>
                <option>CRITICAL</option>
              </select>
            </div>
          ))}
        </div>

        {/* ACTIONS */}
        <div className="flex gap-4">
          <button
            onClick={calculatePayouts}
            className="bg-blue-500 px-4 py-2 rounded-xl"
          >
            Calculate Payouts
          </button>

          <button
            onClick={closeDay}
            className="bg-orange-500 px-4 py-2 rounded-xl"
          >
            Close Day
          </button>
        </div>

        {/* STAFF PAYOUT */}
        <div className="p-6 bg-black/30 rounded-2xl">
          <h2 className="mb-3">FOH Staff</h2>

          {staffPayouts.map((s, i) => (
            <div
              key={i}
              className="flex justify-between"
            >
              <div>{s.name}</div>
              <div>THB {s.payout?.toFixed(2)}</div>
            </div>
          ))}
        </div>

      </div>
    </div>
  );
}