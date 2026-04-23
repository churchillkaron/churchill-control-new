"use client";

import { useEffect, useState } from "react";
import AppShell from "../../../AppShell.js";

export default function ManagerDashboard() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    try {
      const res = await fetch("/api/performance/list");
      const result = await res.json();

      if (result.success) {
        setData(result.data || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // 🔥 OVERALL AVERAGE
  const average =
    data.length > 0
      ? Math.round(data.reduce((sum, d) => sum + d.score, 0) / data.length)
      : 0;

  // 🔥 GROUP BY DEPARTMENT
  const deptScores = {};

  data.forEach((item) => {
    if (!deptScores[item.department]) {
      deptScores[item.department] = [];
    }
    deptScores[item.department].push(item.score);
  });

  const deptAverage = Object.entries(deptScores).map(([dept, scores]) => {
    const avg = Math.round(
      scores.reduce((sum, s) => sum + s, 0) / scores.length
    );
    return { dept, avg };
  });

  return (
    <AppShell>
      <div className="space-y-8 text-white">

        <div>
          <h1 className="text-3xl">Manager Dashboard</h1>
          <p className="text-white/50 text-sm">
            Control and monitor staff performance
          </p>
        </div>

        {/* OVERALL */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-6 text-center">
          <div className="text-sm text-white/50">Overall Performance</div>
          <div className="text-4xl font-bold mt-2">
            {loading ? "..." : `${average}%`}
          </div>
        </div>

        {/* DEPARTMENTS */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-6 space-y-4">
          <div className="text-lg">Department Performance</div>

          {deptAverage.length === 0 ? (
            <div className="text-white/40">No data yet</div>
          ) : (
            deptAverage.map((item) => (
              <div
                key={item.dept}
                className="flex justify-between border-b border-white/10 pb-2"
              >
                <div className="capitalize">{item.dept}</div>

                <div
                  className={`font-semibold ${
                    item.avg >= 90
                      ? "text-green-400"
                      : item.avg >= 70
                      ? "text-yellow-400"
                      : "text-red-400"
                  }`}
                >
                  {item.avg}%
                </div>
              </div>
            ))
          )}
        </div>

        {/* INSIGHT */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
          <div className="text-lg">Insights</div>

          <div className="mt-3 text-sm text-white/60 space-y-1">
            {deptAverage.map((item) => {
              if (item.avg < 70) {
                return (
                  <div key={item.dept}>
                    ⚠ {item.dept} needs attention (low performance)
                  </div>
                );
              }
              return null;
            })}
          </div>
        </div>

      </div>
    </AppShell>
  );
}