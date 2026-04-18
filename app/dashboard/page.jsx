"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import AppShell from "../AppShell";

export default function DashboardPage() {
  const [history, setHistory] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [messages, setMessages] = useState([]);

  const [newMessage, setNewMessage] = useState("");
  const [target, setTarget] = useState("ALL");

  useEffect(() => {
    const data = JSON.parse(localStorage.getItem("history") || "[]");
    const att = JSON.parse(localStorage.getItem("staff_attendance") || "[]");
    const msg = JSON.parse(localStorage.getItem("staff_messages") || "[]");

    setHistory(data);
    setAttendance(att);
    setMessages(msg);
  }, []);

  const today = new Date().toLocaleDateString("en-GB");

  const latestDay =
    history.find((d) => d.date === today) ||
    history[history.length - 1] ||
    null;

  // 🔥 SEND MESSAGE
  const sendMessage = () => {
    if (!newMessage) return;

    const msg = {
      id: Date.now(),
      text: newMessage,
      target,
      date: today,
    };

    const updated = [msg, ...messages];

    localStorage.setItem("staff_messages", JSON.stringify(updated));
    setMessages(updated);

    setNewMessage("");
  };

  // 🔥 PENALTY APPROVAL
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

  // 🔥 SALARY APPROVAL
  const approveSalary = (staffName) => {
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

  return (
    <AppShell>
      <div className="space-y-10">

        <h1 className="text-3xl text-white">Manager Dashboard</h1>

        {/* 🔥 MESSAGING */}
        <div className="bg-white/5 p-6 rounded-2xl space-y-4">
          <h2 className="text-white text-lg">Send Message</h2>

          <select
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            className="bg-black/40 px-3 py-2 rounded text-white"
          >
            <option value="ALL">All Staff</option>
            <option value="FOH 1">FOH 1</option>
            <option value="FOH 2">FOH 2</option>
            <option value="BAR">BAR</option>
            <option value="KITCHEN">KITCHEN</option>
          </select>

          <input
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder="Type message..."
            className="w-full px-4 py-2 rounded bg-black/40 text-white"
          />

          <button
            onClick={sendMessage}
            className="bg-[#ff7a00] px-4 py-2 rounded"
          >
            Send
          </button>
        </div>

        {/* 🔥 LATEST MESSAGES */}
        <div className="bg-white/5 p-6 rounded-2xl space-y-3">
          <h2 className="text-white text-lg">Recent Messages</h2>

          {messages.slice(0, 5).map((m) => (
            <div key={m.id} className="text-white/80 text-sm">
              [{m.target}] {m.text}
            </div>
          ))}
        </div>

        {/* 🔥 PENALTIES */}
        <div className="bg-white/5 p-6 rounded-2xl">
          <h2 className="text-white mb-4">Late Approvals</h2>

          {attendance
            .filter((a) => a.date === today && a.late && a.status === "pending")
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

        {/* 🔥 SALARY */}
        <div className="bg-white/5 p-6 rounded-2xl">
          <h2 className="text-white mb-4">Salary Approval</h2>

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