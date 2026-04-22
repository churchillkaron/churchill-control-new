"use client";

import { useEffect, useState } from "react";
import AppShell from "../../AppShell.js";

export default function ApprovalsPage() {
  const [attendance, setAttendance] = useState([]);
  const [history, setHistory] = useState([]);

  useEffect(() => {
    const att = JSON.parse(localStorage.getItem("staff_attendance") || "[]");
    const hist = JSON.parse(localStorage.getItem("history") || "[]");

    setAttendance(att);
    setHistory(hist);
  }, []);

  const today = new Date().toLocaleDateString("en-GB");

  const latestDay =
    history.find((d) => d.date === today) ||
    history[history.length - 1] ||
    null;

  // 🔥 PENALTY
  const approvePenalty = (id) => {
    const updated = attendance.map((a) =>
      a.id === id ? { ...a, status: "approved" } : a
    );

    localStorage.setItem("staff_attendance", JSON.stringify(updated));
    setAttendance(updated);
  };

  const rejectPenalty = (id) => {
    const updated = attendance.map((a) =>
      a.id === id ? { ...a, status: "rejected", penalty: 0 } : a
    );

    localStorage.setItem("staff_attendance", JSON.stringify(updated));
    setAttendance(updated);
  };

  // 🔥 SALARY
  const approveSalary = (staffName) => {
    const updatedHistory = history.map((day) => {
      if (!latestDay || day.date !== latestDay.date) return day;

      return {
        ...day,
        staff: day.staff.map((s) =>
          s.name === staffName ? { ...s, approved: true } : s
        ),
      };
    });

    localStorage.setItem("history", JSON.stringify(updatedHistory));
    setHistory(updatedHistory);
  };

  return (
    <AppShell>
      <div className="space-y-10 text-white">

        <h1 className="text-3xl">Approvals</h1>

        {/* PENALTIES */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-6">

          <h2 className="mb-4">Late Penalties</h2>

          {attendance
            .filter((a) => a.late && a.status === "pending")
            .map((a) => (
              <div key={a.id} className="flex justify-between py-2">
                <span>{a.name} — THB {a.penalty}</span>

                <div className="flex gap-2">
                  <button onClick={() => approvePenalty(a.id)} className="bg-green-500 px-2 rounded">✔</button>
                  <button onClick={() => rejectPenalty(a.id)} className="bg-red-500 px-2 rounded">✖</button>
                </div>
              </div>
            ))}

        </div>

        {/* SALARY */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-6">

          <h2 className="mb-4">Salary Approval</h2>

          {latestDay?.staff?.map((s, i) => (
            <div key={i} className="flex justify-between py-2">
              <span>{s.name} — THB {s.payout}</span>

              {!s.approved && (
                <button
                  onClick={() => approveSalary(s.name)}
                  className="bg-green-500 px-3 py-1 rounded"
                >
                  Approve
                </button>
              )}

              {s.approved && (
                <span className="text-green-400 text-sm">Approved</span>
              )}
            </div>
          ))}

        </div>

      </div>
    </AppShell>
  );
}
