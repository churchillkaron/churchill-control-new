"use client";

import { useEffect, useState } from "react";

export default function ReviewFeed({ tenantId, platform = "ALL", limit = 20 }) {
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);

  async function loadReviews() {
    if (!tenantId) return;

    setLoading(true);

    try {
      const res = await fetch("/api/reviews/list", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId, platform, limit }),
      });

      const data = await res.json();
      setReviews(data.reviews || []);
    } catch (error) {
      console.error(error);
      setReviews([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadReviews();
  }, [tenantId, platform, limit]);

  if (loading) {
    return <div className="text-white/50">Loading reviews...</div>;
  }

  if (!reviews.length) {
    return <div className="text-white/50">No reviews yet.</div>;
  }

  return (
    <div className="space-y-3">
      {reviews.map((review) => (
        <div
          key={review.id}
          className="rounded-2xl border border-white/10 bg-white/[0.03] p-4"
        >
          <div className="mb-2 flex items-center justify-between gap-3">
            <div>
              <div className="font-semibold text-white">
                {review.author_name || "Guest"}
              </div>
              <div className="text-xs uppercase tracking-[0.2em] text-white/40">
                {review.platform}
              </div>
            </div>

            <div className="rounded-full border border-yellow-400/20 bg-yellow-400/10 px-3 py-1 text-sm text-yellow-200">
              ★ {Number(review.rating || 0).toFixed(1)}
            </div>
          </div>

          <div className="text-sm leading-6 text-white/70">
            {review.review_text || "No review text."}
          </div>

          <div className="mt-3 text-xs text-white/35">
            {review.review_time
              ? new Date(review.review_time).toLocaleString()
              : "No date"}
          </div>
        </div>
      ))}
    </div>
  );
}
