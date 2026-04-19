"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import AppShell from "../../AppShell";
import { getHistoryDays } from "../../../lib/storage/localStorage";

export default function PayrollPage() {
  const [history, setHistory] = useState([]);

  useEffect(() => {
    const data = getHistoryDays() || [];
    setHistory(data);
  }, []);

  return (
    <AppShell>
      <div className="space-y-10 text-white">

        <h1 className="text-3xl">Payroll</h1>

        <div className="space-y-6">

          {history.map((day) => (
            <DayBlock key={day.id} day={day} />
          ))}

          {history.length === 0 && (
            <div className="text-white/40">No payroll data</div>
          )}

        </div>

      </div>
    </AppShell>
  );
}

function DayBlock({ day }) {
  return (
    <div className="bg-white/5 border border-white/10 rounded-2xl p-5">

      <div className="flex justify-between mb-4">
        <span>{day.date}</span>
        <span>THB {(day.payouts?.total || 0).toLocaleString()}</span>
      </div>

      <div className="space-y-2 text-sm">

        {day.payouts?.staffBreakdown?.map((s, i) => (
          <div key={i} className="flex justify-between">
            <span>{s.name}</span>
            <span>THB {(s.amount || 0).toLocaleString()}</span>
          </div>
        ))}

        {!day.payouts?.staffBreakdown?.length && (
          <div className="text-white/40">No staff payouts</div>
        )}

      </div>

    </div>
  );
}