"use client";

import { useEffect, useState } from "react";
import AppShell from "../AppShell";

export default function StaffPage() {
  const [name, setName] = useState("");
  const [selected, setSelected] = useState(false);

  const [attendance, setAttendance] = useState([]);
  const [history, setHistory] = useState([]);
  const [messages, setMessages] = useState([]);
  const [confirmed, setConfirmed] = useState(false);

  const [image, setImage] = useState(null);
  const [reviewStatus, setReviewStatus] = useState("");
  const [reviewResult, setReviewResult] = useState(null);

  useEffect(() => {
    const storedName = localStorage.getItem("staff_name");
    if (storedName) {
      setName(storedName);
      setSelected(true);
    }

    setAttendance(JSON.parse(localStorage.getItem("staff_attendance") || "[]"));
    setHistory(JSON.parse(localStorage.getItem("history") || "[]"));
    setMessages(JSON.parse(localStorage.getItem("staff_messages") || "[]"));
  }, []);

  const selectUser = (n) => {
    localStorage.setItem("staff_name", n);
    setName(n);
    setSelected(true);
  };

  const today = new Date().toLocaleDateString("en-GB");

  const todayAttendance = attendance.find(
    (a) => a.name === name && a.date === today
  );

  const todayPayout =
    history[history.length - 1]?.staff?.find(
      (s) => s.name === name
    )?.payout || 0;

  const totalSalary = history.reduce((sum, d) => {
    const s = d.staff?.find((x) => x.name === name);
    return sum + (s?.payout || 0);
  }, 0);

  const myMessages = messages.filter((m) => m.name === name);

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

  const handleUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();

    reader.onloadend = () => {
      setImage(reader.result);
      setReviewResult(null);
      setReviewStatus("");
    };

    reader.readAsDataURL(file);
  };

  const runReviewAI = async () => {
    if (!image) return alert("Upload screenshot first");

    const existing = JSON.parse(localStorage.getItem("reviews") || "[]");

    const todayCount = existing.filter(
      (r) => r.staff === name && r.date === today
    ).length;

    if (todayCount >= 3) {
      alert("Max 3 reviews per day");
      return;
    }

    try {
      setReviewStatus("Analyzing review...");

      const res = await fetch("/api/review-ai", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ image }),
      });

      const data = await res.json();

      if (!data.rating || data.rating < 1 || data.rating > 5) {
        setReviewStatus("Invalid rating");
        return;
      }

      if (!data.text || data.text.length < 10) {
        setReviewStatus("Review too short");
        return;
      }

      const review = {
        staff: name,
        rating: data.rating,
        text: data.text,
        platform: data.platform || "Unknown",
        date: today,
      };

      localStorage.setItem(
        "reviews",
        JSON.stringify([review, ...existing])
      );

      setReviewResult(review);
      setReviewStatus("Review saved");
    } catch {
      setReviewStatus("AI error");
    }
  };

  return (
    <AppShell>
      <div className="space-y-10">

        {!selected ? (
          <>
            <h1 className="text-2xl text-white">Select Your Name</h1>

            <div className="flex gap-4 flex-wrap">
              {["FOH 1", "FOH 2", "BAR", "KITCHEN"].map((n) => (
                <button
                  key={n}
                  onClick={() => selectUser(n)}
                  className="bg-[#ff7a00] px-4 py-2 rounded"
                >
                  {n}
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            <div>
              <h1 className="text-3xl text-white">{name}</h1>
              <p className="text-white/50 text-sm">Personal Dashboard</p>
            </div>

            <div className="bg-white/5 p-6 rounded-2xl">
              <h2 className="mb-3 text-white">Today</h2>
              <p>Status: {todayAttendance ? (todayAttendance.late ? "Late" : "On Time") : "Not Checked In"}</p>
              <p>Penalty: THB {todayAttendance?.penalty || 0}</p>
              <p>Payout Today: THB {todayPayout}</p>
            </div>

            <div className="bg-white/5 p-6 rounded-2xl">
              <h2 className="mb-3 text-white">Salary</h2>
              <p>Total Earned: THB {totalSalary}</p>

              {!confirmed ? (
                <button onClick={confirmSalary} className="bg-green-500 px-4 py-2 rounded mt-3">
                  Confirm Salary
                </button>
              ) : (
                <p className="text-green-400 mt-2">Salary Confirmed</p>
              )}
            </div>

            <div className="bg-white/5 p-6 rounded-2xl">
              <h2 className="mb-3 text-white">Upload Review</h2>

              <input type="file" onChange={handleUpload} />

              {image && <img src={image} className="w-40 mt-2 rounded" />}

              <button
                onClick={runReviewAI}
                className="bg-[#ff7a00] px-4 py-2 rounded mt-3"
              >
                Analyze Review
              </button>

              {reviewStatus && (
                <p className="text-white/50 text-sm mt-2">{reviewStatus}</p>
              )}

              {reviewResult && (
                <div className="mt-3 text-sm">
                  ⭐ {reviewResult.rating} — {reviewResult.text}
                </div>
              )}
            </div>

            <div className="bg-white/5 p-6 rounded-2xl">
              <h2 className="mb-3 text-white">Messages</h2>

              {myMessages.length === 0 && (
                <p className="text-white/40">No messages</p>
              )}

              {myMessages.map((m, i) => (
                <div key={i} className="border-b border-white/10 py-2 text-sm">
                  {m.text}
                </div>
              ))}
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