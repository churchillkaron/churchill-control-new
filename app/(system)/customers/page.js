"use client";

import { useEffect, useState } from "react";
import { getCustomers } from "@/lib/customers";
import { getVisits } from "@/lib/visits";

export default function Dashboard() {
  const [customers, setCustomers] = useState([]);
  const [visits, setVisits] = useState([]);

  useEffect(() => {
    setCustomers(getCustomers());
    setVisits(getVisits());
  }, []);

  // 🔥 BASIC STATS
  const totalRevenue = visits.reduce(
    (sum, v) => sum + (v.spend || 0),
    0
  );

  const topCustomers = [...customers]
    .sort((a, b) => b.totalSpend - a.totalSpend)
    .slice(0, 5);

  const riskyCustomers = customers
    .filter((c) => c.noShowCount > 0)
    .sort((a, b) => b.noShowCount - a.noShowCount)
    .slice(0, 5);

  // 🔥 EXPERIENCE ANALYSIS
  const stats = {
    dinner: 0,
    drinks: 0,
    games: 0,
    music: 0,
  };

  visits.forEach((v) => {
    if (v.hadDinner) stats.dinner++;
    if (v.hadDrinks) stats.drinks++;
    if (v.playedGames) stats.games++;
    if (v.liveMusic) stats.music++;
  });

  // 🔥 AI RECOMMENDATIONS ENGINE
  const recommendations = [];

  // Revenue logic
  if (stats.drinks > stats.dinner) {
    recommendations.push("🍸 Drinks are driving activity → push cocktail promotions.");
  }

  if (stats.games > 0 && stats.games < stats.drinks) {
    recommendations.push("🎯 Games are underused → promote pool / darts nights.");
  }

  if (riskyCustomers.length > 0) {
    recommendations.push("⚠️ High no-show rate → consider confirmation system.");
  }

  if (topCustomers.length > 0) {
    recommendations.push("⭐ Invite top customers for VIP night or special event.");
  }

  if (totalRevenue < 10000) {
    recommendations.push("📉 Revenue low → push marketing campaign for upcoming days.");
  }

  return (
    <main className="min-h-screen bg-[#0b0b0b] text-white p-6">

      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-semibold">AI Dashboard</h1>
        <p className="text-gray-400">
          Insights and decision support
        </p>
      </div>

      {/* Revenue */}
      <div className="mb-8 p-6 rounded-xl bg-white/5 border border-white/10">
        <p className="text-sm text-gray-400">Total Revenue</p>
        <p className="text-3xl font-semibold">฿{totalRevenue}</p>
      </div>

      {/* 🔥 AI RECOMMENDATIONS (NEW) */}
      <div className="mb-8">
        <h2 className="text-xl mb-4">AI Recommendations</h2>

        <div className="space-y-3">
          {recommendations.length === 0 ? (
            <p className="text-gray-500">
              No recommendations yet.
            </p>
          ) : (
            recommendations.map((rec, i) => (
              <div
                key={i}
                className="p-4 rounded-xl bg-white/5 border border-white/10"
              >
                {rec}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Top Customers */}
      <div className="mb-8">
        <h2 className="text-xl mb-4">Top Customers</h2>

        <div className="space-y-3">
          {topCustomers.map((c) => (
            <div
              key={c.id}
              className="p-4 rounded-xl bg-white/5 border border-white/10 flex justify-between"
            >
              <div>
                <p>{c.name}</p>
                <p className="text-sm text-gray-400">{c.phone}</p>
              </div>
              <p className="text-green-400">฿{c.totalSpend}</p>
            </div>
          ))}
        </div>
      </div>

      {/* No-show Risk */}
      <div className="mb-8">
        <h2 className="text-xl mb-4">No-show Risk</h2>

        <div className="space-y-3">
          {riskyCustomers.map((c) => (
            <div
              key={c.id}
              className="p-4 rounded-xl bg-white/5 border border-white/10 flex justify-between"
            >
              <p>{c.name}</p>
              <p className="text-red-400">
                {c.noShowCount} no-shows
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Experience Insights */}
      <div>
        <h2 className="text-xl mb-4">Experience Insights</h2>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">

          <div className="p-4 rounded-xl bg-white/5 border border-white/10">
            <p className="text-sm text-gray-400">Dinner</p>
            <p className="text-xl">{stats.dinner}</p>
          </div>

          <div className="p-4 rounded-xl bg-white/5 border border-white/10">
            <p className="text-sm text-gray-400">Drinks</p>
            <p className="text-xl">{stats.drinks}</p>
          </div>

          <div className="p-4 rounded-xl bg-white/5 border border-white/10">
            <p className="text-sm text-gray-400">Games</p>
            <p className="text-xl">{stats.games}</p>
          </div>

          <div className="p-4 rounded-xl bg-white/5 border border-white/10">
            <p className="text-sm text-gray-400">Live Music</p>
            <p className="text-xl">{stats.music}</p>
          </div>

        </div>
      </div>

    </main>
  );
}