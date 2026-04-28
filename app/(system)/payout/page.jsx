"use client";

import { useEffect, useState } from "react";


export default function PayoutPage() {
  const [staff, setStaff] = useState([]);
  const [pool, setPool] = useState(0);
  const [locked, setLocked] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    try {
      const history = JSON.parse(localStorage.getItem("history") || "[]");

      if (!history || history.length === 0) {
        setLoading(false);
        return;
      }

      const lastDay = history[history.length - 1];

      // 🔒 LOCK STATUS
      setLocked(lastDay.locked === true);

      // 🔥 USE SAVED VALUES (NOT RECALCULATED)
      setPool(lastDay.servicePool || 0);
      setStaff(lastDay.staff || []);

    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  return (
  
      <div className="space-y-10 text-white">

        <h1 className="text-3xl">Payout System</h1>

        {/* 🔒 LOCK WARNING */}
        {locked && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-4 text-sm text-red-300">
            🔒 This day is locked. Payout is final and cannot be changed.
          </div>
        )}

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
            <div className="text-white/40">No payout data yet</div>
          )}

          {!loading &&
            staff.map((s) => (
              <div
                key={s.id}
                className="bg-white/5 p-4 rounded-2xl flex justify-between items-center"
              >
                <div>
                  <div>{s.name}</div>
                  <div className="text-xs text-white/40">
                    {s.role} | Score: {s.score}
                  </div>
                </div>

                <div className="text-green-400 font-semibold">
                  THB {s.payrollAmount?.toLocaleString() || 0}
                </div>
              </div>
            ))}

        </div>

      </div>

  );
}