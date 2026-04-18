"use client";

import { useEffect, useState } from "react";
import AppShell from "../AppShell";

export default function StaffReviewPage() {
  const [mounted, setMounted] = useState(false);

  const [reviews, setReviews] = useState([]);

  useEffect(() => {
    setMounted(true);

    const stored = JSON.parse(localStorage.getItem("reviews") || "[]");
    setReviews(stored);
  }, []);

  if (!mounted) return null;

  return (
    <AppShell>
      <div className="space-y-10">

        <div>
          <h1 className="text-3xl text-white">
            Review Overview
          </h1>
          <p className="text-white/50 text-sm">
            All uploaded reviews
          </p>
        </div>

        <div className="bg-white/5 p-6 rounded-2xl">

          {reviews.length === 0 && (
            <p className="text-white/40">No reviews yet</p>
          )}

          {reviews.map((r, i) => (
            <div
              key={i}
              className="border-b border-white/10 py-3 space-y-2"
            >
              <div className="text-sm text-white/60">
                {r.staff} • {r.platform} • {r.date}
              </div>

              <div className="text-white">
                ⭐ {r.rating} — {r.text}
              </div>

              {r.image && (
                <img
                  src={r.image}
                  className="w-32 rounded mt-2"
                />
              )}
            </div>
          ))}

        </div>

      </div>
    </AppShell>
  );
}