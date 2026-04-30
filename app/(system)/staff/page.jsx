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
    "Operational proof of standards, cleaning, setup, and opening readiness. Missing this reduces your performance score and payout eligibility.",
  food:
    "Kitchen proof for food quality, prep, production work, and execution. Required for daily production accountability.",
  marketing:
    "Daily content that drives visibility, traffic, and revenue. This keeps the restaurant alive online and supports customer growth.",
  invoice:
    "Supplier or expense invoice for approval, accounting, and financial control.",
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
    return required.filter((task) => !tasks[task]);
  }, [required, tasks]);

  const rejectedLocal = useMemo(() => {
    return required.filter((task) => rejected[task]);
  }, [required, rejected]);

  const completedRequired = required.length - missing.length;
  const completionPercent =
    required.length > 0 ? Math.round((completedRequired / required.length) * 100) : 100;

  const staffLevel = getLevel(performancePreview.score);
  const topReviewer = leaderboard?.[0];
  const topSeller = salesLeaderboard?.[0];

  const myReviewRow = leaderboard.find((row) => {
    const name = String(row.name || "").toLowerCase();
    const currentName = String(currentUser?.name || "").toLowerCase();
    return currentName && name === currentName;
  });

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
  }, []);

  useEffect(() => {
    const missingNow = required.filter((task) => !tasks[task]);
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
  }, [required, tasks, rejected]);

  async function getCurrentUser(savedShift = null) {
    try {
      setLoadingUser(true);

      const { data } = await supabase.auth.getUser();
      if (!data?.user) {
        setLoadingUser(false);
        return;
      }

      const { data: userData, error } = await supabase
        .from("staff_accounts")
        .select("*")
        .eq("auth_user_id", data.user.id)
        .maybeSingle();

      if (error) console.error(error);

      if (userData) {
        const loginDepartment = userData.position || userData.role || savedShift?.department || "FOH";
        setCurrentUser(userData);
        setDepartment(loginDepartment);

        if (savedShift?.active) {
          const updatedShift = {
            ...savedShift,
            department: savedShift.department || loginDepartment,
            name: savedShift.name || userData.name,
            user_id: savedShift.user_id || userData.id,
          };
          localStorage.setItem("shift", JSON.stringify(updatedShift));
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingUser(false);
    }
  }

  async function loadLeaderboard() {
    try {
      const res = await fetch("/api/reviews/leaderboard", {
        method: "GET",
        cache: "no-store",
      });

      if (!res.ok) return;

      const result = await res.json();
      if (result.success) setLeaderboard(Array.isArray(result.data) ? result.data : []);
    } catch (err) {
      console.error(err);
    }
  }

  async function loadSalesCompetition() {
    try {
      const resEvent = await fetch("/api/events/active");
      const event = await resEvent.json();

      if (!event?.id) return;

      const res = await fetch(`/api/events/leaderboard?event_id=${event.id}`);
      const data = await res.json();

      setSalesLeaderboard(data.leaderboard || []);
    } catch (err) {
      console.error(err);
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

      const confirmations = JSON.parse(localStorage.getItem("salary_confirmations") || "{}");
      setConfirmed(Boolean(confirmations[staffName]));

      const res = await fetch("/api/performance/list", {
        method: "GET",
        cache: "no-store",
      });

      if (!res.ok) {
        setSalary(0);
        return;
      }

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

      const avgScore = data.reduce((sum, d) => sum + Number(d.score || 0), 0) / data.length;
      const level = getLevel(avgScore);
      const pool = serviceCharge * level.multiplier;
      const base = data.length > 0 ? pool / data.length : 0;

      setSalary(base);
    } catch (err) {
      console.error(err);
      setSalary(0);
    }
  };

  const confirmSalary = () => {
    const current = JSON.parse(localStorage.getItem("shift") || "{}");
    const staffName = currentUser?.name || current?.name || "staff";

    const confirmations = JSON.parse(localStorage.getItem("salary_confirmations") || "{}");

    confirmations[staffName] = {
      confirmed: true,
      confirmed_at: new Date().toISOString(),
    };

    localStorage.setItem("salary_confirmations", JSON.stringify(confirmations));
    setConfirmed(true);
  };

  const startShift = () => {
    if (payrollLocked) {
      alert("Payroll is locked. Cannot start shift.");
      return;
    }

    if (!currentUser) {
      alert("User not loaded yet. Please refresh or login again.");
      return;
    }

    const loginDepartment = currentUser.position || currentUser.role || department || "FOH";
    const now = new Date().toISOString();

    const shift = {
      active: true,
      start: now,
      department: loginDepartment,
      name: currentUser.name,
      user_id: currentUser.id,
    };

    localStorage.setItem("shift", JSON.stringify(shift));
    setDepartment(loginDepartment);
    setShiftActive(true);
    setShiftStart(now);
  };

  const endShift = async () => {
    if (payrollLocked) {
      alert("Payroll is locked. Cannot end shift.");
      return;
    }

    if (savingShift) return;
    setSavingShift(true);

    try {
      const currentShift = JSON.parse(localStorage.getItem("shift") || "null");

      if (!currentUser && !currentShift) {
        alert("User not loaded. Please refresh.");
        setSavingShift(false);
        return;
      }

      const activeDepartment = currentUser?.position || currentUser?.role || currentShift?.department || department;
      const activeRequired = REQUIRED_TASKS[normalizeDepartment(activeDepartment)] || [];
      const missingNow = activeRequired.filter((task) => !tasks[task]);
      const rejectedNow = activeRequired.filter((task) => rejected[task]);

      const res = await fetch("/api/assets/list", { cache: "no-store" });

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
      const staffId = currentUser?.id || currentShift?.user_id;
      const staffName = currentUser?.name || currentShift?.name;

      const rejectedFromBackend = assets.filter((item) => {
        const itemDate = item.created_at ? new Date(item.created_at).toDateString() : null;

        return (
          item.status === "rejected" &&
          (item.uploaded_by_id === staffId || item.uploaded_by === staffName) &&
          itemDate === today
        );
      });

      let calculatedScore = 100;
      calculatedScore -= missingNow.length * 20;
      calculatedScore -= rejectedNow.length * 15;

      const rejectedPenaltyCount = rejectedFromBackend.filter(
        (item) =>
          item.category === "food" ||
          item.category === "routine" ||
          item.type === "food" ||
          item.type === "routine"
      ).length;

      calculatedScore -= rejectedPenaltyCount * 15;

      if (calculatedScore < 0) calculatedScore = 0;
      if (calculatedScore > 100) calculatedScore = 100;

      if (missingNow.length > 0 || rejectedNow.length > 0 || rejectedFromBackend.length > 0) {
        alert(
          "You cannot finish shift yet.\n\n" +
            (missingNow.length > 0
              ? "Missing:\n" + missingNow.map((m) => `- ${TASK_LABELS[m] || m}`).join("\n") + "\n\n"
              : "") +
            (rejectedNow.length > 0
              ? "Rejected locally:\n" + rejectedNow.map((r) => `- ${TASK_LABELS[r] || r}`).join("\n") + "\n\n"
              : "") +
            (rejectedFromBackend.length > 0
              ? "Rejected uploads to fix:\n" +
                rejectedFromBackend
                  .map((r) => `- ${TASK_LABELS[r.category] || TASK_LABELS[r.type] || r.category || r.type || "Upload"}`)
                  .join("\n")
              : "")
        );

        if (rejectedFromBackend.length > 0) {
          window.location.href = "/staff/feedback";
        }

        setSavingShift(false);
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
          staff: staffId || staffName,
          staff_name: staffName,
          department: activeDepartment,
          score: calculatedScore,
        }),
      });

      await loadSalary(currentShift);
      await loadLeaderboard();

      alert(`Shift completed.\n\nPerformance Score: ${calculatedScore}%`);
    } catch (err) {
      console.error(err);
      alert("Something went wrong while ending shift.");
    } finally {
      setSavingShift(false);
    }
  };

  function statusPill(text, type = "neutral") {
    const classes = {
      neutral: "bg-white/10 text-white/60 border-white/10",
      good: "bg-green-500/10 text-green-300 border-green-500/20",
      warning: "bg-yellow-500/10 text-yellow-300 border-yellow-500/20",
      danger: "bg-red-500/10 text-red-300 border-red-500/20",
      orange: "bg-[#ff7a00]/10 text-[#ffb36b] border-[#ff7a00]/20",
    };

    return (
      <span className={`inline-flex rounded-full border px-3 py-1 text-xs ${classes[type]}`}>
        {text}
      </span>
    );
  }

  return (
    <div className="min-h-screen text-white px-4 py-6 sm:px-6 lg:px-8">
      <input
        ref={reviewInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        style={{ display: "none" }}
      />

      <div className="mx-auto max-w-7xl space-y-8">
        {/* HEADER */}
        <div className="rounded-[2rem] border border-white/10 bg-black/35 p-6 shadow-2xl backdrop-blur-xl">
          <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="text-sm uppercase tracking-[0.25em] text-[#ff9f3f]">
                Staff Control
              </div>
              <h1 className="mt-2 text-3xl font-semibold md:text-4xl">
                Staff Control Portal
              </h1>
              <div className="mt-2 text-white/60">
                {loadingUser ? "Loading user..." : `${currentUser?.name || "Staff"} — ${displayDepartment(department)}`}
              </div>
            </div>

            <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.06] px-5 py-4 text-right">
              <div className="text-sm text-white/40">Preview Score</div>
              <div className={`mt-1 text-3xl font-semibold ${staffLevel.color}`}>
                {performancePreview.score}%
              </div>
              <div className="mt-1 text-xs text-white/40">{staffLevel.label}</div>
            </div>
          </div>
        </div>

        {/* SHIFT + TODAY FLOW */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* SHIFT STATUS */}
          <section className="lg:col-span-4 rounded-[2rem] border border-white/10 bg-black/35 p-6 shadow-2xl backdrop-blur-xl">
            <div className="flex items-start justify-between">
              <div>
                <div className="text-sm text-white/40">Shift Status</div>
                <div className="mt-2 text-4xl font-semibold">
                  {shiftActive ? "On duty" : "Off duty"}
                </div>
              </div>
              <div className={`mt-1 h-4 w-4 rounded-full ${shiftActive ? "bg-green-400" : "bg-white/20"}`} />
            </div>

            <div className="mt-8 rounded-[1.5rem] border border-white/10 bg-white/[0.05] p-5">
              <div className="flex justify-between py-2 text-lg">
                <span className="text-white/45">Department</span>
                <span>{displayDepartment(department)}</span>
              </div>
              <div className="flex justify-between py-2 text-lg">
                <span className="text-white/45">Start time</span>
                <span>{shiftStart ? new Date(shiftStart).toLocaleTimeString() : "-"}</span>
              </div>
              <div className="flex justify-between py-2 text-lg">
                <span className="text-white/45">Required tasks</span>
                <span>
                  {completedRequired}/{required.length}
                </span>
              </div>
            </div>

            {!shiftActive ? (
              <button
                onClick={startShift}
                disabled={payrollLocked || loadingUser}
                className="mt-8 w-full rounded-[1.5rem] bg-[#ff7a00] px-6 py-5 text-lg font-semibold text-black transition hover:bg-[#ff9f3f] disabled:opacity-40"
              >
                Start Shift
              </button>
            ) : (
              <button
                onClick={endShift}
                disabled={savingShift || payrollLocked}
                className="mt-8 w-full rounded-[1.5rem] bg-red-500 px-6 py-5 text-lg font-semibold text-white transition hover:bg-red-400 disabled:opacity-40"
              >
                {savingShift ? "Checking Shift..." : "End Shift"}
              </button>
            )}
          </section>

          {/* TODAY FLOW */}
          <section className="lg:col-span-8 rounded-[2rem] border border-white/10 bg-black/35 p-6 shadow-2xl backdrop-blur-xl">
            <div className="text-sm text-white/40">Today Flow</div>

            <div className="mt-2 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div>
                <h2 className="text-4xl font-semibold">Required Work</h2>
                <p className="mt-3 max-w-2xl text-lg leading-relaxed text-white/55">
                  Complete your operational proof to unlock full performance score,
                  shift closing, and payout eligibility.
                </p>
              </div>

              <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.05] px-5 py-4 text-right">
                <div className="text-sm text-white/40">Progress</div>
                <div className="mt-1 text-3xl font-semibold">{completionPercent}%</div>
              </div>
            </div>

            <div className="mt-7">
              <div className="h-3 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-3 rounded-full bg-[#ff7a00]"
                  style={{ width: `${completionPercent}%` }}
                />
              </div>
              <div className="mt-3 text-sm text-white/50">
                {missing.length === 0
                  ? "All required tasks completed — shift can be closed."
                  : "Complete required uploads to avoid penalties."}
              </div>
            </div>

            <div className="mt-7 grid grid-cols-1 gap-5 md:grid-cols-2">
              {required.length === 0 ? (
                <div className="rounded-[1.75rem] border border-white/10 bg-white/[0.05] p-6">
                  <div className="text-lg font-semibold">No Required Tasks</div>
                  <p className="mt-2 text-white/50">
                    Your department currently has no required upload tasks.
                  </p>
                </div>
              ) : (
                required.map((task) => {
                  const done = tasks[task];
                  const isRejected = rejected[task];

                  return (
                    <div
                      key={task}
                      className="rounded-[1.75rem] border border-white/10 bg-white/[0.05] p-6"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <div className="text-2xl font-semibold">
                            {TASK_LABELS[task] || task}
                          </div>
                          <p className="mt-3 leading-relaxed text-white/50">
                            {TASK_DESCRIPTIONS[task]}
                          </p>
                        </div>

                        {isRejected
                          ? statusPill("Rejected", "danger")
                          : done
                          ? statusPill("Done", "good")
                          : statusPill("Pending", "neutral")}
                      </div>

                      <Link
                        href={TASK_LINKS[task] || "/staff/upload"}
                        className="mt-7 flex w-full items-center justify-center rounded-[1.4rem] border border-white/10 bg-white/15 px-5 py-4 text-center text-lg font-semibold text-white transition hover:bg-white/25"
                      >
                        {done ? `Update ${TASK_LABELS[task]}` : `Upload ${TASK_LABELS[task]}`}
                      </Link>
                    </div>
                  );
                })
              )}
            </div>

            <div className="mt-6 rounded-[1.75rem] border border-white/10 bg-white/[0.04] p-6">
              <div className="text-lg text-white/45">Validation</div>
              <div className="mt-2 text-xl">
                {missing.length === 0 && rejectedLocal.length === 0 ? (
                  <span className="text-green-300">Ready — all required work is completed.</span>
                ) : (
                  <span className="text-red-300">
                    {missing.length > 0 &&
                      `Missing: ${missing.map((m) => TASK_LABELS[m] || m).join(", ")}`}
                    {missing.length > 0 && rejectedLocal.length > 0 ? " · " : ""}
                    {rejectedLocal.length > 0 &&
                      `Rejected: ${rejectedLocal.map((r) => TASK_LABELS[r] || r).join(", ")}`}
                  </span>
                )}
              </div>
            </div>
          </section>
        </div>

        {/* COMPETITIONS */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* REVIEW COMPETITION */}
          <section className="lg:col-span-6 rounded-[2rem] border border-[#ff7a00]/25 bg-black/35 p-6 shadow-2xl backdrop-blur-xl">
            <div className="flex items-start justify-between gap-5">
              <div>
                <div className="text-sm uppercase tracking-[0.25em] text-[#ffb36b]">
                  Competition Driver
                </div>
                <h2 className="mt-2 text-4xl font-semibold">Google Review Challenge</h2>
                <p className="mt-4 text-lg leading-relaxed text-white/58">
                  Turn every guest into a promoter. Reviews increase restaurant visibility,
                  create customer trust, and add bonus value to your performance.
                </p>
              </div>

              <div className="min-w-[96px] rounded-[1.5rem] border border-[#ff7a00]/25 bg-[#ff7a00]/10 p-4 text-center">
                <div className="text-sm text-white/45">My reviews</div>
                <div className="mt-1 text-4xl font-semibold text-[#ffb36b]">
                  {myReviewRow?.count || 0}
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => reviewInputRef.current?.click()}
              className="mt-7 w-full rounded-[1.5rem] bg-[#ff7a00] px-6 py-5 text-lg font-semibold text-black transition hover:bg-[#ff9f3f]"
            >
              Upload Google Review
            </button>

            <Link
              href="/staff/upload"
              className="mt-4 flex w-full items-center justify-center rounded-[1.5rem] border border-white/10 bg-white/15 px-6 py-4 text-lg text-white transition hover:bg-white/25"
            >
              Other Uploads
            </Link>
          </section>

          <section className="lg:col-span-6 rounded-[2rem] border border-white/10 bg-black/35 p-6 shadow-2xl backdrop-blur-xl">
            <div className="text-sm text-white/40">Live Ranking</div>
            <h2 className="mt-2 text-4xl font-semibold">Review Competition</h2>

            <div className="mt-7 rounded-[1.75rem] border border-white/10 bg-white/[0.05] p-5">
              {leaderboard.length === 0 ? (
                <div className="py-5 text-center text-lg text-white/45">
                  No reviews today. First upload takes the lead.
                </div>
              ) : (
                <div className="space-y-3">
                  {leaderboard.map((u, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between rounded-[1.25rem] border border-white/10 bg-white/[0.04] px-4 py-3"
                    >
                      <div>
                        <div className="text-sm text-white/35">Rank #{i + 1}</div>
                        <div className="text-lg font-semibold">{u.name || "Staff"}</div>
                      </div>
                      <div className="text-2xl font-semibold text-[#ffb36b]">
                        {u.count || 0}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {topReviewer && (
              <div className="mt-4 rounded-[1.5rem] border border-[#ff7a00]/20 bg-[#ff7a00]/10 p-4 text-sm text-[#ffb36b]">
                Current leader: {topReviewer.name} with {topReviewer.count || 0} reviews.
              </div>
            )}
          </section>
        </div>

        {/* SALES COMPETITION */}
        <section className="rounded-[2rem] border border-[#ff7a00]/25 bg-black/35 p-6 shadow-2xl backdrop-blur-xl">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-3xl">
              <div className="text-sm uppercase tracking-[0.25em] text-[#ffb36b]">
                Revenue Driver
              </div>
              <h2 className="mt-2 text-4xl font-semibold">Sales Competition</h2>
              <p className="mt-4 text-lg leading-relaxed text-white/58">
                Every order is performance. Upsell smarter, increase table value,
                recommend add-ons, and push higher revenue without lowering service quality.
              </p>
              <p className="mt-3 text-lg font-semibold text-[#ffb36b]">
                Higher sales = higher service charge pool = higher payout opportunity.
              </p>
            </div>

            <div className="rounded-[1.75rem] border border-[#ff7a00]/25 bg-[#ff7a00]/10 p-5 text-right">
              <div className="text-sm text-white/45">Top seller</div>
              <div className="mt-1 text-2xl font-semibold">
                {topSeller?.name || topSeller?.staff_id || "Not started"}
              </div>
              <div className="mt-1 text-3xl font-semibold text-[#ffb36b]">
                {topSeller?.score || 0}
              </div>
            </div>
          </div>

          <div className="mt-7 rounded-[1.75rem] border border-white/10 bg-white/[0.05] p-5">
            {salesLeaderboard.length === 0 ? (
              <div className="py-5 text-center text-lg text-white/45">
                No sales recorded yet — first sale sets the pace.
              </div>
            ) : (
              <div className="space-y-3">
                {salesLeaderboard.map((u, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between rounded-[1.25rem] border border-white/10 bg-white/[0.04] px-4 py-3"
                  >
                    <div>
                      <div className="text-sm text-white/35">Rank #{i + 1}</div>
                      <div className="text-lg font-semibold">
                        {u.name || `Staff ${u.staff_id || ""}`}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm text-white/35">Sales score</div>
                      <div className="text-2xl font-semibold text-[#ffb36b]">
                        {u.score || 0}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* SALARY + TOOLS */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* SALARY */}
          <section className="lg:col-span-5 rounded-[2rem] border border-white/10 bg-black/35 p-6 shadow-2xl backdrop-blur-xl">
            <div className="text-sm text-white/40">Salary Preview</div>
            <div className="mt-3 text-5xl font-semibold text-green-400">
              ฿{salary.toFixed(0)}
            </div>

            <p className="mt-4 text-lg leading-relaxed text-white/55">
              Preview is based on revenue, service charge, team performance,
              completed tasks, and approval status.
            </p>

            <div className="mt-7 rounded-[1.5rem] border border-white/10 bg-white/[0.05] p-5 text-white/45">
              {!canConfirmSalary
                ? "Salary confirmation opens after month end."
                : confirmed
                ? "Salary confirmed — awaiting payout."
                : "Review and confirm your salary before final payout."}
            </div>

            {canConfirmSalary && !confirmed && (
              <button
                onClick={confirmSalary}
                className="mt-5 w-full rounded-[1.5rem] bg-[#ff7a00] px-6 py-4 text-lg font-semibold text-black transition hover:bg-[#ff9f3f]"
              >
                Confirm Salary
              </button>
            )}
          </section>

          {/* TOOLS */}
          <section className="lg:col-span-7 rounded-[2rem] border border-white/10 bg-black/35 p-6 shadow-2xl backdrop-blur-xl">
            <div className="text-sm text-white/40">Staff Tools</div>
            <h2 className="mt-2 text-4xl font-semibold">Quick Access</h2>
            <p className="mt-3 text-lg text-white/55">
              Access your performance, earnings, review records, and manager feedback.
            </p>

            <div className="mt-7 grid grid-cols-1 gap-4 md:grid-cols-2">
              <Link
                href="/staff/performance"
                className="rounded-[1.5rem] border border-white/10 bg-white/[0.05] p-5 transition hover:bg-white/[0.09]"
              >
                <div className="text-xl font-semibold">Performance</div>
                <div className="mt-2 text-white/45">Scores, levels, and penalties</div>
              </Link>

              <Link
                href="/staff/earnings"
                className="rounded-[1.5rem] border border-white/10 bg-white/[0.05] p-5 transition hover:bg-white/[0.09]"
              >
                <div className="text-xl font-semibold">Earnings</div>
                <div className="mt-2 text-white/45">Salary and payout history</div>
              </Link>

              <Link
                href="/staff/reviews"
                className="rounded-[1.5rem] border border-white/10 bg-white/[0.05] p-5 transition hover:bg-white/[0.09]"
              >
                <div className="text-xl font-semibold">Reviews</div>
                <div className="mt-2 text-white/45">Customer review records</div>
              </Link>

              <Link
                href="/staff/messages"
                className="rounded-[1.5rem] border border-white/10 bg-white/[0.05] p-5 transition hover:bg-white/[0.09]"
              >
                <div className="text-xl font-semibold">Messages</div>
                <div className="mt-2 text-white/45">Manager feedback and updates</div>
              </Link>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}