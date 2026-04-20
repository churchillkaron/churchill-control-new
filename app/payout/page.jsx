"use client";

import { useEffect, useState } from "react";
import AppShell from "../AppShell";

export default function PayoutPage() {
  const [staff, setStaff] = useState([]);
  const [pool, setPool] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const history = JSON.parse(localStorage.getItem("history") || "[]");

    if (!history || history.length === 0) {
      setLoading(false);
      return;
    }

    const lastDay = history[history.length - 1];

    // ✅ READ SERVICE POOL
    setPool(lastDay.servicePool || 0);

    // ❌ NO STAFF YET → EMPTY FOR NOW
    setStaff([]);

    setLoading(false);
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
              No payout data yet. Next step: build staff system.
            </div>
          )}

        </div>

      </div>
    </AppShell>
  );
}