"use client";

import { useEffect, useState } from "react";
import AppShell from "../AppShell";

export default function AttendancePage() {
  const [staff, setStaff] = useState([]);
  const [attendance, setAttendance] = useState({});

  useEffect(() => {
    const storedStaff = JSON.parse(localStorage.getItem("staff") || "[]");
    const storedAttendance = JSON.parse(localStorage.getItem("attendance") || "{}");

    setStaff(storedStaff);
    setAttendance(storedAttendance);
  }, []);

  const saveAttendance = (updated) => {
    localStorage.setItem("attendance", JSON.stringify(updated));
    setAttendance(updated);
  };

  // 🔥 TOGGLE PRESENT
  const togglePresent = (id) => {
    const updated = {
      ...attendance,
      [id]: {
        ...(attendance[id] || {}),
        present: !attendance[id]?.present,
      },
    };

    saveAttendance(updated);
  };

  // 🔥 SET HOURS
  const setHours = (id, value) => {
    const updated = {
      ...attendance,
      [id]: {
        ...(attendance[id] || {}),
        hours: Number(value),
      },
    };

    saveAttendance(updated);
  };

  return (
    <AppShell>
      <div className="text-white space-y-6">

        <h1 className="text-2xl">Attendance</h1>

        {staff.map((s) => {
          const data = attendance[s.id] || {};

          return (
            <div
              key={s.id}
              className="bg-white/5 p-4 rounded space-y-2"
            >
              <div className="flex justify-between items-center">
                <div>
                  <div>{s.name}</div>
                  <div className="text-white/50 text-sm">{s.role}</div>
                </div>

                <button
                  onClick={() => togglePresent(s.id)}
                  className={`px-3 py-1 rounded ${
                    data.present ? "bg-green-500" : "bg-white/10"
                  }`}
                >
                  {data.present ? "Present" : "Absent"}
                </button>
              </div>

              {data.present && (
                <div className="flex items-center gap-2">
                  <div className="text-sm text-white/50">Hours</div>
                  <input
                    type="number"
                    value={data.hours || ""}
                    onChange={(e) => setHours(s.id, e.target.value)}
                    className="w-20 text-black px-2 py-1"
                  />
                </div>
              )}

            </div>
          );
        })}

      </div>
    </AppShell>
  );
}