"use client";

import { useEffect, useState } from "react";
import AppShell from '@/app/AppShell'

export default function PayoutPage() {
  const [staff, setStaff] = useState([]);
  const [pool, setPool] = useState(0);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    try {
      // 🔥 GET PERFORMANCE DATA
      const res = await fetch("/api/performance/list");
      const result = await res.json();

      if (!result.success) return;

      const data = result.data || [];

      // 🔥 GROUP BY STAFF
      const grouped = {};

      data.forEach((item) => {
        if (!grouped[item.staff]) {
          grouped[item.staff] = [];
        }
        grouped[item.staff].push(item.score);
      });

      const staffList = Object.entries(grouped).map(([name, scores]) => {
        const avgScore = Math.round(
          scores.reduce((sum, s) => sum + s, 0) / scores.length
        );

        return {
          id: name,
          name,
          score: avgScore,
        };
      });

      // 🔥 REAL REVENUE FROM CONTROL FINAL (history)
      const history = JSON.parse(localStorage.getItem("history") || "[]");

      let totalRevenue = 0;

      if (history.length > 0) {
        const lastDay = history[history.length - 1];
        totalRevenue = lastDay.revenue || 0;
      }

      // 🔥 SERVICE LEVEL
      let serviceLevel = 5;
      if (totalRevenue > 200000) serviceLevel = 6;
      if (totalRevenue > 400000) serviceLevel = 7;

      const servicePool = (totalRevenue * serviceLevel) / 100;

      setPool(servicePool);
      setStaff(staffList);

    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const totalScore = staff.reduce((sum, s) => sum + (s.score || 0), 0);

  return (
    <AppShell>
      <div className="space-y-10 text-white">

        <h1 className="text-3xl">Payout System</h1>

        {/* POOL */}
        <div className="bg-green-500/10 p-6 rounded-2xl">
          <div>Service Pool</div>
          <div className="text-2xl text-green-400">
            {loading ? "..." : `THB ${pool.toLocaleString()}`}
          </div>
        </div>

        {/* STAFF */}
        <div className="space-y-4">

          {loading && (
            <div className="text-white/50">Loading...</div>
          )}

          {!loading && staff.length === 0 && (
            <div className="text-white/40">No performance data yet</div>
          )}

          {!loading &&
            staff.map((s) => {
              const base =
                totalScore > 0
                  ? (pool * s.score) / totalScore
                  : 0;

              // 🔥 PERFORMANCE MULTIPLIER
              let multiplier = 1;
              if (s.score >= 90) multiplier = 1.2;
              else if (s.score >= 80) multiplier = 1.0;
              else if (s.score >= 70) multiplier = 0.8;
              else multiplier = 0.6;

              const final = Math.round(base * multiplier);

              return (
                <div
                  key={s.id}
                  className="bg-white/5 p-4 rounded-2xl flex justify-between items-center"
                >
                  <div>
                    <div>{s.name}</div>
                    <div className="text-xs text-white/40">
                      Score: {s.score}
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="text-green-400 font-semibold">
                      THB {final.toLocaleString()}
                    </div>
                    <div className="text-xs text-white/40">
                      {multiplier}x
                    </div>
                  </div>
                </div>
              );
            })}

        </div>

      </div>
    </AppShell>
  );
}