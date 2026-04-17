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
            days: 0,
          };
        }

        staffMap[s.name].revenue += Number(s.revenue);
        staffMap[s.name].payout += Number(s.payout);
        staffMap[s.name].days += 1;
      });
    });

    const result = Object.entries(staffMap).map(([name, data]) => {
      const score = data.revenue / Math.max(data.days, 1);

      return {
        name,
        revenue: data.revenue,
        payout: data.payout,
        score,
      };
    });

    // 🔥 SORT BY PERFORMANCE
    result.sort((a, b) => b.score - a.score);

    setLeaderboard(result);
  }, []);

  return (
    <div className="min-h-screen text-white p-10">

      <h1 className="text-3xl mb-6">Staff Leaderboard</h1>

      <div className="space-y-3">

        {leaderboard.map((s, i) => (
          <div
            key={i}
            className="p-4 bg-black/30 rounded flex justify-between"
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

            <div>
              Score: {Math.round(s.score)}
            </div>
          </div>
        ))}

      </div>

    </div>
  );
}