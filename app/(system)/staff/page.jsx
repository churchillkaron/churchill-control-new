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
  routine: "Daily proof that standards, cleaning, and setup were completed.",
  food: "Kitchen proof for food quality, prep, or production work.",
  marketing: "Photo or video content for daily marketing activity.",
  invoice: "Supplier or expense invoice for approval.",
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
  const completionPercent = required.length > 0 ? Math.round((completedRequired / required.length) * 100) : 100;
  const staffLevel = getLevel(performancePreview.score);
  const topReviewer = leaderboard?.[0];
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
        (item) => item.category === "food" || item.category === "routine" || item.type === "food" || item.type === "routine"
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

    {/* ✅ HIDDEN REVIEW INPUT */}
    <input
      ref={reviewInputRef}
      type="file"
      accept="image/*"
      capture="environment"
      style={{ display: "none" }}
      onChange={(e) => {
        const file = e.target.files[0];
        if (!file) return;

        console.log("Review image:", file);
      }}
    />

    <div className="mx-auto max-w-7xl space-y-8">
        <div className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-gradient-to-br from-white/10 via-white/[0.04] to-black/20 p-6 shadow-2xl shadow-black/30">
          <div className="absolute right-0 top-0 h-48 w-48 rounded-full bg-[#ff7a00]/20 blur-3xl" />
          <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="mb-3 flex flex-wrap gap-2">
                {statusPill(displayDepartment(department), "orange")}
                {shiftActive ? statusPill("SHIFT ACTIVE", "good") : statusPill("NOT CLOCKED IN", "neutral")}
                {payrollLocked && statusPill("PAYROLL LOCKED", "danger")}
              </div>

              <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                Staff Control Portal
              </h1>
              <p className="mt-2 max-w-2xl text-sm text-white/55">
                Complete today’s required work, upload proof, compete for reviews, and protect your payout.
              </p>
            </div>

            <div className="rounded-3xl border border-white/10 bg-black/20 p-5 min-w-[260px]">
              <div className="text-xs uppercase tracking-[0.25em] text-white/35">Logged in as</div>
              <div className="mt-2 text-xl font-medium">{currentUser?.name || (loadingUser ? "Loading..." : "Staff")}</div>
              <div className="mt-1 text-sm text-white/45">{displayDepartment(department)} department</div>
            </div>
          </div>
        </div>

        {payrollLocked && (
          <div className="rounded-3xl border border-red-500/20 bg-red-500/10 p-5 text-red-200">
            Payroll is locked. Staff actions are disabled for this payroll period.
          </div>
        )}

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <section className="lg:col-span-4 rounded-[2rem] border border-white/10 bg-white/[0.05] p-6 shadow-xl shadow-black/20">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-sm text-white/45">Shift Status</div>
                <div className="mt-2 text-2xl font-semibold">
                  {shiftActive ? "On duty" : "Ready to start"}
                </div>
              </div>
              <div className={`h-3 w-3 rounded-full ${shiftActive ? "bg-green-400" : "bg-white/30"}`} />
            </div>

            <div className="mt-6 space-y-3 rounded-2xl border border-white/10 bg-black/20 p-4 text-sm">
              <div className="flex justify-between">
                <span className="text-white/45">Department</span>
                <span>{displayDepartment(department)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-white/45">Start time</span>
                <span>{shiftStart ? new Date(shiftStart).toLocaleTimeString() : "Not started"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-white/45">Required tasks</span>
                <span>{completedRequired}/{required.length}</span>
              </div>
            </div>

            {!shiftActive ? (
              <button
                onClick={startShift}
                disabled={payrollLocked || loadingUser || !currentUser}
                className={`mt-6 w-full rounded-2xl px-5 py-4 font-semibold transition ${
                  payrollLocked || loadingUser || !currentUser
                    ? "bg-white/10 text-white/30 cursor-not-allowed"
                    : "bg-[#ff7a00] text-black hover:brightness-110"
                }`}
              >
                Start Shift
              </button>
            ) : (
              <button
                onClick={endShift}
                disabled={payrollLocked || savingShift}
                className={`mt-6 w-full rounded-2xl px-5 py-4 font-semibold transition ${
                  payrollLocked || savingShift
                    ? "bg-white/10 text-white/30 cursor-not-allowed"
                    : "bg-red-500 text-white hover:brightness-110"
                }`}
              >
                {savingShift ? "Checking..." : "End Shift"}
              </button>
            )}
          </section>

          <section className="lg:col-span-8 rounded-[2rem] border border-white/10 bg-white/[0.05] p-6 shadow-xl shadow-black/20">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="text-sm text-white/45">Today Flow</div>
                <h2 className="mt-1 text-2xl font-semibold">Required work</h2>
              </div>
              <div className="rounded-full border border-white/10 bg-black/20 px-4 py-2 text-sm text-white/60">
                {completionPercent}% complete
              </div>
            </div>

            <div className="mt-6 h-2 overflow-hidden rounded-full bg-white/10">
              <div className="h-full rounded-full bg-[#ff7a00]" style={{ width: `${completionPercent}%` }} />
            </div>

            <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
              {required.map((task) => {
                const done = tasks[task];
                const isRejected = rejected[task];

                return (
                  <div key={task} className="rounded-3xl border border-white/10 bg-black/20 p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="font-medium">{TASK_LABELS[task] || task}</div>
                        <p className="mt-1 text-sm text-white/45">{TASK_DESCRIPTIONS[task]}</p>
                      </div>
                      {isRejected ? statusPill("Rejected", "danger") : done ? statusPill("Done", "good") : statusPill("Pending", "neutral")}
                    </div>

                    {!done && !isRejected && !payrollLocked && (
                      <Link
                        href={TASK_LINKS[task] || `/staff/upload?type=${task}`}
                        className="mt-5 block rounded-2xl bg-white/10 px-4 py-3 text-center text-sm font-medium hover:bg-white/15"
                      >
                        Upload {TASK_LABELS[task] || task}
                      </Link>
                    )}

                    {isRejected && (
                      <Link
                        href="/staff/feedback"
                        className="mt-5 block rounded-2xl bg-red-500/20 px-4 py-3 text-center text-sm font-medium text-red-200 hover:bg-red-500/30"
                      >
                        Fix rejected upload
                      </Link>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="mt-6 rounded-3xl border border-white/10 bg-black/20 p-5">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="text-sm text-white/45">Validation</div>
                  {missing.length === 0 && rejectedLocal.length === 0 ? (
                    <div className="mt-1 text-green-300">Ready to close shift</div>
                  ) : (
                    <div className="mt-1 text-red-300">
                      {missing.length > 0 && <span>Missing: {missing.map((m) => TASK_LABELS[m] || m).join(", ")}</span>}
                      {missing.length > 0 && rejectedLocal.length > 0 && <span> · </span>}
                      {rejectedLocal.length > 0 && <span>Rejected: {rejectedLocal.map((r) => TASK_LABELS[r] || r).join(", ")}</span>}
                    </div>
                  )}
                </div>

                <div className="text-right">
                  <div className="text-sm text-white/45">Preview Score</div>
                  <div className={`text-2xl font-semibold ${staffLevel.color}`}>{performancePreview.score}%</div>
                </div>
              </div>
            </div>
          </section>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <section className="lg:col-span-5 rounded-[2rem] border border-[#ff7a00]/20 bg-[#ff7a00]/10 p-6 shadow-xl shadow-black/20">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-sm text-[#ffb36b]">Competition Driver</div>
                <h2 className="mt-1 text-2xl font-semibold">Google Review Challenge</h2>
                <p className="mt-2 text-sm text-white/55">
                
                  Reviews are not mandatory every shift. They are competition points that create bonus value and customer growth.
                </p>
              </div>
              <div className="rounded-2xl border border-[#ff7a00]/20 bg-black/20 px-4 py-3 text-center">
                <div className="text-xs text-white/40">My reviews</div>
                <div className="text-2xl font-semibold text-[#ffb36b]">{myReviewRow?.count || 0}</div>
              </div>
            </div>

           {!payrollLocked && (
  <div className="mt-6 space-y-3">

  {/* REVIEW = CAMERA */}
  <button
    onClick={() => reviewInputRef.current.click()}
    className="block w-full rounded-2xl bg-[#ff7a00] px-5 py-4 text-center font-semibold text-black hover:brightness-110"
  >
    Upload Google Review
  </button>

  {/* OTHER = PAGE */}
  <Link
    href="/staff/upload"
    className="block rounded-2xl bg-white/10 px-5 py-3 text-center text-sm hover:bg-white/15"
  >
    Other Uploads
  </Link>

</div>
)}
    
          </section>

          <section className="lg:col-span-7 rounded-[2rem] border border-white/10 bg-white/[0.05] p-6 shadow-xl shadow-black/20">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-white/45">Live Ranking</div>
                <h2 className="mt-1 text-2xl font-semibold">Review Competition</h2>
              </div>
              {topReviewer && statusPill(`Leader: ${topReviewer.name}`, "orange")}
            </div>

            <div className="mt-6 space-y-3">
              {leaderboard.length === 0 ? (
                <div className="rounded-3xl border border-white/10 bg-black/20 p-6 text-center text-white/40">
                  No reviews today. First upload takes the lead.
                </div>
              ) : (
                leaderboard.map((user, index) => {
                  const rankStyle = index === 0 ? "border-[#ff7a00]/30 bg-[#ff7a00]/10" : "border-white/10 bg-black/20";

                  return (
                    <div key={`${user.name}-${index}`} className={`flex items-center justify-between rounded-2xl border p-4 ${rankStyle}`}>
                      <div className="flex items-center gap-4">
                        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/10 text-sm font-semibold">
                          {index + 1}
                        </div>
                        <div>
                          <div className="font-medium">{user.name}</div>
                          <div className="text-xs text-white/40">Google review uploads</div>
                        </div>
                      </div>
                      <div className="text-2xl font-semibold text-[#ffb36b]">{user.count}</div>
                    </div>
                  );
                })
              )}
            </div>
          </section>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <section className="lg:col-span-5 rounded-[2rem] border border-white/10 bg-white/[0.05] p-6 shadow-xl shadow-black/20">
            <div className="text-sm text-white/45">Salary Preview</div>
            <div className="mt-2 text-4xl font-semibold text-green-400">฿{salary.toFixed(0)}</div>
            <p className="mt-2 text-sm text-white/45">
              Preview is based on revenue, service charge, and team performance.
            </p>

            <div className="mt-6 rounded-3xl border border-white/10 bg-black/20 p-4">
              {!canConfirmSalary ? (
                <div className="text-white/40">Salary confirmation opens after month end.</div>
              ) : confirmed ? (
                <div className="text-green-400">Salary confirmed.</div>
              ) : (
                <button
                  onClick={confirmSalary}
                  className="w-full rounded-2xl bg-[#ff7a00] px-5 py-4 font-semibold text-black hover:brightness-110"
                >
                  Confirm Salary
                </button>
              )}
            </div>
          </section>

          <section className="lg:col-span-7 rounded-[2rem] border border-white/10 bg-white/[0.05] p-6 shadow-xl shadow-black/20">
            <div className="text-sm text-white/45">Staff Tools</div>
            <h2 className="mt-1 text-2xl font-semibold">Quick Access</h2>

            <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Link href="/staff/performance" className="rounded-3xl border border-white/10 bg-black/20 p-5 hover:bg-white/10">
                <div className="font-medium">Performance</div>
                <div className="mt-1 text-sm text-white/45">Scores, levels, and penalties</div>
              </Link>

              <Link href="/staff/earnings" className="rounded-3xl border border-white/10 bg-black/20 p-5 hover:bg-white/10">
                <div className="font-medium">Earnings</div>
                <div className="mt-1 text-sm text-white/45">Salary and payout history</div>
              </Link>

              <Link href="/staff/reviews" className="rounded-3xl border border-white/10 bg-black/20 p-5 hover:bg-white/10">
                <div className="font-medium">Reviews</div>
                <div className="mt-1 text-sm text-white/45">Customer review records</div>
              </Link>

              <Link href="/staff/messages" className="rounded-3xl border border-white/10 bg-black/20 p-5 hover:bg-white/10">
                <div className="font-medium">Messages</div>
                <div className="mt-1 text-sm text-white/45">Manager feedback and updates</div>
              </Link>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
