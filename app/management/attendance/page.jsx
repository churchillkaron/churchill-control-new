"use client";

import { useEffect, useState } from "react";
import AppShell from "../../AppShell";

export default function AttendancePage() {
  const [staff, setStaff] = useState([]);
  const [name, setName] = useState("");

  const SHIFT_START = 9; // 🔥 change to your real start time (9 = 09:00)

  useEffect(() => {
    const data = JSON.parse(localStorage.getItem("attendance") || "[]");
    setStaff(data);
  }, []);

  const save = (data) => {
    setStaff(data);
    localStorage.setItem("attendance", JSON.stringify(data));
  };

  const addStaff = () => {
    if (!name) return;

    const newStaff = {
      id: Date.now(),
      name,
      logs: [],
    };

    save([...staff, newStaff]);
    setName("");
  };

  const checkIn = (id) => {
    const updated = staff.map((s) => {
      if (s.id !== id) return s;

      return {
        ...s,
        logs: [...s.logs, { in: Date.now(), out: null }],
      };
    });

    save(updated);
  };

  const checkOut = (id) => {
    const updated = staff.map((s) => {
      if (s.id !== id) return s;

      const logs = [...s.logs];
      const last = logs[logs.length - 1];

      if (last && !last.out) {
        last.out = Date.now();
      }

      return { ...s, logs };
    });

    save(updated);
  };

  // 🔥 CALCULATE STATS + PENALTIES
  const getStats = (logs) => {
    let totalHours = 0;
    let lateCount = 0;

    logs.forEach((l) => {
      if (l.in && l.out) {
        const inDate = new Date(l.in);
        const start = new Date(l.in);
        start.setHours(SHIFT_START, 0, 0, 0);

        if (inDate > start) {
          lateCount++;
        }

        totalHours += (l.out - l.in) / (1000 * 60 * 60);
      }
    });

    const attendance = totalHours > 0 ? 1 : 0.5;

    const overtime = totalHours > 8 ? totalHours / 8 : 1;

    // 🔥 PENALTY SYSTEM
    let penalty = 1;
    let level = "GOOD";

    if (lateCount >= 5) {
      penalty = 0.5;
      level = "CRITICAL";
    } else if (lateCount >= 3) {
      penalty = 0.7;
      level = "BAD";
    } else if (lateCount >= 1) {
      penalty = 0.9;
      level = "WARNING";
    }

    return {
      hours: totalHours.toFixed(1),
      attendance: Number(attendance.toFixed(2)),
      overtime: Number(overtime.toFixed(2)),
      lateCount,
      penalty,
      level,
    };
  };

  // 🔥 PUSH INTO PAYOUT SYSTEM
  useEffect(() => {
    const modifiers = {};

    staff.forEach((s) => {
      const stats = getStats(s.logs);

      modifiers[s.name] = {
        attendance: stats.attendance * stats.penalty,
        overtime: stats.overtime,
      };
    });

    localStorage.setItem("staff_modifiers", JSON.stringify(modifiers));
  }, [staff]);

  return (
    <AppShell>
      <div className="space-y-10 text-white">

        <h1 className="text-3xl">Attendance & Control</h1>

        {/* ADD STAFF */}
        <div className="bg-white/5 p-6 rounded-2xl space-y-3">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Staff Name"
            className="w-full px-4 py-2 bg-black/40 rounded"
          />

          <button
            onClick={addStaff}
            className="bg-[#ff7a00] px-4 py-2 rounded"
          >
            Add Staff
          </button>
        </div>

        {/* STAFF LIST */}
        <div className="space-y-4">

          {staff.map((s) => {
            const stats = getStats(s.logs);

            return (
              <div
                key={s.id}
                className="bg-white/5 p-4 rounded-2xl space-y-2"
              >
                <div className="flex justify-between">
                  <div>{s.name}</div>
                  <div>{stats.hours}h</div>
                </div>

                <div className="text-sm text-white/60">
                  Late: {stats.lateCount} | Attendance: {stats.attendance} | OT: {stats.overtime}
                </div>

                <div className={`text-sm ${
                  stats.level === "CRITICAL"
                    ? "text-red-500"
                    : stats.level === "BAD"
                    ? "text-orange-500"
                    : stats.level === "WARNING"
                    ? "text-yellow-400"
                    : "text-green-400"
                }`}>
                  {stats.level}
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => checkIn(s.id)}
                    className="bg-green-500 px-3 py-1 rounded"
                  >
                    Check In
                  </button>

                  <button
                    onClick={() => checkOut(s.id)}
                    className="bg-red-500 px-3 py-1 rounded"
                  >
                    Check Out
                  </button>
                </div>
              </div>
            );
          })}

          {staff.length === 0 && (
            <div className="text-white/40">No staff yet</div>
          )}

        </div>

      </div>
    </AppShell>
  );
}