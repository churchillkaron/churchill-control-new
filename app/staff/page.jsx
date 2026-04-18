"use client";

import { useEffect, useState } from "react";
import AppShell from "../AppShell";

export default function StaffPage() {
  const [name, setName] = useState("");
  const [selected, setSelected] = useState(false);

  const [attendance, setAttendance] = useState([]);
  const [history, setHistory] = useState([]);
  const [messages, setMessages] = useState([]);
  const [confirmed, setConfirmed] = useState(false);

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

    setMessages(
      JSON.parse(localStorage.getItem("staff_messages") || "[]")
    );
  }, []);

  const selectUser = (n) => {
    localStorage.setItem("staff_name", n);
    setName(n);
    setSelected(true);
  };

  const today = new Date().toLocaleDateString("en-GB");

  const todayAttendance = attendance.find(
    (a) => a.name === name && a.date === today
  );

  const todayPayout =
    history[history.length - 1]?.staff?.find(
      (s) => s.name === name
    )?.payout || 0;

  const totalSalary = history.reduce((sum, d) => {
    const s = d.staff?.find((x) => x.name === name);
    return sum + (s?.payout || 0);
  }, 0);

  const myMessages = messages.filter((m) => m.name === name);

  const confirmSalary = () => {
    const record = {
      name,
      date: today,
      confirmed: true,
    };

    const existing =
      JSON.parse(localStorage.getItem("salary_confirmations") || "[]");

    const updated = [record, ...existing];

    localStorage.setItem(
      "salary_confirmations",
      JSON.stringify(updated)
    );

    setConfirmed(true);
  };

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

            {/* TODAY */}
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

              {!confirmed ? (
                <button
                  onClick={confirmSalary}
                  className="bg-green-500 px-4 py-2 rounded mt-3"
                >
                  Confirm Salary
                </button>
              ) : (
                <p className="text-green-400 mt-2">
                  Salary Confirmed
                </p>
              )}
            </div>

            {/* MESSAGES */}
            <div className="bg-white/5 p-6 rounded-2xl">
              <h2 className="mb-3 text-white">Messages</h2>

              {myMessages.length === 0 && (
                <p className="text-white/40">
                  No messages
                </p>
              )}

              {myMessages.map((m, i) => (
                <div
                  key={i}
                  className="border-b border-white/10 py-2 text-sm"
                >
                  {m.text}
                </div>
              ))}
            </div>

            {/* SWITCH USER */}
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