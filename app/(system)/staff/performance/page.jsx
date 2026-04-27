"use client";

import { useEffect, useState } from "react";
import AppShell from '@/app/AppShell'
import Link from "next/link";

export default function StaffPerformancePage() {
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

  // 🔥 CALCULATE AVERAGE
  const average =
    data.length > 0
      ? Math.round(
          data.reduce((sum, item) => sum + item.score, 0) / data.length
        )
      : 0;

  // 🔥 SERVICE CHARGE (NEW)
  let serviceCharge = 5;
  if (average >= 90) serviceCharge = 7;
  else if (average >= 80) serviceCharge = 6;

  return (
    <AppShell>
      <div className="space-y-8 text-white">

        <div className="flex items-center justify-between">
          <h1 className="text-3xl">Performance</h1>
          <Link
            href="/staff"
            className="text-sm text-white/60 hover:text-white transition"
          >
            Back to Staff Portal
          </Link>
        </div>

        {/* SUMMARY */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
          <div className="text-xl text-white">Personal Performance</div>
          <div className="text-white/50 text-sm mt-2">
            This page shows your performance score based on tasks and approvals.
          </div>

          <div className="mt-6 text-center">
            <div className="text-sm text-white/50">Average Score</div>
            <div className="text-4xl font-bold mt-2">
              {loading ? "..." : `${average}%`}
            </div>
          </div>

          {/* 🔥 SERVICE CHARGE DISPLAY (NEW) */}
          <div className="mt-4 text-center">
            <div className="text-sm text-white/50">Service Charge Level</div>
            <div className="text-2xl font-semibold text-[#ff7a00] mt-1">
              {loading ? "..." : `${serviceCharge}%`}
            </div>
          </div>
        </div>

        {/* HISTORY */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-6 space-y-4">
          <div className="text-lg">Recent Shifts</div>

          {loading ? (
            <div className="text-white/40">Loading...</div>
          ) : data.length === 0 ? (
            <div className="text-white/40">No performance data yet</div>
          ) : (
            data.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between border-b border-white/10 pb-3"
              >
                <div>
                  <div className="text-sm text-white/60">
                    {new Date(item.date).toLocaleString()}
                  </div>
                  <div className="text-xs text-white/40">
                    {item.department}
                  </div>
                </div>

                <div
                  className={`text-lg font-semibold ${
                    item.score >= 90
                      ? "text-green-400"
                      : item.score >= 70
                      ? "text-yellow-400"
                      : "text-red-400"
                  }`}
                >
                  {item.score}%
                </div>
              </div>
            ))
          )}
        </div>

      </div>
    </AppShell>
  );
}