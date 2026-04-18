"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import AppShell from "../AppShell";

export default function DashboardPage() {
  const [history, setHistory] = useState([]);
  const [attendance, setAttendance] = useState([]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const data = JSON.parse(localStorage.getItem("history") || "[]");
    const att = JSON.parse(localStorage.getItem("staff_attendance") || "[]");

    setHistory(data);
    setAttendance(att);
  }, []);

  const today = new Date().toLocaleDateString("en-GB");

  const todayLate = attendance.filter(
    (a) =>
      a.date === today &&
      a.late &&
      a.status !== "approved" &&
      a.status !== "rejected"
  );

  const latestDay =
    history.find((d) => d.date === today) ||
    history[history.length - 1] ||
    null;

  const approvePenalty = (id) => {
    const updated = attendance.map((a) => {
      if (a.id === id) {
        return { ...a, status: "approved" };
      }
      return a;
    });

    localStorage.setItem("staff_attendance", JSON.stringify(updated));
    setAttendance(updated);
  };

  const rejectPenalty = (id) => {
    const updated = attendance.map((a) => {
      if (a.id === id) {
        return { ...a, status: "rejected", penalty: 0 };
      }
      return a;
    });

    localStorage.setItem("staff_attendance", JSON.stringify(updated));
    setAttendance(updated);
  };

  const approveSalary = (staffName) => {
    if (!latestDay) return;

    const updatedHistory = history.map((day) => {
      if (day.date !== latestDay.date) return day;

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

  const approveAllSalaries = () => {
    if (!latestDay) return;

    const updatedHistory = history.map((day) => {
      if (day.date !== latestDay.date) return day;

      return {
        ...day,
        staff: day.staff.map((s) => ({
          ...s,
          approved: true,
        })),
      };
    });

    localStorage.setItem("history", JSON.stringify(updatedHistory));
    setHistory(updatedHistory);
  };

  return (
    <AppShell>
      <div className="space-y-10">

        <div>
          <h1 className="text-3xl text-white/90">
            Manager Dashboard
          </h1>
          <p className="text-white/50 text-sm">
            Control, approvals, payroll release
          </p>
        </div>

        {/* LATE PENALTY APPROVALS */}
        <div className="bg-white/5 p-6 rounded-2xl space-y-4">
          <h2 className="text-white text-lg">Late Penalty Approvals</h2>

          {todayLate.length === 0 && (
            <p className="text-white/40">No pending penalties</p>
          )}

          {todayLate.map((a) => (
            <div
              key={a.id}
              className="flex justify-between items-center border-b border-white/10 py-3"
            >
              <div className="text-white/80">
                <div>{a.name}</div>
                <div className="text-sm text-white/50">
                  {a.minutesLate || 0} min late — THB {a.penalty}
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => {
                    if (confirm(`Approve late penalty for ${a.name}?`)) {
                      approvePenalty(a.id);
                    }
                  }}
                  className="bg-green-500 px-3 py-1 rounded text-sm"
                >
                  Approve
                </button>

                <button
                  onClick={() => {
                    if (confirm(`Reject late penalty for ${a.name}?`)) {
                      rejectPenalty(a.id);
                    }
                  }}
                  className="bg-red-500 px-3 py-1 rounded text-sm"
                >
                  Reject
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* SALARY APPROVALS */}
        <div className="bg-white/5 p-6 rounded-2xl space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-white text-lg">Salary Approvals</h2>

            {latestDay?.staff?.length > 0 && (
              <button
                onClick={() => {
                  if (confirm("Approve all salaries for latest day?")) {
                    approveAllSalaries();
                  }
                }}
                className="bg-[#ff7a00] px-4 py-2 rounded text-sm"
              >
                Approve All
              </button>
            )}
          </div>

          {!latestDay && (
            <p className="text-white/40">No saved day found</p>
          )}

          {latestDay?.staff?.map((staff, i) => (
            <div
              key={i}
              className="flex justify-between items-center border-b border-white/10 py-3"
            >
              <div className="text-white/80">
                <div>{staff.name}</div>
                <div className="text-sm text-white/50">
                  THB {staff.payout || 0}
                </div>
              </div>

              <div className="flex items-center gap-3">
                <span
                  className={`text-sm ${
                    staff.approved
                      ? "text-green-400"
                      : "text-yellow-400"
                  }`}
                >
                  {staff.approved ? "Approved" : "Pending"}
                </span>

                {!staff.approved && (
                  <button
                    onClick={() => {
                      if (confirm(`Approve salary for ${staff.name}?`)) {
                        approveSalary(staff.name);
                      }
                    }}
                    className="bg-green-500 px-3 py-1 rounded text-sm"
                  >
                    Approve
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

      </div>
    </AppShell>
  );
}