"use client";

import { useEffect, useState } from "react";
import AppShell from "../AppShell";

export default function HistoryPage() {
  const [days, setDays] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/history")
      .then((res) => res.json())
      .then((data) => {
        setDays(data || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  return (
    <AppShell>
      <div className="space-y-10 text-white">

        <h1 className="text-3xl">History</h1>

        {/* LIST */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-6 space-y-4">
          <div className="text-lg">Saved Days</div>

          {loading && <div className="text-white/50">Loading...</div>}

          {!loading && days.length === 0 && (
            <div className="text-white/50">No data yet</div>
          )}

          {!loading &&
            days.map((d, i) => (
              <div
                key={i}
                onClick={() => setSelected(d)}
                className="cursor-pointer flex justify-between border-b border-white/10 pb-2 hover:opacity-80"
              >
                <div>{new Date(d.day_date).toLocaleDateString()}</div>
                <div>{d.revenue} THB</div>
              </div>
            ))}
        </div>

        {/* DETAIL */}
        {selected && (
          <div className="bg-white/5 border border-white/10 rounded-2xl p-6 space-y-4">

            <div className="text-lg">Day Detail</div>

            <div>Revenue: {selected.revenue} THB</div>
            <div>Service Pool: {selected.service_pool} THB</div>
            <div>Payout Pool: {selected.payout_pool} THB</div>
            <div>Status: {selected.payout_status}</div>

            <div className="mt-4">
              <div className="text-white/50 text-sm">Staff</div>

              {selected.staff_data?.map((s, i) => (
                <div key={i} className="flex justify-between border-b border-white/10 py-1">
                  <div>{s.name}</div>
                  <div>{s.payrollAmount} THB</div>
                </div>
              ))}
            </div>

          </div>
        )}

      </div>
    </AppShell>
  );
}