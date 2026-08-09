"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  RefreshCw,
  Send,
  Sparkles,
} from "lucide-react";

const STATUS_STYLES = {
  PUBLISHED: "border-emerald-400/20 bg-emerald-400/10 text-emerald-200",
  PENDING_APPROVAL: "border-amber-400/20 bg-amber-400/10 text-amber-200",
  ESCALATED: "border-red-400/20 bg-red-400/10 text-red-200",
  FAILED: "border-red-400/20 bg-red-400/10 text-red-200",
  PROCESSING: "border-blue-400/20 bg-blue-400/10 text-blue-200",
  PUBLISHING: "border-blue-400/20 bg-blue-400/10 text-blue-200",
  NEEDS_REVIEW: "border-white/10 bg-white/5 text-white/60",
};

function statusLabel(status) {
  return String(status || "NEEDS_REVIEW").replaceAll("_", " ");
}

function Stars({ rating }) {
  const rounded = Math.round(Number(rating || 0));
  return (
    <span aria-label={`${rounded} out of 5 stars`} className="text-[#E6C18C]">
      {Array.from({ length: 5 }, (_, index) =>
        index < rounded ? "★" : "☆"
      ).join("")}
    </span>
  );
}

export default function ReviewFeed({
  organizationId,
  platform = "GOOGLE",
  limit = 100,
}) {
  const [reviews, setReviews] = useState([]);
  const [drafts, setDrafts] = useState({});
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [publishingId, setPublishingId] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [canApprove, setCanApprove] = useState(false);
  const [googleConnected, setGoogleConnected] = useState(false);
  const [policy, setPolicy] = useState(null);

  const loadReviews = useCallback(async () => {
    if (!organizationId) return;
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/reviews/list", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId, platform, limit }),
        cache: "no-store",
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || "Unable to load reviews");
      }

      setReviews(data.reviews || []);
      setCanApprove(Boolean(data.canApprove));
      setGoogleConnected(Boolean(data.googleConnected));
      setPolicy(data.policy || null);
      setDrafts(
        Object.fromEntries(
          (data.reviews || []).map((review) => [
            review.id,
            review.response_text || "",
          ])
        )
      );
    } catch (loadError) {
      setReviews([]);
      setError(loadError?.message || "Unable to load reviews");
    } finally {
      setLoading(false);
    }
  }, [organizationId, platform, limit]);

  useEffect(() => {
    loadReviews();
  }, [loadReviews]);

  async function syncReviews() {
    setSyncing(true);
    setError("");
    setNotice("");

    try {
      const response = await fetch("/api/reviews/sync-google", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || "Google review sync failed");
      }

      const published = (data.processed || []).filter(
        (item) => item.published
      ).length;
      setNotice(
        `Synced ${data.synced || 0} reviews${published ? ` and published ${published} replies` : ""}${data.backfillRemaining ? `; ${data.backfillRemaining} historical reviews remain in the processing queue` : ""}.`
      );
      await loadReviews();
    } catch (syncError) {
      setError(syncError?.message || "Google review sync failed");
    } finally {
      setSyncing(false);
    }
  }

  async function approveReview(reviewId) {
    setPublishingId(reviewId);
    setError("");
    setNotice("");

    try {
      const response = await fetch(`/api/reviews/${reviewId}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId,
          responseText: drafts[reviewId] || "",
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || "Unable to publish response");
      }

      setNotice("The approved response is now published on Google.");
      await loadReviews();
    } catch (publishError) {
      setError(publishError?.message || "Unable to publish response");
    } finally {
      setPublishingId(null);
    }
  }

  const stats = useMemo(() => {
    return reviews.reduce(
      (summary, review) => {
        summary.total += 1;
        if (review.response_status === "PUBLISHED") summary.published += 1;
        if (review.response_status === "PENDING_APPROVAL") summary.approval += 1;
        if (review.recovery_case) summary.escalated += 1;
        return summary;
      },
      { total: 0, published: 0, approval: 0, escalated: 0 }
    );
  }, [reviews]);

  return (
    <div className="space-y-6">
      <section className="rounded-[28px] border border-white/10 bg-white/[0.03] p-6">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div>
            <div className="flex items-center gap-2 text-sm text-[#E6C18C]">
              <Sparkles className="h-4 w-4" />
              Google response automation
            </div>
            <h2 className="mt-2 text-2xl font-light text-white">
              {googleConnected ? "Connected and monitored" : "Connection required"}
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-white/45">
              4–5 star reviews publish automatically. Ratings from 1–3 stars
              always wait for manager approval. Ratings from 1–2 stars also
              open a critical recovery case.
            </p>
          </div>

          {googleConnected ? (
            <button
              type="button"
              onClick={syncReviews}
              disabled={syncing}
              className="flex items-center gap-2 rounded-2xl bg-[#D6A66A] px-5 py-3 text-sm font-semibold text-black transition disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
              {syncing ? "Syncing…" : "Sync now"}
            </button>
          ) : (
            <a
              href={`/api/google/auth?organizationId=${encodeURIComponent(organizationId)}`}
              className="rounded-2xl bg-[#D6A66A] px-5 py-3 text-sm font-semibold text-black"
            >
              Connect Google Business Profile
            </a>
          )}
        </div>

        {policy && (
          <div className="mt-5 text-xs text-white/35">
            Active policy: {policy.brand_name} · full history {policy.backfill_completed_at ? "processed" : "will be processed on first sync"} · new reviews checked every minute
          </div>
        )}
      </section>

      {(error || notice) && (
        <div
          className={`rounded-2xl border px-4 py-3 text-sm ${
            error
              ? "border-red-400/20 bg-red-400/10 text-red-100"
              : "border-emerald-400/20 bg-emerald-400/10 text-emerald-100"
          }`}
        >
          {error || notice}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["Reviews", stats.total],
          ["Published", stats.published],
          ["Awaiting approval", stats.approval],
          ["Recovery cases", stats.escalated],
        ].map(([label, value]) => (
          <div key={label} className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
            <div className="text-xs uppercase tracking-[0.18em] text-white/30">{label}</div>
            <div className="mt-2 text-3xl font-light text-white">{value}</div>
          </div>
        ))}
      </div>

      {loading ? (
        <div className="rounded-3xl border border-white/10 p-8 text-white/50">
          Loading reviews…
        </div>
      ) : !reviews.length ? (
        <div className="rounded-3xl border border-white/10 p-8 text-white/50">
          No Google reviews have been synced yet.
        </div>
      ) : (
        <div className="space-y-4">
          {reviews.map((review) => {
            const status = review.response_status || "NEEDS_REVIEW";
            const requiresDecision = [
              "PENDING_APPROVAL",
              "ESCALATED",
              "FAILED",
            ].includes(status);

            return (
              <article
                key={review.id}
                className="rounded-[28px] border border-white/10 bg-white/[0.03] p-6"
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="font-medium text-white">
                      {review.author_name || "Google guest"}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-white/35">
                      <Stars rating={review.rating} />
                      <span>
                        {review.review_time
                          ? new Date(review.review_time).toLocaleString()
                          : "Date unavailable"}
                      </span>
                    </div>
                  </div>

                  <div
                    className={`rounded-full border px-3 py-1 text-xs uppercase tracking-[0.12em] ${
                      STATUS_STYLES[status] || STATUS_STYLES.NEEDS_REVIEW
                    }`}
                  >
                    {statusLabel(status)}
                  </div>
                </div>

                <p className="mt-5 whitespace-pre-wrap text-sm leading-6 text-white/70">
                  {review.review_text || "The guest left a rating without written comments."}
                </p>

                {review.response_text && (
                  <div className="mt-5 rounded-2xl border border-[#D6A66A]/15 bg-[#D6A66A]/[0.05] p-4">
                    <div className="mb-2 flex items-center gap-2 text-xs uppercase tracking-[0.14em] text-[#D6A66A]">
                      {status === "PUBLISHED" ? (
                        <CheckCircle2 className="h-4 w-4" />
                      ) : (
                        <Clock3 className="h-4 w-4" />
                      )}
                      {status === "PUBLISHED" ? "Published reply" : "Suggested reply"}
                    </div>

                    {requiresDecision && canApprove ? (
                      <textarea
                        value={drafts[review.id] || ""}
                        maxLength={policy?.max_reply_length || 900}
                        onChange={(event) =>
                          setDrafts((current) => ({
                            ...current,
                            [review.id]: event.target.value,
                          }))
                        }
                        rows={4}
                        className="w-full resize-y rounded-xl border border-white/10 bg-black/30 p-3 text-sm leading-6 text-white outline-none focus:border-[#D6A66A]/40"
                      />
                    ) : (
                      <p className="whitespace-pre-wrap text-sm leading-6 text-white/65">
                        {review.response_text}
                      </p>
                    )}
                  </div>
                )}

                {review.recovery_case && (
                  <div className="mt-4 flex gap-3 rounded-2xl border border-red-400/20 bg-red-400/10 p-4 text-sm text-red-100">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    <div>
                      <div className="font-medium">Critical recovery case open</div>
                      <div className="mt-1 text-red-100/65">
                        Management follow-up is required before publishing a public response.
                      </div>
                    </div>
                  </div>
                )}

                {requiresDecision && canApprove && review.response_text && (
                  <div className="mt-4 flex justify-end">
                    <button
                      type="button"
                      onClick={() => approveReview(review.id)}
                      disabled={publishingId === review.id || !drafts[review.id]?.trim()}
                      className="flex items-center gap-2 rounded-xl bg-white px-4 py-2 text-sm font-semibold text-black disabled:opacity-40"
                    >
                      <Send className="h-4 w-4" />
                      {publishingId === review.id
                        ? "Publishing…"
                        : "Approve and publish"}
                    </button>
                  </div>
                )}

                {review.last_response_error && (
                  <div className="mt-3 text-xs text-red-300/70">
                    {review.last_response_error}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
