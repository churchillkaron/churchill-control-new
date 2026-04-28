"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { supabase } from "@/lib/supabase";

const REQUIRED_TASKS = {
  kitchen: ["food"],
  foh: ["routine", "marketing"],
  bar: ["marketing"],
};

export default function StaffPage() {
  const [payrollLocked, setPayrollLocked] = useState(false);

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

  const [salary, setSalary] = useState(0);
  const [confirmed, setConfirmed] = useState(false);
  const [canConfirmSalary, setCanConfirmSalary] = useState(false);

  const [currentUser, setCurrentUser] = useState(null);

  useEffect(() => {
    const locked = localStorage.getItem("payroll_locked") === "true";
    setPayrollLocked(locked);

    getCurrentUser();

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

    loadSalary(savedShift);
  }, []);

  async function getCurrentUser() {
    const { data } = await supabase.auth.getUser();

    if (!data?.user) return;

    const { data: userData } = await supabase
      .from("staff_accounts")
      .select("*")
      .eq("auth_user_id", data.user.id)
      .maybeSingle();

    if (userData) {
      setCurrentUser(userData);
      setDepartment(userData.position || "FOH");
    }
  }

  const loadSalary = async (savedShift) => {
    try {
      const shift = savedShift || JSON.parse(localStorage.getItem("shift") || "null");
      const staffName = currentUser?.name || shift?.name || "staff";

      if (shift?.start) {
        const shiftDate = new Date(shift.start);
        const now = new Date();

        const sameMonth =
          shiftDate.getMonth() === now.getMonth() &&
          shiftDate.getFullYear() === now.getFullYear();

        setCanConfirmSalary(!sameMonth);
      } else {
        setCanConfirmSalary(false);
      }

      const confirmations = JSON.parse(
        localStorage.getItem("salary_confirmations") || "{}"
      );

      setConfirmed(Boolean(confirmations[staffName]));

      const res = await fetch("/api/performance/list", {
        method: "GET",
        cache: "no-store",
      });
      const result = await res.json();

      if (!result.success || !Array.isArray(result.data) || result.data.length === 0) {
        setSalary(0);
        return;
      }

      const data = result.data;

      const history = JSON.parse(localStorage.getItem("history") || "[]");
      const today = history[history.length - 1] || {};

      const revenue = Number(today.revenue || 0);
      const serviceCharge = revenue * 0.05;

      const avgScore =
        data.reduce((sum, d) => sum + Number(d.score || 0), 0) / data.length;

      let multiplier = 1;
      if (avgScore >= 90) multiplier = 1;
      else if (avgScore >= 70) multiplier = 0.7;
      else if (avgScore >= 40) multiplier = 0.4;
      else multiplier = 0.2;

      const pool = serviceCharge * multiplier;
      const base = pool / data.length;

      setSalary(base);
    } catch (err) {
      console.error(err);
      setSalary(0);
    }
  };

  const confirmSalary = () => {
    const current = JSON.parse(localStorage.getItem("shift") || "{}");
    const staffName = currentUser?.name || current?.name || "staff";

    const confirmations = JSON.parse(
      localStorage.getItem("salary_confirmations") || "{}"
    );

    confirmations[staffName] = {
      confirmed: true,
      confirmed_at: new Date().toISOString(),
    };

    localStorage.setItem(
      "salary_confirmations",
      JSON.stringify(confirmations)
    );

    setConfirmed(true);
  };

  const startShift = () => {
    if (payrollLocked) {
      alert("Payroll is locked. Cannot start shift.");
      return;
    }

    if (!currentUser) {
      alert("User not loaded yet");
      return;
    }

    const now = new Date().toISOString();

    const shift = {
      active: true,
      start: now,
      department: department,
      name: currentUser.name,
      user_id: currentUser.id,
    };

    localStorage.setItem("shift", JSON.stringify(shift));
    setShiftActive(true);
    setShiftStart(now);
  };

  const endShift = async () => {
    if (payrollLocked) {
      alert("Payroll is locked. Cannot end shift.");
      return;
    }

    try {
      const currentShift = JSON.parse(localStorage.getItem("shift") || "null");

if (!currentUser && !currentShift) {
  alert("User not loaded. Please refresh.");
  return;
}

     const res = await fetch("/api/assets/list");

if (!res.ok) {
  const text = await res.text();
  console.error("API ERROR:", text);
  throw new Error("API failed: /api/assets/list");
}

const data = await res.json();

      const assets = Array.isArray(data?.assets)
        ? data.assets
        : Array.isArray(data)
        ? data
        : [];

      const today = new Date().toDateString();

      const rejectedFromBackend = assets.filter((item) => {
        const itemDate = new Date(item.created_at).toDateString();

        return (
          item.status === "rejected" &&
          (
            item.uploaded_by_id === currentUser?.id ||
            item.uploaded_by === currentShift.name
          ) &&
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

      await fetch("/api/performance/save", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          staff: currentUser?.id || currentShift.user_id || currentShift.name,
          staff_name: currentUser?.name || currentShift.name,
          department: department,
          score: calculatedScore,
        }),
      });

      await loadSalary(currentShift);

      alert(`✅ Shift completed\n\nPerformance Score: ${calculatedScore}%`);

    } catch (err) {
      console.error(err);
      alert("Something went wrong");
    }
  };

  return (
  
      <div className="min-h-screen text-white p-6 max-w-6xl mx-auto space-y-10">

        {payrollLocked && (
          <div className="bg-red-500/20 border border-red-500/30 text-red-200 rounded-2xl p-4">
            🔒 Payroll is locked. Staff actions are disabled for this payroll period.
          </div>
        )}

        {/* SHIFT */}
        <div className="rounded-2xl bg-white/5 border border-white/10 p-6 space-y-4">
          {!shiftActive ? (
            <>
              <div className="text-white/60">You are not clocked in</div>
              <button
                onClick={startShift}
                disabled={payrollLocked}
                className={`px-6 py-3 rounded-xl text-black font-medium ${
                  payrollLocked
                    ? "bg-white/20 text-white/40 cursor-not-allowed"
                    : "bg-[#ff7a00]"
                }`}
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
                disabled={payrollLocked}
                className={`px-6 py-3 rounded-xl font-medium ${
                  payrollLocked
                    ? "bg-white/20 text-white/40 cursor-not-allowed"
                    : "bg-red-500"
                }`}
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
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {payrollLocked ? (
            <div className="bg-white/5 border border-white/10 rounded-2xl p-6 text-center text-white/25">
              Invoice
            </div>
          ) : (
            <Link
              href="/staff/upload?type=invoice"
              className="bg-[#ff7a00] text-black rounded-2xl p-6 text-center font-medium"
            >
              Invoice
            </Link>
          )}

          {payrollLocked ? (
            <div className="bg-white/5 border border-white/10 rounded-2xl p-6 text-center text-white/25">
              Routine
            </div>
          ) : (
            <Link
              href="/staff/upload?type=routine"
              className="bg-white/10 rounded-2xl p-6 text-center"
            >
              Routine
            </Link>
          )}

          {payrollLocked ? (
            <div className="bg-white/5 border border-white/10 rounded-2xl p-6 text-center text-white/25">
              Marketing
            </div>
          ) : (
            <Link
              href="/staff/upload?type=marketing"
              className="bg-white/10 rounded-2xl p-6 text-center"
            >
              Marketing
            </Link>
          )}

          {department.toLowerCase() === "kitchen" ? (
            payrollLocked ? (
              <div className="bg-white/5 border border-white/10 rounded-2xl p-6 text-center text-white/25">
                Food
              </div>
            ) : (
              <Link
                href="/staff/upload?type=food"
                className="bg-white/10 rounded-2xl p-6 text-center"
              >
                Food
              </Link>
            )
          ) : (
            <div className="bg-white/5 border border-white/10 rounded-2xl p-6 text-center text-white/25">
              Food
            </div>
          )}
        </div>

        {/* SALARY CONFIRMATION */}
        <div className="rounded-2xl bg-white/5 border border-white/10 p-6 space-y-4">
          <div className="text-lg font-medium">Salary Confirmation</div>
          <div className="text-sm text-white/60">Your current salary preview</div>

          <div className="text-3xl text-green-400 font-semibold">
            ฿{salary.toFixed(0)}
          </div>

          {!canConfirmSalary ? (
            <div className="text-white/40">🔒 Salary can only be confirmed after month end</div>
          ) : confirmed ? (
            <div className="text-green-400">✅ Salary Confirmed</div>
          ) : (
            <button
              onClick={confirmSalary}
              className="bg-[#ff7a00] px-6 py-3 rounded-xl text-black font-medium"
            >
              Confirm Salary
            </button>
          )}
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

  );
}