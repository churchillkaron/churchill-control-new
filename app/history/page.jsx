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
                className={`cursor-pointer p-4 rounded-xl border ${
                  selected?.id === d.id
                    ? "border-[#ff7a00] bg-[#ff7a00]/10"
                    : "border-white/10 bg-white/5"
                } hover:opacity-80 transition`}
              >
                <div className="flex justify-between">
                  <div>
                    {new Date(d.day_date).toLocaleDateString()}
                  </div>
                  <div className="text-white/70">
                    {d.revenue} THB
                  </div>
                </div>
              </div>
            ))}
        </div>

        {/* DETAIL */}
        {selected && (
          <div className="space-y-6">

            {/* HERO */}
            <div className="bg-white/5 border border-white/10 rounded-2xl p-8">
              <div className="text-sm text-white/50">Revenue</div>
              <div className="text-3xl mt-2">
                {selected.revenue} THB
              </div>
            </div>

            {/* KPI */}
            <div className="grid md:grid-cols-3 gap-4">
              <div className="bg-white/5 border border-white/10 rounded-xl p-4">
                <div className="text-sm text-white/50">Service Pool</div>
                <div className="text-xl mt-1">
                  {selected.service_pool} THB
                </div>
              </div>

              <div className="bg-white/5 border border-white/10 rounded-xl p-4">
                <div className="text-sm text-white/50">Payout Pool</div>
                <div className="text-xl mt-1">
                  {selected.payout_pool} THB
                </div>
              </div>

              <div className="bg-white/5 border border-white/10 rounded-xl p-4">
                <div className="text-sm text-white/50">Status</div>
                <div className="text-xl mt-1">
                  {selected.payout_status}
                </div>
              </div>
            </div>

            {/* STAFF */}
            <div className="bg-white/5 border border-white/10 rounded-2xl p-6 space-y-4">
              <div className="text-lg">Staff Breakdown</div>

              {selected.staff_data?.map((s, i) => (
                <div
                  key={i}
                  className="flex justify-between border-b border-white/10 pb-2"
                >
                  <div>
                    <div>{s.name}</div>
                    <div className="text-white/40 text-xs">
                      {s.role}
                    </div>
                  </div>
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