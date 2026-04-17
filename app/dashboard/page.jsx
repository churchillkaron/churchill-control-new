"use client";

import { useEffect, useState } from "react";

export default function Dashboard() {
  const [history, setHistory] = useState([]);

  useEffect(() => {
    const h = JSON.parse(localStorage.getItem("history")) || [];
    setHistory(h);
  }, []);

  if (history.length === 0) {
    return <div className="text-white p-10">No data</div>;
  }

  const latest = history[0];
  const last3 = history.slice(0, 3);

  // =========================
  // TRENDS
  // =========================
  const getTrend = (key) => {
    if (last3.length < 3) return 0;

    return last3[0][key] - last3[2][key];
  };

  const revenueTrend = getTrend("revenue");
  const avgTrend = getTrend("avgOrderValue");
  const fohTrend =
    (last3[0].scores?.foh || 0) -
    (last3[2].scores?.foh || 0);

  const getTrendSymbol = (value) => {
    if (value > 0) return "↑";
    if (value < 0) return "↓";
    return "→";
  };

  // =========================
  // AI MANAGER
  // =========================
  const insights = [];

  // Revenue trend
  if (revenueTrend < 0) {
    insights.push("⚠️ Revenue is declining over last days");
  }

  // Avg order value
  if (avgTrend < 0) {
    insights.push("⚠️ Average order value is dropping");
    insights.push("💡 Staff should upsell drinks and starters");
  }

  // FOH performance
  if (fohTrend < 0) {
    insights.push("⚠️ FOH performance is declining");
  }

  // Small order detection
  if (latest.avgOrderValue < 300) {
    insights.push("💡 Orders are too small → upselling is weak");
  }

  // Strong performance
  if (fohTrend > 0) {
    insights.push("🟢 FOH performance improving");
  }

  return (
    <div className="min-h-screen text-white p-10 space-y-8">

      <h1 className="text-3xl">Manager System</h1>

      {/* SYSTEM OVERVIEW */}
      <div className="bg-white/10 p-6 rounded-xl space-y-2">
        <h2 className="text-xl">System Overview</h2>

        <div>Revenue: THB {latest.revenue}</div>
        <div>Orders: {latest.totalOrders}</div>
        <div>Avg Order: THB {Math.round(latest.avgOrderValue)}</div>
        <div>FOH Score: {latest.scores?.foh || 0}</div>
        <div>Service Charge: THB {latest.serviceCharge}</div>
      </div>

      {/* TRENDS */}
      <div className="bg-white/10 p-6 rounded-xl space-y-2">
        <h2 className="text-xl">Trends (Last 3 Days)</h2>

        <div>
          Revenue: {getTrendSymbol(revenueTrend)}
        </div>

        <div>
          Avg Order: {getTrendSymbol(avgTrend)}
        </div>

        <div>
          FOH Score: {getTrendSymbol(fohTrend)}
        </div>
      </div>

      {/* AI MANAGER */}
      <div className="bg-white/10 p-6 rounded-xl space-y-2">
        <h2 className="text-xl">AI Manager</h2>

        {insights.length === 0 && (
          <div className="text-green-400">
            System stable — no major issues detected
          </div>
        )}

        {insights.map((i, index) => (
          <div key={index}>{i}</div>
        ))}
      </div>

    </div>
  );
}