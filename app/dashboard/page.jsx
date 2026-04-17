"use client";

import { useEffect, useState } from "react";
import AppShell from "../AppShell";

export default function DashboardPage() {
  const [history, setHistory] = useState([]);

  useEffect(() => {
    const h = JSON.parse(localStorage.getItem("history")) || [];
    setHistory(h);
  }, []);

  const latest = history[0];
  const last3 = history.slice(0, 3);

  return (
    <AppShell>
      <div className="space-y-6">
        <h1 className="text-5xl font-semibold text-white">
          Manager System
        </h1>

        {!latest ? (
          <div className="text-white/70">No data</div>
        ) : (
          <>
            {/* System Overview */}
            <div className="rounded-3xl border border-white/10 bg-white/10 p-6 backdrop-blur-xl">
              <p>Revenue: THB {latest.revenue}</p>
              <p>Orders: {latest.orders}</p>
              <p>Avg Order: THB {latest.avgOrder}</p>
              <p>FOH Score: {latest.fohScore}</p>
              <p>Service Charge: THB {latest.serviceCharge}</p>
            </div>

            {/* Trends */}
            <div className="rounded-3xl border border-white/10 bg-white/10 p-6 backdrop-blur-xl">
              <p>Last 3 Days</p>
              {last3.map((d, i) => (
                <p key={i}>Day {i + 1}: THB {d.revenue}</p>
              ))}
            </div>

            {/* AI Manager */}
            <div className="rounded-3xl border border-white/10 bg-white/10 p-6 backdrop-blur-xl">
              <p>⚠ Average order value insight</p>
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}