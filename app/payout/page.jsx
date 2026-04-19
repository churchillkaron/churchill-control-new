"use client";

import { useEffect, useState } from "react";
import AppShell from "../AppShell";

export default function PayoutPage() {
  const [staff, setStaff] = useState([]);
  const [pool, setPool] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/history")
      .then((res) => res.json())
      .then((history) => {
        if (!history || history.length === 0) {
          setLoading(false);
          return;
        }

        const lastDay = history[history.length - 1];

        // ✅ Get pool from Control Final (already calculated)
        const serviceCharge = lastDay.servicePool || 0;
        setPool(serviceCharge);

        // ✅ Get staff payout from saved day
        const staffData = lastDay.staff || [];

        const formatted = staffData.map((s) => ({
          name: s.name,
          role: s.role,
          payout: s.payrollAmount || 0,
          score: s.score || 0,
        }));

        setStaff(formatted);
        setLoading(false);
      })
      .catch(() => {
        setLoading(false);
      });
  }, []);

  return (
    <AppShell>
      <div className="space-y-10 text-white">

        <h1 className="text-3xl">Payout</h1>

        {/* POOL */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
          <div className="text-sm text-white/50">Service Charge Pool</div>
          <div className="text-3xl mt-2 text-orange-400">
            {loading ? "..." : `${pool} THB`}
          </div>
        </div>

        {/* STAFF */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-6 space-y-4">

          <div className="text-lg">Staff Payout</div>

          {loading && (
            <div className="text-white/50">Loading...</div>
          )}

          {!loading && staff.length === 0 && (
            <div className="text-white/50">
              No payout data found. Lock a day in Control Final first.
            </div>
          )}

          {!loading &&
            staff.map((s, i) => (
              <div
                key={i}
                className="bg-white/5 border border-white/10 rounded-xl p-4 flex justify-between items-center"
              >
                <div>
                  <div className="font-medium">{s.name}</div>
                  <div className="text-white/50 text-sm">
                    {s.role}
                  </div>
                </div>

                <div className="text-right">
                  <div className="text-orange-400 font-semibold text-lg">
                    {s.payout} THB
                  </div>
                  <div className="text-white/40 text-xs">
                    Score: {s.score}
                  </div>
                </div>
              </div>
            ))}

        </div>

      </div>
    </AppShell>
  );
}