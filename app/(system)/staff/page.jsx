"use client";

import { useEffect, useMemo, useState, useRef } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

const REQUIRED_TASKS = {
  kitchen: ["food"],
  foh: ["routine", "marketing"],
  bar: ["marketing"],
};

const TASK_LABELS = {
  routine: "Routine Check",
  food: "Food / Kitchen Proof",
  marketing: "Marketing Upload",
  invoice: "Invoice Upload",
};

const TASK_DESCRIPTIONS = {
  routine:
    "Operational proof of standards, cleaning, and opening readiness. Missing this reduces your performance score and payout.",
  food:
    "Kitchen proof for food quality, prep, and execution. Required for production accountability.",
  marketing:
    "Daily content that drives visibility, traffic, and revenue. This directly impacts business growth.",
  invoice:
    "Supplier or expense invoice for approval and financial tracking.",
};

const TASK_LINKS = {
  routine: "/staff/upload?type=routine",
  food: "/staff/upload?type=food",
  marketing: "/staff/upload?type=marketing",
  invoice: "/staff/upload?type=invoice",
};

function normalizeDepartment(value) {
  return String(value || "FOH").trim().toLowerCase();
}

function displayDepartment(value) {
  const dept = normalizeDepartment(value);
  if (dept === "foh") return "FOH";
  if (dept === "bar") return "BAR";
  if (dept === "kitchen") return "KITCHEN";
  return String(value || "FOH").toUpperCase();
}

function getLevel(score) {
  const value = Number(score || 0);
  if (value >= 90) return { label: "GOOD", multiplier: 1, color: "text-green-400" };
  if (value >= 70) return { label: "WARNING", multiplier: 0.7, color: "text-yellow-400" };
  if (value >= 40) return { label: "BAD", multiplier: 0.4, color: "text-orange-400" };
  return { label: "CRITICAL", multiplier: 0.2, color: "text-red-400" };
}

export default function StaffPage() {

  const [departmentRoutineCompleted, setDepartmentRoutineCompleted] = useState(false);
  const reviewInputRef = useRef(null);

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

  const [leaderboard, setLeaderboard] = useState([]);
  const [salesLeaderboard, setSalesLeaderboard] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [loadingUser, setLoadingUser] = useState(true);
  const [savingShift, setSavingShift] = useState(false);

  const [performancePreview, setPerformancePreview] = useState({
    score: 100,
    missing: [],
    rejectedLocal: [],
  });

  const normalizedDepartment = normalizeDepartment(department);

  const required = useMemo(() => {
    return REQUIRED_TASKS[normalizedDepartment] || [];
  }, [normalizedDepartment]);

  const missing = useMemo(() => {
  return required.filter((task) => {
    if (task === "routine") {
      return !departmentRoutineCompleted;
    }
    return !tasks[task];
  });
}, [required, tasks, departmentRoutineCompleted]);

  const rejectedLocal = useMemo(() => {
    return required.filter((task) => rejected[task]);
  }, [required, rejected]);

  const completedRequired = required.length - missing.length;
  const completionPercent =
    required.length > 0
      ? Math.round((completedRequired / required.length) * 100)
      : 100;

  const staffLevel = getLevel(performancePreview.score);

  useEffect(() => {
    const locked = localStorage.getItem("payroll_locked") === "true";
    setPayrollLocked(locked);

    const savedShift = JSON.parse(localStorage.getItem("shift") || "null");
    const savedTasks = JSON.parse(localStorage.getItem("tasks") || "null");
    const savedRejected = JSON.parse(localStorage.getItem("rejected") || "null");

    if (savedShift) {
      setShiftActive(Boolean(savedShift.active));
      setShiftStart(savedShift.start || null);
      if (savedShift.department) setDepartment(savedShift.department);
    }

    if (savedTasks) setTasks((prev) => ({ ...prev, ...savedTasks }));
    if (savedRejected) setRejected((prev) => ({ ...prev, ...savedRejected }));

    getCurrentUser(savedShift);
    loadSalary(savedShift);
    loadLeaderboard();
    loadSalesCompetition();
    checkDepartmentRoutine();
  }, []);

 useEffect(() => {
  const missingNow = required.filter((task) => {
    if (task === "routine") {
      return !departmentRoutineCompleted;
    }
    return !tasks[task];
  });

  const rejectedNow = required.filter((task) => rejected[task]);

  let score = 100;
  score -= missingNow.length * 20;
  score -= rejectedNow.length * 15;

  if (score < 0) score = 0;
  if (score > 100) score = 100;

  setPerformancePreview({
    score,
    missing: missingNow,
    rejectedLocal: rejectedNow,
  });
}, [required, tasks, rejected, departmentRoutineCompleted]);

  async function loadLeaderboard() {
    try {
      const res = await fetch("/api/reviews/leaderboard");
      const result = await res.json();
      if (result.success) setLeaderboard(result.data || []);
    } catch {}
  }

  async function loadSalesCompetition() {
    try {
      const resEvent = await fetch("/api/events/active");
      const event = await resEvent.json();
      if (!event?.id) return;

      const res = await fetch(`/api/events/leaderboard?event_id=${event.id}`);
      const data = await res.json();
      setSalesLeaderboard(data.leaderboard || []);
    } catch {}
  }

  async function getCurrentUser() {
    try {
      setLoadingUser(true);
      const { data } = await supabase.auth.getUser();

      if (!data?.user) return;

      const { data: userData } = await supabase
        .from("staff_accounts")
        .select("*")
        .eq("auth_user_id", data.user.id)
        .maybeSingle();

      if (userData) {
        setCurrentUser(userData);
        setDepartment(userData.role || "FOH");
      }
    } finally {
      setLoadingUser(false);
    }
  }

  async function loadSalary() {
    setSalary(315); // keep your current preview logic
  }

  return (
    <div className="min-h-screen text-white px-4 py-6">

      <div className="max-w-7xl mx-auto space-y-8">

        {/* HEADER */}
        <div className="card flex justify-between">
          <div>
            <h1 className="text-3xl font-semibold">Staff Control Portal</h1>
            <div className="text-white/60">
              {currentUser?.name} — {displayDepartment(department)}
            </div>
          </div>

          <div>
            <div className="text-sm text-white/40">Performance</div>
            <div className={`text-2xl ${staffLevel.color}`}>
              {performancePreview.score}%
            </div>
          </div>
        </div>

        {/* SHIFT + FLOW */}
        <div className="grid lg:grid-cols-12 gap-6">

          {/* SHIFT */}
          <div className="lg:col-span-4 card">
            <div className="text-white/40 text-sm">Shift Status</div>
            <div className="text-xl">
              {shiftActive ? "On duty" : "Off duty"}
            </div>

            <div className="text-white/60 mt-2">
              Start: {shiftStart || "-"}
            </div>

            <div className="text-white/60">
              Tasks: {completedRequired}/{required.length}
            </div>

            <button className="btn-primary mt-4">
              {shiftActive ? "End Shift" : "Start Shift"}
            </button>
          </div>

          {/* TODAY FLOW */}
          <div className="lg:col-span-8 card">
            <div className="text-white/40 text-sm">Today Flow</div>
            <div className="text-xl font-semibold">Required Work</div>

            <p className="text-white/60 mt-2">
              Complete your operational proof to unlock full performance score
              and payout eligibility.
            </p>

            <div className="mt-4 h-2 bg-white/10 rounded-full">
              <div
                className="h-2 bg-orange-500 rounded-full"
                style={{ width: `${completionPercent}%` }}
              />
            </div>

            <div className="text-sm text-white/60 mt-2">
              {missing.length === 0
                ? "All required tasks completed — shift can be closed"
                : "Complete required uploads to avoid penalties"}
            </div>
          </div>

        </div>

        {/* COMPETITIONS */}
        <div className="grid lg:grid-cols-12 gap-6">

          {/* REVIEWS */}
          <div className="lg:col-span-6 card">
            <div className="text-white/40 text-sm">Competition Driver</div>
            <div className="text-xl font-semibold">Google Review Challenge</div>

            <p className="text-white/60 mt-2">
              Turn every guest into a promoter. Each review boosts visibility,
              traffic, and your performance value.
            </p>

            {leaderboard.length === 0 ? (
              <div className="text-white/40 mt-4">
                No reviews yet — first upload takes the lead.
              </div>
            ) : (
              leaderboard.map((u, i) => (
                <div key={i} className="flex justify-between mt-2">
                  <span>#{i + 1} {u.name}</span>
                  <span>{u.count}</span>
                </div>
              ))
            )}
          </div>

          {/* SALES */}
          <div className="lg:col-span-6 card">
            <div className="text-white/40 text-sm">Revenue Driver</div>
            <div className="text-xl font-semibold">Sales Competition</div>

            <p className="text-white/60 mt-2">
              Every order is performance. Upsell smarter, increase table value,
              and drive total revenue.
            </p>

            <p className="text-orange-400 text-sm mt-2">
              Higher sales = higher service charge = higher payout.
            </p>

            {salesLeaderboard.length === 0 ? (
              <div className="text-white/40 mt-4">
                No sales yet — first sale sets the pace.
              </div>
            ) : (
              salesLeaderboard.map((u, i) => (
                <div key={i} className="flex justify-between mt-2">
                  <span>#{i + 1} {u.name || "Staff"}</span>
                  <span>{u.score}</span>
                </div>
              ))
            )}
          </div>

        </div>

      </div>
    </div>
  );
}