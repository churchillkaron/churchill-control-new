"use client";

import { useEffect, useState } from "react";
import AppShell from "../AppShell";

export default function StaffPage() {
  const [name, setName] = useState("");
  const [selected, setSelected] = useState(false);

  const [attendance, setAttendance] = useState([]);
  const [history, setHistory] = useState([]);

  useEffect(() => {
    const storedName = localStorage.getItem("staff_name");
    if (storedName) {
      setName(storedName);
      setSelected(true);
    }

    setAttendance(
      JSON.parse(localStorage.getItem("staff_attendance") || "[]")
    );

    setHistory(
      JSON.parse(localStorage.getItem("history") || "[]")
    );
  }, []);

  const selectUser = (n) => {
    localStorage.setItem("staff_name", n);
    setName(n);
    setSelected(true);
  };

  // 🔥 TODAY DATA
  const today = new Date().toLocaleDateString("en-GB");

  const todayAttendance = attendance.find(
    (a) => a.name === name && a.date === today
  );

  const todayPayout =
    history[history.length - 1]?.staff?.find(
      (s) => s.name === name
    )?.payout || 0;

  // 🔥 MONTH TOTAL
  const totalSalary = history.reduce((sum, d) => {
    const s = d.staff?.find((x) => x.name === name);
    return sum + (s?.payout || 0);
  }, 0);

  return (
    <AppShell>
      <div className="space-y-10">

        {!selected ? (
          <>
            <h1 className="text-2xl text-white">Select Your Name</h1>

            <div className="flex gap-4 flex-wrap">
              {["FOH 1", "FOH 2", "BAR", "KITCHEN"].map((n) => (
                <button
                  key={n}
                  onClick={() => selectUser(n)}
                  className="bg-[#ff7a00] px-4 py-2 rounded"
                >
                  {n}
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            {/* HEADER */}
            <div>
              <h1 className="text-3xl text-white">{name}</h1>
              <p className="text-white/50 text-sm">
                Personal Dashboard
              </p>
            </div>

            {/* TODAY STATUS */}
            <div className="bg-white/5 p-6 rounded-2xl">
              <h2 className="mb-3 text-white">Today</h2>

              <p>
                Status:{" "}
                {todayAttendance
                  ? todayAttendance.late
                    ? "Late"
                    : "On Time"
                  : "Not Checked In"}
              </p>

              <p>Penalty: THB {todayAttendance?.penalty || 0}</p>

              <p>Payout Today: THB {todayPayout}</p>
            </div>

            {/* SALARY */}
            <div className="bg-white/5 p-6 rounded-2xl">
              <h2 className="mb-3 text-white">Salary</h2>

              <p>Total Earned: THB {totalSalary}</p>
            </div>

            {/* ACTION */}
            <div>
              <button className="bg-green-500 px-6 py-2 rounded">
                Confirm Salary
              </button>
            </div>

            {/* RESET (DEV ONLY) */}
            <div>
              <button
                onClick={() => {
                  localStorage.removeItem("staff_name");
                  location.reload();
                }}
                className="text-xs text-white/40"
              >
                Switch User
              </button>
            </div>
          </>
        )}

      </div>
    </AppShell>
  );
}