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

    let result = Object.entries(staffMap).map(([name, data]) => {
      let level = 5;

      // 🔥 INDIVIDUAL UNLOCK
      if (data.revenue >= 100000) level = 7;
      else if (data.revenue >= 50000) level = 6;

      return {
        name,
        revenue: data.revenue,
        payout: data.payout,
        level,
      };
    });

    // SORT
    result.sort((a, b) => b.revenue - a.revenue);

    setLeaderboard(result);
  }, []);

  return (
    <div className="min-h-screen text-white p-10">

      <h1 className="text-3xl mb-6">Individual Performance Levels</h1>

      {leaderboard.map((s, i) => (
        <div key={i} className="mb-3">

          #{i + 1} {s.name}

          <br />

          Revenue: THB {s.revenue.toLocaleString()}

          <br />

          Level: 
          <span className="text-[#ffb36b] ml-2">
            {s.level}%
          </span>

        </div>
      ))}

    </div>
  );
}