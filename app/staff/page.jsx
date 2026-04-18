"use client";

import { useEffect, useState } from "react";
import AppShell from "../AppShell";

export default function StaffPage() {
  const [name, setName] = useState("");
  const [selected, setSelected] = useState(false);

  const [attendance, setAttendance] = useState([]);
  const [history, setHistory] = useState([]);

  const [checkedIn, setCheckedIn] = useState(false);
  const [late, setLate] = useState(false);

  const [loading, setLoading] = useState(false);
  const [reviewResult, setReviewResult] = useState(null);

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

  // 🔥 UPLOAD → AI
  const handleUpload = async (file) => {
    setLoading(true);

    const reader = new FileReader();
    reader.readAsDataURL(file);

    reader.onload = async () => {
      const base64 = reader.result;

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

            {/* 🔥 AI REVIEW UPLOAD */}
            <div className="bg-white/5 p-6 rounded-2xl">
              <h2 className="text-white mb-4">Upload Review</h2>

              <input
                type="file"
                accept="image/*"
                onChange={(e) => handleUpload(e.target.files[0])}
                className="mb-4"
              />

              {loading && (
                <p className="text-white/50">Analyzing review...</p>
              )}

              {reviewResult && !reviewResult.error && (
                <div className="text-white/80 space-y-2">
                  <p>⭐ Rating: {reviewResult.rating}</p>
                  <p>Platform: {reviewResult.platform}</p>
                  <p>Confidence: {reviewResult.confidence}</p>
                  <p className="text-sm">{reviewResult.text}</p>
                </div>
              )}

              {reviewResult?.error && (
                <p className="text-red-400">{reviewResult.error}</p>
              )}
            </div>

            {/* ATTENDANCE */}
            <div className="bg-white/5 p-6 rounded-2xl">
              <h2 className="text-white mb-2">Attendance</h2>

              {!checkedIn ? (
                <button onClick={checkIn} className="bg-green-500 px-4 py-2 rounded">
                  Check In
                </button>
              ) : (
                <p>
                  {late ? "⏳ Late (Pending approval)" : "✅ On Time"}
                </p>
              )}
            </div>

          </>
        )}

      </div>
    </AppShell>
  );
}