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
    (a) => a.date === today && a.late && a.status !== "approved" && a.status !== "rejected"
  );

  const approvePenalty = (id) => {
    const updated = attendance.map((a) => {
      if (a.id === id) {
        return { ...a, status: "approved" };
      }
      return a;
    });

    localStorage.setItem(
      "staff_attendance",
      JSON.stringify(updated)
    );

    setAttendance(updated);
  };

  const rejectPenalty = (id) => {
    const updated = attendance.map((a) => {
      if (a.id === id) {
        return { ...a, status: "rejected" };
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

        {/* 🔥 LATE PENALTY APPROVAL SYSTEM */}
        <div className="bg-white/5 p-6 rounded-2xl">
          <h2 className="text-white mb-4">Late Penalty Approvals</h2>

          {todayLate.length === 0 && (
            <p className="text-white/40">No pending penalties</p>
          )}

          {todayLate.map((a) => (
            <div
              key={a.id}
              className="flex justify-between items-center border-b border-white/10 py-3"
            >
              <div className="text-white/80">
                {a.name} — {a.minutesLate || 0} min late — THB {a.penalty}
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => approvePenalty(a.id)}
                  className="bg-green-500 px-3 py-1 rounded text-sm"
                >
                  Approve
                </button>

                <button
                  onClick={() => rejectPenalty(a.id)}
                  className="bg-red-500 px-3 py-1 rounded text-sm"
                >
                  Reject
                </button>
              </div>
            </div>
          ))}
        </div>

      </div>
    </AppShell>
  );
}