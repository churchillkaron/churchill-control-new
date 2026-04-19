"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import AppShell from "../AppShell";

export default function StaffPage() {
  const [name, setName] = useState("");
  const [selected, setSelected] = useState(false);

  const [attendance, setAttendance] = useState([]);
  const [history, setHistory] = useState([]);

  const [checkedIn, setCheckedIn] = useState(false);
  const [checkedOut, setCheckedOut] = useState(false);
  const [late, setLate] = useState(false);

  const [checkInTime, setCheckInTime] = useState(null);
  const [checkOutTime, setCheckOutTime] = useState(null);
  const [minutesLateToday, setMinutesLateToday] = useState(0);
  const [penaltyToday, setPenaltyToday] = useState(0);
  const [penaltyStatus, setPenaltyStatus] = useState("");

  const [loading, setLoading] = useState(false);
  const [reviewResult, setReviewResult] = useState(null);
  const [preview, setPreview] = useState(null);

  const today = new Date().toLocaleDateString("en-GB");

  useEffect(() => {
    const storedName = localStorage.getItem("staff_name");

    if (storedName) {
      setName(storedName);
      setSelected(true);
    }

    const att = JSON.parse(localStorage.getItem("staff_attendance") || "[]");
    setAttendance(att);

    const historyData = JSON.parse(localStorage.getItem("history") || "[]");
    setHistory(historyData);
  }, []);

  useEffect(() => {
    if (!name) return;

    const att = JSON.parse(localStorage.getItem("staff_attendance") || "[]");
    setAttendance(att);

    const existing = att.find((a) => a.name === name && a.date === today);

    if (existing) {
      setCheckedIn(true);
      setCheckedOut(!!existing.checkOut);
      setLate(!!existing.late);
      setCheckInTime(existing.checkIn || null);
      setCheckOutTime(existing.checkOut || null);
      setMinutesLateToday(existing.minutesLate || 0);
      setPenaltyToday(existing.penalty || 0);
      setPenaltyStatus(existing.status || "");
    } else {
      setCheckedIn(false);
      setCheckedOut(false);
      setLate(false);
      setCheckInTime(null);
      setCheckOutTime(null);
      setMinutesLateToday(0);
      setPenaltyToday(0);
      setPenaltyStatus("");
    }

    const historyData = JSON.parse(localStorage.getItem("history") || "[]");
    setHistory(historyData);
  }, [name, today]);

  const selectUser = (n) => {
    localStorage.setItem("staff_name", n);
    setName(n);
    setSelected(true);
  };

  const checkIn = () => {
    const now = new Date();
    const hour = now.getHours();
    const minutes = now.getMinutes();

    let isLate = false;
    let penalty = 0;
    let minutesLate = 0;

    if (hour >= 17) {
      isLate = true;
      minutesLate = (hour - 17) * 60 + minutes;
      penalty = Math.floor(minutesLate / 5) * 20;
    }

    const record = {
      id: Date.now(),
      name,
      date: today,
      checkIn: now.toISOString(),
      checkOut: null,
      late: isLate,
      minutesLate,
      penalty,
      status: isLate ? "pending" : "approved",
    };

    const existing = JSON.parse(localStorage.getItem("staff_attendance") || "[]");
    const updated = [record, ...existing];

    localStorage.setItem("staff_attendance", JSON.stringify(updated));
    setAttendance(updated);

    setCheckedIn(true);
    setCheckedOut(false);
    setLate(isLate);
    setCheckInTime(record.checkIn);
    setCheckOutTime(null);
    setMinutesLateToday(minutesLate);
    setPenaltyToday(penalty);
    setPenaltyStatus(record.status);
  };

  const checkOut = () => {
    const now = new Date().toISOString();

    const updated = attendance.map((a) => {
      if (a.name === name && a.date === today && !a.checkOut) {
        return { ...a, checkOut: now };
      }
      return a;
    });

    localStorage.setItem("staff_attendance", JSON.stringify(updated));
    setAttendance(updated);

    setCheckedOut(true);
    setCheckOutTime(now);
  };

  const handleUpload = async (file) => {
    if (!file) return;

    setLoading(true);
    setReviewResult(null);

    const reader = new FileReader();

    reader.onload = async () => {
      const base64 = reader.result;
      setPreview(base64);

      try {
        const res = await fetch("/api/review-ai", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ image: base64 }),
        });

        const data = await res.json();
        setReviewResult(data);
      } catch {
        setReviewResult({ error: "Upload failed" });
      } finally {
        setLoading(false);
      }
    };

    reader.readAsDataURL(file);
  };

  const todayData =
    history.find((d) => d.date === today) ||
    history[history.length - 1] ||
    null;

  const todayStaff =
    todayData?.staff?.find((s) => s.name === name) || {};

  const todaySalary = todayStaff?.payout || 0;
  const serviceCharge = todayData?.serviceCharge || 0;
  const salaryApproved = !!todayStaff?.approved;
  const salaryPaid = !!todayStaff?.paid;

  const totalSalary = history.reduce((sum, d) => {
    const s = d.staff?.find((x) => x.name === name);
    return sum + (s?.payout || 0);
  }, 0);

  const salaryStatus = salaryPaid
    ? "Paid"
    : salaryApproved
    ? "Approved by Manager"
    : todaySalary > 0
    ? "Pending Manager Approval"
    : "No Salary Yet";

  const score = todayStaff?.score || 0;

  const getStars = (value) => {
    if (value >= 90) return 5;
    if (value >= 75) return 4;
    if (value >= 60) return 3;
    if (value >= 40) return 2;
    return 1;
  };

  const stars = getStars(score);

  const workedDuration = useMemo(() => {
    if (!checkInTime || !checkOutTime) return null;

    const start = new Date(checkInTime).getTime();
    const end = new Date(checkOutTime).getTime();
    const diffMs = Math.max(0, end - start);

    const totalMinutes = Math.floor(diffMs / 60000);
    const hours = Math.floor(totalMinutes / 60);
    const mins = totalMinutes % 60;

    return `${hours}h ${mins}m`;
  }, [checkInTime, checkOutTime]);

  const penaltyLabel =
    penaltyStatus === "approved"
      ? "Penalty Approved"
      : penaltyStatus === "rejected"
      ? "Penalty Rejected"
      : penaltyStatus === "pending"
      ? "Penalty Pending"
      : "No Penalty";

  const scrollToSection = (id) => {
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  return (
    <AppShell>
      <div className="space-y-10">
        {!selected ? (
          <>
            <div className="space-y-3">
              <h1 className="text-3xl text-white">Staff Portal</h1>
              <p className="text-white/50">Select your name to enter your dashboard</p>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {["FOH 1", "FOH 2", "BAR", "KITCHEN"].map((n) => (
                <button
                  key={n}
                  onClick={() => selectUser(n)}
                  className="bg-white/5 border border-white/10 hover:bg-white/10 transition rounded-2xl p-5 text-white text-left"
                >
                  <div className="text-lg">{n}</div>
                  <div className="text-white/40 text-sm mt-1">Open dashboard</div>
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            <div className="space-y-3">
              <h1 className="text-3xl text-white">{name}</h1>
              <p className="text-white/50">Staff dashboard and daily tools</p>
            </div>

            <div className="grid md:grid-cols-4 gap-6">
              <MetricCard
                label="Today Payout"
                value={`THB ${Number(todaySalary).toLocaleString()}`}
                accent="text-green-400"
              />
              <MetricCard
                label="Service Charge Pool"
                value={`THB ${Number(serviceCharge).toLocaleString()}`}
                accent="text-[#ff7a00]"
              />
              <MetricCard
                label="Performance Score"
                value={String(score)}
                accent="text-yellow-400"
              />
              <MetricCard
                label="Payroll Status"
                value={salaryStatus}
                accent={
                  salaryPaid
                    ? "text-green-400"
                    : salaryApproved
                    ? "text-blue-400"
                    : "text-yellow-400"
                }
              />
            </div>

            <div className="grid md:grid-cols-2 xl:grid-cols-5 gap-4">
              <Link
                href="/staff/invoices"
                className="bg-white/5 border border-white/10 hover:bg-white/10 transition rounded-2xl p-5 block"
              >
                <div className="text-white text-lg">AI Invoice</div>
                <div className="text-white/40 text-sm mt-1">
                  Upload bill to accounting
                </div>
              </Link>

              <button
                onClick={() => scrollToSection("attendance-section")}
                className="bg-white/5 border border-white/10 hover:bg-white/10 transition rounded-2xl p-5 text-left"
              >
                <div className="text-white text-lg">Attendance</div>
                <div className="text-white/40 text-sm mt-1">
                  Check in and check out
                </div>
              </button>

              <button
                onClick={() => scrollToSection("reviews-section")}
                className="bg-white/5 border border-white/10 hover:bg-white/10 transition rounded-2xl p-5 text-left"
              >
                <div className="text-white text-lg">Google Reviews</div>
                <div className="text-white/40 text-sm mt-1">
                  Upload review screenshot
                </div>
              </button>

              <button
                onClick={() => scrollToSection("performance-section")}
                className="bg-white/5 border border-white/10 hover:bg-white/10 transition rounded-2xl p-5 text-left"
              >
                <div className="text-white text-lg">Performance</div>
                <div className="text-white/40 text-sm mt-1">
                  Score and star level
                </div>
              </button>

              <button
                onClick={() => scrollToSection("payroll-section")}
                className="bg-white/5 border border-white/10 hover:bg-white/10 transition rounded-2xl p-5 text-left"
              >
                <div className="text-white text-lg">Payroll</div>
                <div className="text-white/40 text-sm mt-1">
                  Salary and payout status
                </div>
              </button>
            </div>

            <section
              id="performance-section"
              className="bg-white/5 border border-white/10 p-6 rounded-2xl space-y-3"
            >
              <h2 className="text-white text-xl">Performance</h2>
              <p className="text-white/80">Score: {score}</p>
              <div className="text-yellow-400 text-2xl">
                {"★".repeat(stars)}
                {"☆".repeat(5 - stars)}
              </div>
            </section>

            <section
              id="payroll-section"
              className="bg-white/5 border border-white/10 p-6 rounded-2xl space-y-3"
            >
              <h2 className="text-white text-xl">Payroll</h2>
              <p className="text-white/80">
                Your Payout Today: THB {Number(todaySalary).toLocaleString()}
              </p>
              <p className="text-white/80">
                Total Service Charge Pool: THB {Number(serviceCharge).toLocaleString()}
              </p>
              <p className="text-white/80">
                Total Earned: THB {Number(totalSalary).toLocaleString()}
              </p>
              <p
                className={`text-sm ${
                  salaryPaid
                    ? "text-green-400"
                    : salaryApproved
                    ? "text-blue-400"
                    : "text-yellow-400"
                }`}
              >
                Payroll Status: {salaryStatus}
              </p>
            </section>

            <section
              id="attendance-section"
              className="bg-white/5 border border-white/10 p-6 rounded-2xl space-y-3"
            >
              <h2 className="text-white text-xl">Attendance</h2>

              {!checkedIn && (
                <button
                  onClick={() => confirm("Check In?") && checkIn()}
                  className="bg-green-500 px-4 py-2 rounded w-full"
                >
                  Check In
                </button>
              )}

              {checkedIn && !checkedOut && (
                <button
                  onClick={() => confirm("Check Out?") && checkOut()}
                  className="bg-blue-500 px-4 py-2 rounded w-full"
                >
                  Check Out
                </button>
              )}

              {checkedIn && (
                <p className="text-white/90">
                  {checkedOut ? "✅ Shift Completed" : "🕒 On Shift"}
                </p>
              )}

              {checkInTime && (
                <p className="text-xs text-white/50">
                  Check In: {new Date(checkInTime).toLocaleTimeString()}
                </p>
              )}

              {checkOutTime && (
                <p className="text-xs text-white/50">
                  Check Out: {new Date(checkOutTime).toLocaleTimeString()}
                </p>
              )}

              {workedDuration && (
                <p className="text-xs text-white/50">Worked: {workedDuration}</p>
              )}

              {late && (
                <>
                  <p className="text-xs text-yellow-400">
                    Late By: {minutesLateToday} min
                  </p>
                  <p className="text-xs text-yellow-400">
                    Penalty: THB {penaltyToday}
                  </p>
                  <p
                    className={`text-xs ${
                      penaltyStatus === "approved"
                        ? "text-green-400"
                        : penaltyStatus === "rejected"
                        ? "text-blue-400"
                        : "text-yellow-400"
                    }`}
                  >
                    {penaltyLabel}
                  </p>
                </>
              )}
            </section>

            <section
              id="reviews-section"
              className="bg-white/5 border border-white/10 p-6 rounded-2xl space-y-4"
            >
              <h2 className="text-white text-xl">Google Reviews</h2>

              <label className="inline-flex items-center bg-[#ff7a00] px-4 py-2 rounded text-white cursor-pointer">
                Upload Screenshot
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => handleUpload(e.target.files[0])}
                  className="hidden"
                />
              </label>

              {preview && (
                <img
                  src={preview}
                  alt="Review preview"
                  className="max-h-40 rounded-xl border border-white/10"
                />
              )}

              {loading && <p className="text-white/50">Analyzing...</p>}

              {reviewResult && !reviewResult.error && (
                <div className="bg-black/20 rounded-xl p-4 space-y-1">
                  <p className="text-white/90">Accepted Review</p>
                  <p className="text-yellow-400">
                    {"★".repeat(reviewResult.rating || 0)}
                  </p>
                  <p className="text-white/70 text-sm">
                    Platform: {reviewResult.platform}
                  </p>
                  {typeof reviewResult.confidence !== "undefined" && (
                    <p className="text-white/50 text-xs">
                      Confidence: {reviewResult.confidence}
                    </p>
                  )}
                </div>
              )}

              {reviewResult?.error && (
                <p className="text-red-400 text-sm">{reviewResult.error}</p>
              )}
            </section>
          </>
        )}
      </div>
    </AppShell>
  );
}

function MetricCard({ label, value, accent = "" }) {
  return (
    <div className="bg-white/5 border border-white/10 p-6 rounded-2xl">
      <div className="text-white/40 text-sm">{label}</div>
      <div className={`text-xl mt-1 ${accent}`}>{value}</div>
    </div>
  );
}