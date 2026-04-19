"use client";

import { useEffect, useState } from "react";
import AppShell from "../../AppShell";

export default function AttendancePage() {
  const [attendance, setAttendance] = useState([]);

  useEffect(() => {
    const data = JSON.parse(localStorage.getItem("staff_attendance") || "[]");
    setAttendance(data);
  }, []);

  const today = new Date().toLocaleDateString("en-GB");

  return (
    <AppShell>
      <div className="space-y-10 text-white">

        <h1 className="text-3xl">Attendance</h1>

        {/* TODAY */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-6">

          <h2 className="mb-4 text-lg">Today</h2>

          {attendance
            .filter((a) => a.date === today)
            .map((a) => (
              <Row key={a.id} a={a} />
            ))}

        </div>

        {/* ALL */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-6">

          <h2 className="mb-4 text-lg">All Records</h2>

          {attendance.map((a) => (
            <Row key={a.id} a={a} />
          ))}

        </div>

      </div>
    </AppShell>
  );
}

function Row({ a }) {
  return (
    <div className="flex justify-between py-2 border-b border-white/10 text-sm">

      <span>
        {a.name} — {a.date}
      </span>

      <span className={a.late ? "text-red-400" : "text-green-400"}>
        {a.late ? `Late (THB ${a.penalty})` : "On Time"}
      </span>

    </div>
  );
}