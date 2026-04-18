"use client";

import { useEffect, useState } from "react";
import AppShell from "../AppShell";

export default function ControlFinal() {
  const [orders, setOrders] = useState([]);
  const [summary, setSummary] = useState({
    revenue: 0,
    totalOrders: 0,
    avgOrderValue: 0,
  });

  const [showApproval, setShowApproval] = useState(false);
  const [pendingData, setPendingData] = useState(null);

  const loadOrders = () => {
    try {
      const data = JSON.parse(localStorage.getItem("orders") || "[]");
      setOrders(data);
    } catch (e) {
      console.error("Error loading orders", e);
    }
  };

  useEffect(() => {
    loadOrders();
    const interval = setInterval(loadOrders, 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const paidOrders = orders.filter((o) => o.status === "PAID");

    const revenue = paidOrders.reduce(
      (sum, order) => sum + (order.total || 0),
      0
    );

    const totalOrders = paidOrders.length;

    const avgOrderValue =
      totalOrders > 0 ? Math.round(revenue / totalOrders) : 0;

    setSummary({
      revenue,
      totalOrders,
      avgOrderValue,
    });
  }, [orders]);

  const prepareClose = () => {
    const paidOrders = orders.filter((o) => o.status === "PAID");

    const revenue = paidOrders.reduce(
      (sum, order) => sum + (order.total || 0),
      0
    );

    const totalOrders = paidOrders.length;

    const avgOrderValue =
      totalOrders > 0 ? Math.round(revenue / totalOrders) : 0;

    // 🔥 REVIEWS
    const reviews =
      JSON.parse(localStorage.getItem("reviews") || "[]");

    const today = new Date().toLocaleDateString("en-GB");

    const todayReviews = reviews.filter((r) => r.date === today);

    const reviewCount = todayReviews.length;

    const avgRating =
      todayReviews.reduce((sum, r) => sum + (r.rating || 0), 0) /
      (reviewCount || 1);

    const efficiency =
      totalOrders > 0 ? (reviewCount / totalOrders) * 100 : 0;

    const finalScore =
      efficiency * 0.7 + (avgRating / 5) * 30;

    // 🔥 SERVICE CHARGE UNLOCK
    let servicePercent = 0.05;
    if (finalScore >= 25) servicePercent = 0.07;
    else if (finalScore >= 15) servicePercent = 0.06;

    const serviceCharge = Math.round(revenue * servicePercent);

    const fohPool = serviceCharge * 0.5;
    const barPool = serviceCharge * 0.3;
    const kitchenPool = serviceCharge * 0.2;

    // 🔥 FOH LEVEL
    let fohScore = "GOOD";
    if (finalScore < 20) fohScore = "WARNING";
    if (finalScore < 10) fohScore = "BAD";

    let fohMultiplier = 1;
    if (fohScore === "WARNING") fohMultiplier = 0.7;
    if (fohScore === "BAD") fohMultiplier = 0.4;

    const adjustedFoh = fohPool * fohMultiplier;

    // 🔥 ONLY APPROVED PENALTIES
    const attendance =
      JSON.parse(localStorage.getItem("staff_attendance") || "[]");

    const getPenalty = (name) => {
      const entry = attendance.find(
        (a) =>
          a.name === name &&
          a.date === today &&
          a.status === "approved"
      );
      return entry ? entry.penalty || 0 : 0;
    };

    const staff = [
      {
        name: "FOH 1",
        payout: Math.max(
          0,
          Math.round(adjustedFoh / 2) - getPenalty("FOH 1")
        ),
      },
      {
        name: "FOH 2",
        payout: Math.max(
          0,
          Math.round(adjustedFoh / 2) - getPenalty("FOH 2")
        ),
      },
      {
        name: "BAR",
        payout: Math.max(
          0,
          Math.round(barPool) - getPenalty("BAR")
        ),
      },
      {
        name: "KITCHEN",
        payout: Math.max(
          0,
          Math.round(kitchenPool) - getPenalty("KITCHEN")
        ),
      },
    ];

    const newDay = {
      date: today,
      revenue,
      serviceCharge,
      servicePercent,
      finalScore,
      efficiency,
      avgRating,
      totalOrders,
      avgOrderValue,
      fohScore,
      staff,
    };

    setPendingData(newDay);
    setShowApproval(true);
  };

  const approveClose = () => {
    const history =
      JSON.parse(localStorage.getItem("history") || "[]");

    const updatedHistory = [...history, pendingData];

    localStorage.setItem("history", JSON.stringify(updatedHistory));
    localStorage.removeItem("orders");

    setShowApproval(false);
    alert("Day approved and saved");

    window.location.reload();
  };

  return (
    <AppShell>
      <div className="space-y-10">

        <h1 className="text-4xl text-white">Control Final</h1>

        <div className="grid grid-cols-3 gap-6">
          <div>Revenue: THB {summary.revenue}</div>
          <div>Orders: {summary.totalOrders}</div>
          <div>Avg: THB {summary.avgOrderValue}</div>
        </div>

        <button
          onClick={prepareClose}
          className="bg-[#ff7a00] px-6 py-3 rounded-xl"
        >
          Close Day
        </button>

        {showApproval && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center">
            <div className="bg-black p-6 rounded-xl space-y-4">

              <h2>Approve Day</h2>

              <p>Revenue: {pendingData.revenue}</p>
              <p>Service %: {(pendingData.servicePercent * 100)}%</p>
              <p>Final Score: {pendingData.finalScore.toFixed(1)}</p>

              {pendingData.staff.map((s, i) => (
                <div key={i} className="flex justify-between">
                  <span>{s.name}</span>
                  <span>{s.payout}</span>
                </div>
              ))}

              <button
                onClick={approveClose}
                className="bg-[#ff7a00] w-full py-2"
              >
                Approve
              </button>

            </div>
          </div>
        )}

      </div>
    </AppShell>
  );
}