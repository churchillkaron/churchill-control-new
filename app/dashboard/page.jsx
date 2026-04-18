"use client";

import { useEffect, useState } from "react";
import AppShell from "../AppShell";

export default function DashboardPage() {
  const [history, setHistory] = useState([]);
  const [staffTotals, setStaffTotals] = useState({});

  useEffect(() => {
    const data =
      JSON.parse(localStorage.getItem("history") || "[]");

    setHistory(data);

    // 🔥 CALCULATE STAFF TOTALS (MONTH)
    const totals = {};

    data.forEach((day) => {
      day.staff?.forEach((s) => {
        if (!totals[s.name]) totals[s.name] = 0;
        totals[s.name] += s.payout;
      });
    });

    setStaffTotals(totals);
  }, []);

  // 🔥 TOTALS
  const totalRevenue = history.reduce(
    (sum, d) => sum + (d.revenue || 0),
    0
  );

  const totalService = history.reduce(
    (sum, d) => sum + (d.serviceCharge || 0),
    0
  );

  const totalDays = history.length;

  return (
    <AppShell>
      <div className="space-y-10">

        {/* HEADER */}
        <div>
          <h1 className="text-3xl text-white/90">
            Manager Dashboard
          </h1>
          <p className="text-white/50 text-sm">
            Monthly control and payroll overview
          </p>
        </div>

        {/* TOTAL KPI */}
        <div className="grid md:grid-cols-3 gap-6">

          <Card label="Revenue" value={`THB ${totalRevenue}`} />
          <Card label="Service Pool" value={`THB ${totalService}`} />
          <Card label="Days Closed" value={totalDays} />

        </div>

        {/* STAFF PAYROLL */}
        <div className="bg-white/5 p-6 rounded-2xl">

          <h2 className="mb-4 text-white">Staff Monthly Payout</h2>

          {Object.keys(staffTotals).length === 0 && (
            <p className="text-white/40">No data</p>
          )}

          {Object.entries(staffTotals).map(([name, total]) => (
            <div
              key={name}
              className="flex justify-between border-b border-white/10 py-2"
            >
              <span>{name}</span>
              <span>THB {Math.round(total)}</span>
            </div>
          ))}

        </div>

      </div>
    </AppShell>
  );
}

function Card({ label, value }) {
  return (
    <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
      <div className="text-white/50 text-sm">{label}</div>
      <div className="text-2xl mt-2">{value}</div>
    </div>
  );
}