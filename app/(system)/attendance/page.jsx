"use client";

import { useEffect, useState } from "react";
import AppShell from "../../AppShell.js";

export default function AttendancePage() {
  const [staff, setStaff] = useState([]);
  const [attendance, setAttendance] = useState({});

  useEffect(() => {
    loadStaff();
    loadAttendance();
  }, []);

  const loadStaff = () => {
    const stored = JSON.parse(localStorage.getItem("staff") || "[]");
    setStaff(stored);
  };

  const loadAttendance = () => {
    const stored = JSON.parse(localStorage.getItem("attendance") || "{}");
    setAttendance(stored);
  };

  const saveAttendance = (data) => {
    localStorage.setItem("attendance", JSON.stringify(data));
    setAttendance(data);
  };

  const checkIn = (id) => {
    const now = new Date();

    const updated = {
      ...attendance,
      [id]: {
        present: true,
        checkIn: now.toISOString(),
        hours: 0,
        lateMinutes: 0,
        penalty: 0,
      },
    };

    saveAttendance(updated);
  };

  const checkOut = (id) => {
    const now = new Date();
    const existing = attendance[id];

    if (!existing || !existing.checkIn) return;

    const checkInTime = new Date(existing.checkIn);
    const hours = (now - checkInTime) / (1000 * 60 * 60);

    const updated = {
      ...attendance,
      [id]: {
        ...existing,
        checkOut: now.toISOString(),
        hours: Number(hours.toFixed(2)),
      },
    };

    saveAttendance(updated);
  };

  return (
    <AppShell>
      <div className="text-white space-y-6">

        <h1 className="text-3xl">Attendance</h1>

        {staff.length === 0 && (
          <div className="text-white/40 text-sm">
            No staff found
          </div>
        )}

        <div className="space-y-4">
          {staff.map((s) => {
            const att = attendance[s.id] || {};

            return (
              <div
                key={s.id}
                className="bg-white/5 border border-white/10 rounded-xl p-4 flex justify-between items-center"
              >
                <div>
                  <div>{s.name}</div>
                  <div className="text-xs text-white/50">
                    {att.hours ? `${att.hours}h` : "Not checked out"}
                  </div>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => checkIn(s.id)}
                    className="bg-green-500 px-3 py-1 rounded text-black"
                  >
                    IN
                  </button>

                  <button
                    onClick={() => checkOut(s.id)}
                    className="bg-red-500 px-3 py-1 rounded text-black"
                  >
                    OUT
                  </button>
                </div>
              </div>
            );
          })}
        </div>

      </div>
    </AppShell>
  );
}