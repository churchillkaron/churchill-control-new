"use client";

import { useEffect, useState } from "react";

import { getHistoryDays } from "@/lib/storage/localStorage.js";

export default function HistoryDaysPage() {
  const [days, setDays] = useState([]);

  useEffect(() => {
    const data = getHistoryDays() || [];
    setDays(data);
  }, []);

  return (
  
      <div className="space-y-10">

        {/* HEADER */}
        <div>
          <p className="text-xs uppercase tracking-[0.25em] text-white/40">
            History
          </p>
          <h1 className="text-3xl md:text-5xl font-semibold mt-2">
            Daily Records
          </h1>
        </div>

        {/* EMPTY */}
        {days.length === 0 && (
          <div className="text-white/40">
            No daily records yet
          </div>
        )}

        {/* LIST */}
        <div className="space-y-4">
          {days.map((day) => (
            <DayCard key={day.id} day={day} />
          ))}
        </div>

      </div>
   
  );
}

function DayCard({ day }) {
  return (
    <div className="bg-white/5 border border-white/10 rounded-2xl p-5">

      <div className="flex justify-between">
        <div>{day.date}</div>
        <div>THB {day.revenue}</div>
      </div>

      <div className="grid grid-cols-3 gap-4 mt-4 text-sm text-white/60">
        <Stat label="Orders" value={day.totalOrders} />
        <Stat label="Service" value={day.serviceCharge} />
        <Stat label="Avg" value={day.avgOrderValue} />
      </div>

    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div>
      <p className="text-xs text-white/40">{label}</p>
      <p>{value || 0}</p>
    </div>
  );
}