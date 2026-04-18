"use client";

import { useEffect, useState } from "react";
import AppShell from "../AppShell";

export default function StaffPage() {
  const [staff, setStaff] = useState([]);

  useEffect(() => {
    const stored =
      JSON.parse(localStorage.getItem("staff_attendance") || "[]");
    setStaff(stored);
  }, []);

  const checkIn = (name) => {
    const now = new Date();
    const hour = now.getHours();
    const minute = now.getMinutes();

    // 🔥 LATE RULE (after 17:00 = late)
    const isLate = hour > 17 || (hour === 17 && minute > 0);

    const newEntry = {
      name,
      time: now.toLocaleTimeString(),
      date: now.toLocaleDateString("en-GB"),
      late: isLate,
      penalty: isLate ? 200 : 0,
    };

    const updated = [newEntry, ...staff];

    localStorage.setItem(
      "staff_attendance",
      JSON.stringify(updated)
    );

    setStaff(updated);
  };

  return (
    <AppShell>
      <div className="space-y-10">

        <div>
          <h1 className="text-3xl text-white/90">Staff Attendance</h1>
          <p className="text-white/50 text-sm">
            Check-in and lateness control
          </p>
        </div>

        {/* CHECK-IN BUTTONS */}
        <div className="flex gap-4 flex-wrap">
          <button onClick={() => checkIn("FOH 1")} className="btn">
            FOH 1 Check In
          </button>
          <button onClick={() => checkIn("FOH 2")} className="btn">
            FOH 2 Check In
          </button>
          <button onClick={() => checkIn("BAR")} className="btn">
            BAR Check In
          </button>
          <button onClick={() => checkIn("KITCHEN")} className="btn">
            KITCHEN Check In
          </button>
        </div>

        {/* LIST */}
        <div className="space-y-4">
          {staff.map((s, i) => (
            <div
              key={i}
              className="bg-white/5 border border-white/10 rounded-xl p-4 flex justify-between"
            >
              <div>
                {s.name} — {s.time}
                <div className="text-xs text-white/50">{s.date}</div>
              </div>

              <div className="text-right">
                {s.late && (
                  <div className="text-red-400">
                    Late (-{s.penalty} THB)
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

      </div>
    </AppShell>
  );
}