"use client";

import { useEffect, useState } from "react";
import AppShell from "../../AppShell";
import { getHistoryDays } from "../../../lib/storage/localStorage";

export default function RevenuePage() {
  const [history, setHistory] = useState([]);

  useEffect(() => {
    const data = getHistoryDays() || [];
    setHistory(data);
  }, []);

  return (
    <AppShell>
      <div className="space-y-10 text-white">

        <h1 className="text-3xl">Revenue</h1>

        <div className="space-y-4">

          {history.map((day) => (
            <Row key={day.id} day={day} />
          ))}

          {history.length === 0 && (
            <div className="text-white/40">No data</div>
          )}

        </div>

      </div>
    </AppShell>
  );
}

function Row({ day }) {
  return (
    <div className="bg-white/5 border border-white/10 rounded-2xl p-4 flex justify-between">

      <div>{day.date}</div>

      <div className="text-green-400">
        THB {(day.revenue || 0).toLocaleString()}
      </div>

    </div>
  );
}