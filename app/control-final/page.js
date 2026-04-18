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

  const [preview, setPreview] = useState(null);
  const [showApproval, setShowApproval] = useState(false);

  useEffect(() => {
    const data = JSON.parse(localStorage.getItem("orders") || "[]");
    setOrders(data);
  }, []);

  useEffect(() => {
    const paid = orders.filter(o => o.status === "PAID");

    const revenue = paid.reduce((sum, o) => sum + (o.total || 0), 0);
    const totalOrders = paid.length;
    const avgOrderValue = totalOrders ? Math.round(revenue / totalOrders) : 0;

    setSummary({ revenue, totalOrders, avgOrderValue });
  }, [orders]);

  const prepareClose = () => {
    const today = new Date().toLocaleDateString("en-GB");

    const reviews = JSON.parse(localStorage.getItem("reviews") || "[]");
    const attendance = JSON.parse(localStorage.getItem("staff_attendance") || "[]");

    const todayReviews = reviews.filter(r => r.date === today);
    const paid = orders.filter(o => o.status === "PAID");

    const revenue = paid.reduce((sum, o) => sum + (o.total || 0), 0);
    const reviewCount = todayReviews.length;

    const avgRating =
      todayReviews.reduce((sum, r) => sum + (r.rating || 0), 0) /
      (reviewCount || 1);

    const efficiency = paid.length ? (reviewCount / paid.length) * 100 : 0;
    const finalScore = efficiency * 0.7 + (avgRating / 5) * 30;

    let percent = 0.05;
    if (finalScore >= 25) percent = 0.07;
    else if (finalScore >= 15) percent = 0.06;

    const service = Math.round(revenue * percent);

    setPreview({
      revenue,
      reviewCount,
      avgRating,
      finalScore,
      percent,
      service
    });

    setShowApproval(true);
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

        <button onClick={prepareClose} className="bg-orange-500 px-6 py-3 rounded">
          Close Day
        </button>

        {showApproval && preview && (
          <div className="bg-black/80 p-6 rounded-xl">

            <p>Reviews: {preview.reviewCount}</p>
            <p>Rating: {preview.avgRating.toFixed(1)}</p>
            <p>Score: {preview.finalScore.toFixed(1)}</p>
            <p>Service %: {(preview.percent * 100).toFixed(0)}%</p>
            <p>Service THB: {preview.service}</p>

          </div>
        )}

      </div>
    </AppShell>
  );
}