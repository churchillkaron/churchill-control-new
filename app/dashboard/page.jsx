"use client";

import { useEffect, useState } from "react";

export default function Dashboard() {
  const [leaderboard, setLeaderboard] = useState([]);

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

    const result = Object.entries(staffMap).map(([name, data]) => {
      let status = "CRITICAL";

      if (data.revenue >= 50000) status = "GOOD";
      else if (data.revenue >= 30000) status = "WARNING";
      else if (data.revenue >= 15000) status = "BAD";

      return {
        name,
        revenue: data.revenue,
        payout: data.payout,
        status,
      };
    });

    // 🔥 SORT BY REVENUE (BEST FIRST)
    result.sort((a, b) => b.revenue - a.revenue);

    setLeaderboard(result);
  }, []);

  const getColor = (status) => {
    if (status === "GOOD") return "text-green-400";
    if (status === "WARNING") return "text-orange-400";
    if (status === "BAD") return "text-red-400";
    return "text-red-700";
  };

  return (
    <div className="relative min-h-screen text-white overflow-hidden">

      {/* BACKGROUND */}
      <div className="absolute inset-0 -z-30">
        <img src="/bg-hero-control.jpg" className="w-full h-full object-cover" />
      </div>

      <div className="absolute inset-0 -z-20 bg-[linear-gradient(to_bottom,rgba(8,8,8,0.75),rgba(18,12,8,0.85))]" />

      <div className="relative z-10 max-w-7xl mx-auto px-6 pt-28 space-y-8">

        <h1 className="text-3xl md:text-5xl font-semibold">
          Staff Performance
        </h1>

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
                Earned: THB {s.payout.toLocaleString()}
              </div>

              <div className={getColor(s.status)}>
                {s.status}
              </div>
            </div>
          ))}

        </div>

      </div>
    </div>
  );
}