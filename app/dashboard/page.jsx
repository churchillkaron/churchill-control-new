"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import AppShell from "../AppShell";

export default function DashboardPage() {
  const [history, setHistory] = useState([]);
  const [attendance, setAttendance] = useState([]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const data =
      JSON.parse(localStorage.getItem("history") || "[]");

    const att =
      JSON.parse(localStorage.getItem("staff_attendance") || "[]");

    setHistory(data);
    setAttendance(att);
  }, []);

  const today = new Date().toLocaleDateString("en-GB");

  const todayLate = attendance.filter(
    (a) => a.date === today && a.late
  );

  const approvePenalty = (name) => {
    const updated = attendance.map((a) => {
      if (a.name === name && a.date === today) {
        return { ...a, penalty: 0, late: false };
      }
      return a;
    });

    localStorage.setItem(
      "staff_attendance",
      JSON.stringify(updated)
    );

    setAttendance(updated);
  };

  return (
    <AppShell>
      <div className="space-y-10">

        <div>
          <h1 className="text-3xl text-white/90">
            Manager Dashboard
          </h1>
          <p className="text-white/50 text-sm">
            Control & approvals
          </p>
        </div>

        {/* 🔥 ATTENDANCE CONTROL */}
        <div className="bg-white/5 p-6 rounded-2xl">
          <h2 className="text-white mb-4">Late Staff (Today)</h2>

          {todayLate.length === 0 && (
            <p className="text-white/40">No late staff</p>
          )}

          {todayLate.map((a, i) => (
            <div
              key={i}
              className="flex justify-between items-center border-b border-white/10 py-2"
            >
              <div>
                {a.name} — Penalty THB {a.penalty}
              </div>

              <button
                onClick={() => approvePenalty(a.name)}
                className="bg-green-500 px-3 py-1 rounded text-sm"
              >
                Approve
              </button>
            </div>
          ))}
        </div>

      </div>
    </AppShell>
  );
}