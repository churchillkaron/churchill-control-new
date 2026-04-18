"use client";

import { useEffect, useState } from "react";
import AppShell from "../AppShell";

export default function StaffPage() {
  const [name, setName] = useState("");
  const [selected, setSelected] = useState(false);

  const [attendance, setAttendance] = useState([]);
  const [history, setHistory] = useState([]);
  const [confirmed, setConfirmed] = useState(false);

  const [checkedIn, setCheckedIn] = useState(false);
  const [late, setLate] = useState(false);

  const [googleReviews, setGoogleReviews] = useState(0);
  const [tripReviews, setTripReviews] = useState(0);

  useEffect(() => {
    const storedName = localStorage.getItem("staff_name");
    if (storedName) {
      setName(storedName);
      setSelected(true);
    }

    const att = JSON.parse(localStorage.getItem("staff_attendance") || "[]");
    setAttendance(att);

    const today = new Date().toLocaleDateString("en-GB");
    const existing = att.find((a) => a.name === storedName && a.date === today);

    if (existing) {
      setCheckedIn(true);
      setLate(existing.late);
    }

    setHistory(JSON.parse(localStorage.getItem("history") || "[]"));

    const reviews = JSON.parse(localStorage.getItem("reviews") || "{}");
    setGoogleReviews(reviews.google || 0);
    setTripReviews(reviews.tripadvisor || 0);
  }, []);

  const selectUser = (n) => {
    localStorage.setItem("staff_name", n);
    setName(n);
    setSelected(true);
  };

  const today = new Date().toLocaleDateString("en-GB");

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
      late: isLate,
      minutesLate,
      penalty,
      status: isLate ? "pending" : "approved"
    };

    const existing = JSON.parse(localStorage.getItem("staff_attendance") || "[]");

    localStorage.setItem(
      "staff_attendance",
      JSON.stringify([record, ...existing])
    );

    setCheckedIn(true);
    setLate(isLate);
  };

  const todayData =
    history.find((d) => d.date === today) ||
    history[history.length - 1] ||
    null;

  const todayStaff =
    todayData?.staff?.find((s) => s.name === name) || {};

  const totalSalary = history.reduce((sum, d) => {
    const s = d.staff?.find((x) => x.name === name);
    return sum + (s?.payout || 0);
  }, 0);

  const confirmSalary = () => {
    const record = {
      name,
      date: today,
      confirmed: true,
    };

    const existing = JSON.parse(localStorage.getItem("salary_confirmations") || "[]");

    localStorage.setItem(
      "salary_confirmations",
      JSON.stringify([record, ...existing])
    );

    setConfirmed(true);
  };

  // SCORE
  const score = todayStaff?.score || 0;

  const getStars = (score) => {
    if (score >= 90) return 5;
    if (score >= 75) return 4;
    if (score >= 60) return 3;
    if (score >= 40) return 2;
    return 1;
  };

  const stars = getStars(score);

  // REVIEWS SAVE
  const saveReviews = () => {
    const data = {
      google: googleReviews,
      tripadvisor: tripReviews
    };

    localStorage.setItem("reviews", JSON.stringify(data));
  };

  return (
    <AppShell>
      <div className="space-y-10">

        {!selected ? (
          <>
            <h1 className="text-2xl text-white">Select Your Name</h1>
            <div className="flex gap-4 flex-wrap">
              {["FOH 1", "FOH 2", "BAR", "KITCHEN"].map((n) => (
                <button key={n} onClick={() => selectUser(n)} className="bg-[#ff7a00] px-4 py-2 rounded">
                  {n}
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            <h1 className="text-3xl text-white">{name}</h1>

            {/* SCORE */}
            <div className="bg-white/5 p-6 rounded-2xl">
              <h2 className="text-white mb-2">Performance</h2>
              <p>Score: {score}</p>
              <div className="text-yellow-400 text-xl">
                {"★".repeat(stars)}{"☆".repeat(5 - stars)}
              </div>
            </div>

            {/* REVIEWS */}
            <div className="bg-white/5 p-6 rounded-2xl">
              <h2 className="text-white mb-2">Reviews</h2>

              <div className="flex gap-4">
                <input
                  type="number"
                  value={googleReviews}
                  onChange={(e) => setGoogleReviews(Number(e.target.value))}
                  placeholder="Google Reviews"
                  className="bg-black/30 p-2 rounded w-full"
                />

                <input
                  type="number"
                  value={tripReviews}
                  onChange={(e) => setTripReviews(Number(e.target.value))}
                  placeholder="TripAdvisor"
                  className="bg-black/30 p-2 rounded w-full"
                />
              </div>

              <button
                onClick={saveReviews}
                className="bg-[#ff7a00] px-4 py-2 rounded mt-3"
              >
                Save Reviews
              </button>
            </div>

            {/* CHECK-IN */}
            <div className="bg-white/5 p-6 rounded-2xl">
              <h2 className="text-white mb-2">Attendance</h2>

              {!checkedIn ? (
                <button
                  onClick={checkIn}
                  className="bg-green-500 px-4 py-2 rounded"
                >
                  Check In
                </button>
              ) : (
                <p>
                  {late ? "⏳ Late (Pending approval)" : "✅ On Time"}
                </p>
              )}
            </div>

            {/* SALARY */}
            <div className="bg-white/5 p-6 rounded-2xl">
              <h2 className="text-white mb-2">Salary</h2>
              <p>Today: THB {todayStaff.payout || 0}</p>
              <p>Total: THB {totalSalary}</p>

              {!confirmed ? (
                <button onClick={confirmSalary} className="bg-green-500 px-4 py-2 rounded mt-2">
                  Confirm Salary
                </button>
              ) : (
                <p className="text-green-400 mt-2">Confirmed</p>
              )}
            </div>

            <button
              onClick={() => {
                localStorage.removeItem("staff_name");
                location.reload();
              }}
              className="text-xs text-white/40"
            >
              Switch User
            </button>
          </>
        )}

      </div>
    </AppShell>
  );
}