"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import AppShell from "../../AppShell.js";

const REQUIRED_TASKS = {
  kitchen: ["food"],
  foh: ["routine", "marketing"],
  bar: ["marketing"],
};

export default function StaffPage() {
  const [shiftActive, setShiftActive] = useState(false);
  const [shiftStart, setShiftStart] = useState(null);
  const [department, setDepartment] = useState("FOH");

  const [tasks, setTasks] = useState({
    routine: false,
    food: false,
    marketing: false,
    invoice: false,
  });

  const [rejected, setRejected] = useState({
    routine: false,
    food: false,
    marketing: false,
    invoice: false,
  });

  useEffect(() => {
    const savedShift = JSON.parse(localStorage.getItem("shift") || "null");
    const savedTasks = JSON.parse(localStorage.getItem("tasks") || "null");
    const savedRejected = JSON.parse(localStorage.getItem("rejected") || "null");

    if (savedShift) {
      setShiftActive(savedShift.active);
      setShiftStart(savedShift.start);
      setDepartment(savedShift.department);
    }

    if (savedTasks) {
      setTasks(savedTasks);
    }

    if (savedRejected) {
      setRejected(savedRejected);
    }
  }, []);

  const startShift = () => {
    const now = new Date().toISOString();

    const shift = {
      active: true,
      start: now,
      department: department,
      name: "staff",
    };

    localStorage.setItem("shift", JSON.stringify(shift));
    setShiftActive(true);
    setShiftStart(now);
  };

  const endShift = async () => {
    try {
      const currentShift = JSON.parse(localStorage.getItem("shift") || "null");

      if (!currentShift?.name) {
        alert("No active shift");
        return;
      }

      const res = await fetch("/api/assets/list");
      const data = await res.json();

      const today = new Date().toDateString();

      const rejectedFromBackend = (data.assets || []).filter((item) => {
        const itemDate = new Date(item.created_at).toDateString();

        return (
          item.status === "rejected" &&
          item.uploaded_by === "staff" &&
          itemDate === today
        );
      });

      const required = REQUIRED_TASKS[department.toLowerCase()] || [];

      const missing = required.filter((task) => !tasks[task]);
      const rejectedLocal = required.filter((task) => rejected[task]);

      let calculatedScore = 100;

      calculatedScore -= missing.length * 20;

      const rejectedPenaltyCount = rejectedFromBackend.filter(
        (item) =>
          item.category === "food" || item.category === "routine"
      ).length;

      calculatedScore -= rejectedPenaltyCount * 15;

      if (calculatedScore < 0) calculatedScore = 0;

      if (
        missing.length > 0 ||
        rejectedLocal.length > 0 ||
        rejectedFromBackend.length > 0
      ) {
        alert(
          "You cannot finish shift.\n\n" +
            (missing.length > 0
              ? "Missing:\n" + missing.map((m) => `- ${m}`).join("\n") + "\n\n"
              : "") +
            (rejectedLocal.length > 0
              ? "Rejected (local):\n" +
                rejectedLocal.map((r) => `- ${r}`).join("\n") + "\n\n"
              : "") +
            (rejectedFromBackend.length > 0
              ? "Rejected (must fix):\n" +
                rejectedFromBackend.map((r) => `- ${r.category}`).join("\n")
              : "")
        );

        if (rejectedFromBackend.length > 0) {
          window.location.href = "/staff/feedback";
        }

        return;
      }

      localStorage.removeItem("shift");
      localStorage.removeItem("tasks");
      localStorage.removeItem("rejected");

      setShiftActive(false);
      setShiftStart(null);

      // 🔥 SAVE SCORE
      await fetch("/api/performance/save", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          staff: currentShift.name,
          department: department,
          score: calculatedScore,
        }),
      });

      // 🔥 SHOW SCORE
      alert(`✅ Shift completed\n\nPerformance Score: ${calculatedScore}%`);

    } catch (err) {
      console.error(err);
      alert("Something went wrong");
    }
  }; // 🔥 THIS WAS MISSING

  return (
    <AppShell>
      <div className="min-h-screen text-white p-6 max-w-6xl mx-auto space-y-10">

        {/* SHIFT */}
        <div className="rounded-2xl bg-white/5 border border-white/10 p-6 space-y-4">
          {!shiftActive ? (
            <>
              <div className="text-white/60">You are not clocked in</div>
              <button
                onClick={startShift}
                className="bg-[#ff7a00] px-6 py-3 rounded-xl text-black font-medium"
              >
                Start Shift
              </button>
            </>
          ) : (
            <>
              <div className="text-lg">Shift Active</div>
              <div className="text-sm text-white/60">
                Started: {new Date(shiftStart).toLocaleTimeString()}
              </div>
              <div className="text-sm text-white/60">
                Department: {department}
              </div>

              <button
                onClick={endShift}
                className="bg-red-500 px-6 py-3 rounded-xl font-medium"
              >
                End Shift
              </button>
            </>
          )}
        </div>

        {/* TASKS */}
        <div className="rounded-2xl bg-white/5 border border-white/10 p-6 space-y-4">
          <div className="text-lg font-medium">Today's Tasks</div>

          {Object.entries(tasks).map(([key, value]) => {
            const isRejected = rejected[key];

            return (
              <div
                key={key}
                className="flex items-center justify-between border-b border-white/10 pb-2"
              >
                <div className="capitalize">{key}</div>

                {isRejected ? (
                  <div className="text-red-400">⚠ Rejected</div>
                ) : value ? (
                  <div className="text-green-400">✔ Done</div>
                ) : (
                  <div className="text-white/40">Pending</div>
                )}
              </div>
            );
          })}
        </div>

        {/* ACTIONS */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Link href="/staff/upload" className="bg-[#ff7a00] text-black rounded-2xl p-6 text-center font-medium">
            Upload
          </Link>

          <Link href="/staff/feedback" className="bg-white/10 rounded-2xl p-6 text-center">
            Feedback
          </Link>

          <Link href="/attendance" className="bg-white/10 rounded-2xl p-6 text-center">
            Attendance
          </Link>
        </div>

        {/* SECONDARY */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Link href="/staff/performance" className="bg-white/5 border border-white/10 rounded-2xl p-6">
            Performance
          </Link>

          <Link href="/staff/earnings" className="bg-white/5 border border-white/10 rounded-2xl p-6">
            Earnings
          </Link>

          <Link href="/staff/reviews" className="bg-white/5 border border-white/10 rounded-2xl p-6">
            Reviews
          </Link>

          <Link href="/staff/messages" className="bg-white/5 border border-white/10 rounded-2xl p-6">
            Messages
          </Link>
        </div>

      </div>
    </AppShell>
  );
}