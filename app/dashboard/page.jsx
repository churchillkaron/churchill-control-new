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

    result.sort((a, b) => b.revenue - a.revenue);

    result = result.map((s, i) => {
      let bonus = 0;

      if (i === 0) bonus = 0.1;
      else if (i === 1) bonus = 0.05;

      return {
        ...s,
        bonus,
        finalPayout: s.payout + s.payout * bonus,
      };
    });

    const totalRevenue = result.reduce((sum, s) => sum + s.revenue, 0);

    let level = 5;

    if (totalRevenue >= 100000) level = 7;
    else if (totalRevenue >= 50000) level = 6;

    // 🔥 SAVE LEVEL (CRITICAL)
    localStorage.setItem("serviceLevel", level);

    setServiceLevel(level);
    setLeaderboard(result);
  }, []);

  return (
    <div className="min-h-screen text-white p-10">

      <h1 className="text-3xl mb-6">Performance & Bonus System</h1>

      <div className="mb-6">
        Service Level Unlocked: {serviceLevel}%
      </div>

      {leaderboard.map((s, i) => (
        <div key={i} className="mb-2">
          #{i + 1} {s.name} → THB {s.revenue.toLocaleString()} → Final: THB {Math.round(s.finalPayout).toLocaleString()}
        </div>
      ))}

    </div>
  );
}