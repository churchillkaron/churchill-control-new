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

  const [reviews, setReviews] = useState([]);

  useEffect(() => {
    const storedName = localStorage.getItem("staff_name");
    if (storedName) {
      setName(storedName);
      setSelected(true);
    }

    setAttendance(JSON.parse(localStorage.getItem("staff_attendance") || "[]"));
    setHistory(JSON.parse(localStorage.getItem("history") || "[]"));
    setMessages(JSON.parse(localStorage.getItem("staff_messages") || "[]"));
    setReviews(JSON.parse(localStorage.getItem("reviews") || "[]"));
  }, []);

  const selectUser = (n) => {
    localStorage.setItem("staff_name", n);
    setName(n);
    setSelected(true);
  };

  const today = new Date().toLocaleDateString("en-GB");

  const todayData =
    history.find((d) => d.date === today) ||
    history[history.length - 1] ||
    null;

  const todayStaffData =
    todayData?.staff?.find((s) => s.name === name) || null;

  const todayPayout = todayStaffData?.payout || 0;
  const todayOrders = todayData?.totalOrders || 0;
  const todayServiceCharge = todayData?.serviceCharge || 0;
  const servicePercent = todayData?.servicePercent || 0.05;

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

      if (data.error) {
        setReviewStatus("Rejected: Not a valid review");
        return;
      }

      const review = {
        staff: name,
        rating: data.rating,
        text: data.text,
        platform: data.platform || "Unknown",
        image,
        date: today,
      };

      localStorage.setItem(
        "reviews",
        JSON.stringify([review, ...existing])
      );

      setReviews([review, ...existing]);
      setReviewResult(review);
      setReviewStatus("Review saved");
    } catch {
      setReviewStatus("AI error");
    }
  };

  const myReviewsToday = reviews.filter(
    (r) => r.staff === name && r.date === today
  );

  const reviewCount = myReviewsToday.length;

  const avgRating =
    myReviewsToday.reduce((sum, r) => sum + r.rating, 0) /
    (reviewCount || 1);

  const efficiency =
    todayOrders > 0 ? (reviewCount / todayOrders) * 100 : 0;

  const finalScore =
    efficiency * 0.7 + (avgRating / 5) * 30;

  const targetMet = reviewCount >= 2;

  let reviewMultiplier = 1;
  if (finalScore >= 20) reviewMultiplier = 1.1;
  if (finalScore < 10) reviewMultiplier = 0.9;

  const adjustedPayout = Math.round(todayPayout * reviewMultiplier);

  // 🔥 NEXT LEVEL TARGET
  let nextTarget = "Max level reached";

  if (servicePercent === 0.05) {
    nextTarget = "Reach 15+ score → unlock 6%";
  } else if (servicePercent === 0.06) {
    nextTarget = "Reach 25+ score → unlock 7%";
  }

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
            <div>
              <h1 className="text-3xl text-white">{name}</h1>
              <p className="text-white/50 text-sm">Personal Dashboard</p>
            </div>

            <div className="bg-white/5 p-6 rounded-2xl">
              <h2 className="mb-3 text-white">Today</h2>
              <p>Service Level: {(servicePercent * 100).toFixed(0)}%</p>
              <p>Payout Today: THB {todayPayout}</p>
              <p className="text-orange-400">Adjusted: THB {adjustedPayout}</p>
              <p className="text-xs text-white/50 mt-2">{nextTarget}</p>
            </div>

            <div className="bg-white/5 p-6 rounded-2xl">
              <h2 className="mb-3 text-white">Review Performance</h2>
              <p>Efficiency: {efficiency.toFixed(1)}%</p>
              <p>Rating: ⭐ {avgRating.toFixed(2)}</p>
              <p>Final Score: {finalScore.toFixed(1)}</p>
              <p>Target: {reviewCount}/2 {targetMet ? "✅" : "❌"}</p>
            </div>

            <div className="bg-white/5 p-6 rounded-2xl">
              <h2 className="mb-3 text-white">Salary</h2>
              <p>Service Pool: THB {todayServiceCharge}</p>
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

              {image && <img src={image} className="w-40 mt-2 rounded" alt="preview" />}

              <button
                onClick={runReviewAI}
                className="bg-[#ff7a00] px-4 py-2 rounded mt-3"
              >
                Analyze Review
              </button>

              {reviewStatus && (
                <p className="text-red-400 text-sm mt-2">{reviewStatus}</p>
              )}

              {reviewResult && (
                <div className="mt-3 text-sm">
                  ⭐ {reviewResult.rating} — {reviewResult.text}
                </div>
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