"use client";

import { useEffect, useState } from "react";

export default function Dashboard() {
  const [leaderboard, setLeaderboard] = useState([]);
  const [serviceLevel, setServiceLevel] = useState(5);

  useEffect(() => {
    const history = JSON.parse(localStorage.getItem("history")) || [];

    const staffMap = {};

    history.forEach((day) => {
      if (!day.staff) return;

      day.staff.forEach((s) => {
        if (!staffMap[s.name]) {
          staffMap[s.name] = {
            revenue: 0,
            payout: 0,
          };
        }

        staffMap[s.name].revenue += Number(s.revenue);
        staffMap[s.name].payout += Number(s.payout);
      });
    });

    let result = Object.entries(staffMap).map(([name, data]) => ({
      name,
      revenue: data.revenue,
      payout: data.payout,
    }));

    // SORT
    result.sort((a, b) => b.revenue - a.revenue);

    // 🔥 BONUS SYSTEM
    result = result.map((s, i) => {
      let bonus = 0;

      if (i === 0) bonus = 0.1; // +10%
      else if (i === 1) bonus = 0.05; // +5%

      return {
        ...s,
        bonus,
        finalPayout: s.payout + s.payout * bonus,
      };
    });

    // 🔥 SERVICE LEVEL UNLOCK
    const totalRevenue = result.reduce((sum, s) => sum + s.revenue, 0);

    let level = 5;

    if (totalRevenue >= 100000) level = 7;
    else if (totalRevenue >= 50000) level = 6;

    setServiceLevel(level);
    setLeaderboard(result);
  }, []);

  return (
    <div className="relative min-h-screen text-white overflow-hidden">

      {/* BACKGROUND */}
      <div className="absolute inset-0 -z-30">
        <img src="/bg-hero-control.jpg" className="w-full h-full object-cover" />
      </div>

      <div className="absolute inset-0 -z-20 bg-[linear-gradient(to_bottom,rgba(8,8,8,0.75),rgba(18,12,8,0.85))]" />

      <div className="relative z-10 max-w-7xl mx-auto px-6 pt-28 space-y-8">

        <h1 className="text-3xl md:text-5xl font-semibold">
          Performance & Bonus System
        </h1>

        {/* 🔥 SERVICE LEVEL */}
        <div className="p-6 rounded-xl bg-black/30 border border-white/10">
          <p className="text-white/50">Unlocked Service Charge</p>
          <h2 className="text-3xl text-[#ffb36b] mt-2">
            {serviceLevel}%
          </h2>
        </div>

        {/* LEADERBOARD */}
        <div className="space-y-4">

          {leaderboard.map((s, i) => (
            <div
              key={i}
              className="p-4 rounded-xl bg-black/30 border border-white/10 flex justify-between items-center"
            >
              <div>
                #{i + 1} {s.name}
              </div>

              <div>
                THB {s.revenue.toLocaleString()}
              </div>

              <div>
                Base: THB {s.payout.toLocaleString()}
              </div>

              <div className="text-green-400">
                +{Math.round(s.bonus * 100)}%
              </div>

              <div className="text-[#ffb36b]">
                Final: THB {Math.round(s.finalPayout).toLocaleString()}
              </div>
            </div>
          ))}

        </div>

      </div>
    </div>
  );
}