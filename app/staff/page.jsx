"use client";

import { useEffect, useState } from "react";
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

  const [loading, setLoading] = useState(false);
  const [reviewResult, setReviewResult] = useState(null);
  const [preview, setPreview] = useState(null);

  const today = new Date().toLocaleDateString("en-GB");

  // LOAD BASE DATA
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

  // 🔥 FIXED ATTENDANCE LOGIC (runs AFTER name is set)
  useEffect(() => {
    if (!name) return;

    const att = JSON.parse(localStorage.getItem("staff_attendance") || "[]");

    const existing = att.find((a) => a.name === name && a.date === today);

    if (existing) {
      setCheckedIn(true);
      setCheckedOut(!!existing.checkOut);
      setLate(existing.late);
      setCheckInTime(existing.checkIn);
      setCheckOutTime(existing.checkOut);
    } else {
      setCheckedIn(false);
      setCheckedOut(false);
      setLate(false);
      setCheckInTime(null);
      setCheckOutTime(null);
    }
  }, [name]);

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
      status: isLate ? "pending" : "approved"
    };

    const existing = JSON.parse(localStorage.getItem("staff_attendance") || "[]");

    localStorage.setItem("staff_attendance", JSON.stringify([record, ...existing]));

    setCheckedIn(true);
    setCheckInTime(record.checkIn);
    setLate(isLate);
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

      const res = await fetch("/api/review-ai", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ image: base64 }),
      });

      const data = await res.json();
      setReviewResult(data);
      setLoading(false);
    };

    reader.readAsDataURL(file);
  };

  const todayData =
    history.find((d) => d.date === today) ||
    history[history.length - 1] ||
    null;

  const todayStaff =
    todayData?.staff?.find((s) => s.name === name) || {};

  const score = todayStaff?.score || 0;

  const getStars = (score) => {
    if (score >= 90) return 5;
    if (score >= 75) return 4;
    if (score >= 60) return 3;
    if (score >= 40) return 2;
    return 1;
  };

  const stars = getStars(score);

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

            {/* PERFORMANCE */}
            <div className="bg-white/5 p-6 rounded-2xl">
              <h2 className="text-white mb-2">Performance</h2>
              <p>Score: {score}</p>
              <div className="text-yellow-400 text-xl">
                {"★".repeat(stars)}{"☆".repeat(5 - stars)}
              </div>
            </div>

            {/* ATTENDANCE */}
            <div className="bg-white/5 p-6 rounded-2xl space-y-3">
              <h2 className="text-white mb-2">Attendance</h2>

              {!checkedIn && (
                <button onClick={() => confirm("Check In?") && checkIn()} className="bg-green-500 px-4 py-2 rounded w-full">
                  Check In
                </button>
              )}

              {checkedIn && !checkedOut && (
                <button onClick={() => confirm("Check Out?") && checkOut()} className="bg-blue-500 px-4 py-2 rounded w-full">
                  Check Out
                </button>
              )}

              {checkedIn && (
                <p>{checkedOut ? "✅ Shift Completed" : "🕒 On Shift"}</p>
              )}

              {checkInTime && <p className="text-xs">In: {new Date(checkInTime).toLocaleTimeString()}</p>}
              {checkOutTime && <p className="text-xs">Out: {new Date(checkOutTime).toLocaleTimeString()}</p>}
            </div>

            {/* REVIEW */}
            <div className="bg-white/5 p-6 rounded-2xl space-y-4">
              <h2 className="text-white">Upload Review</h2>
              <input type="file" accept="image/*" onChange={(e) => handleUpload(e.target.files[0])} />

              {preview && <img src={preview} className="rounded-xl max-h-60" />}
              {loading && <p>Analyzing...</p>}
              {reviewResult && <p>⭐ {reviewResult.rating}</p>}
            </div>

          </>
        )}

      </div>
    </AppShell>
  );
}