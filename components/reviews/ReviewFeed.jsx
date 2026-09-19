"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  RefreshCw,
  Send,
  Settings2,
  Sparkles,
} from "lucide-react";

const STATUS_STYLES = {
  PUBLISHED: "border-emerald-300/55 bg-emerald-100/75 text-emerald-800",
  PENDING_APPROVAL: "border-amber-300/55 bg-amber-100/75 text-amber-800",
  ESCALATED: "border-red-300/55 bg-red-100/75 text-red-700",
  FAILED: "border-red-300/55 bg-red-100/75 text-red-700",
  PROCESSING: "border-sky-300/55 bg-sky-100/75 text-sky-700",
  PUBLISHING: "border-sky-300/55 bg-sky-100/75 text-sky-700",
  NEEDS_REVIEW: "border-[#8c6b42]/15 bg-white/45 text-[#755f48]",
};

function statusLabel(status) {
  return String(status || "NEEDS_REVIEW").replaceAll("_", " ");
}

function Stars({ rating }) {
  const rounded = Math.round(Number(rating || 0));
  return (
    <span aria-label={`${rounded} out of 5 stars`} className="text-[#df981f]">
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
  const [googleConnection, setGoogleConnection] = useState(null);
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
      setGoogleConnection(data.googleConnection || null);
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

      if (data.skipped) {
        setNotice(
          data.message ||
            "Google review synchronization is waiting for Business Profile API access."
        );
        await loadReviews();
        return;
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

  const discoveryStatus = String(
    googleConnection?.metadata?.location_discovery_status || ""
  ).toUpperCase();
  const googleLocationReady = discoveryStatus === "READY";
  const googleApiAccessPending =
    googleConnected && discoveryStatus === "API_ACCESS_PENDING";
  const googleAccessPending = googleConnected && !googleLocationReady;
  const googleRateLimited =
    googleConnected && discoveryStatus === "RATE_LIMITED";
  const integrationUrl = `/workspace/${encodeURIComponent(organizationId)}/administration/integrations#google-business`;
  const autoPublishMin = Number(policy?.auto_publish_min_rating || 4);
  const criticalMax = Number(policy?.critical_max_rating || 2);

  return (
    <div className="space-y-6">
      <section className="rounded-[30px] border border-white/60 bg-[linear-gradient(135deg,rgba(255,252,247,0.96),rgba(239,224,203,0.92))] p-6 shadow-[0_26px_80px_rgba(0,0,0,0.32),inset_0_1px_0_rgba(255,255,255,0.95)] backdrop-blur-3xl">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div>
            <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.18em] text-[#a67943]">
              <Sparkles className="h-4 w-4" />
              Google response automation
            </div>
            <h2 className="mt-2 text-[28px] font-semibold tracking-[-0.04em] text-[#21170f]">
              {googleApiAccessPending
                ? "Google connected — Business Profile API approval pending"
                : googleRateLimited
                  ? "Google connected — location discovery cooling down"
                  : googleAccessPending
                    ? "Google connected — location setup pending"
                    : googleConnected
                      ? "Connected and monitored"
                      : "Google setup required"}
            </h2>
            <p className="mt-2 max-w-3xl text-[12px] leading-6 text-[#7c6853]">
              {googleApiAccessPending
                ? "The Google authorization is active and safe. Avantiqo is waiting for Google to enable Business Profile API access for the platform Cloud project. Automatic discovery is paused, and reconnecting Google is not required."
                : googleRateLimited
                  ? "The Google authorization remains active. Location discovery was temporarily rate-limited by Google; finish setup from Administration → Integrations when the cooldown ends."
                  : googleAccessPending
                    ? "The Google authorization is active, but Business Profile locations still need to be discovered and mapped to the correct Avantiqo entity in Administration → Integrations."
                    : googleConnected
                      ? `Reviews rated ${autoPublishMin}–5 can publish automatically under the active organization policy. Lower ratings wait for approval, and ratings up to ${criticalMax} open a recovery case.`
                      : "Connect Google Business Profile from Administration → Integrations before review monitoring can begin."}
            </p>
          </div>

          {googleConnected && googleLocationReady ? (
            <button
              type="button"
              onClick={syncReviews}
              disabled={syncing}
              className="flex items-center gap-2 rounded-2xl border border-[#a9773e]/25 bg-[linear-gradient(180deg,#d7b17f,#ae7a40)] px-5 py-3 text-[11px] font-semibold text-white shadow-[0_8px_18px_rgba(128,87,40,0.20)] transition disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
              {syncing ? "Checking…" : "Sync now"}
            </button>
          ) : (
            <a
              href={integrationUrl}
              className="flex items-center gap-2 rounded-2xl border border-[#a9773e]/25 bg-[linear-gradient(180deg,#d7b17f,#ae7a40)] px-5 py-3 text-[11px] font-semibold text-white shadow-[0_8px_18px_rgba(128,87,40,0.20)]"
            >
              <Settings2 className="h-4 w-4" />
              {googleApiAccessPending ? "Check Google access" : "Open Google setup"}
            </a>
          )}
        </div>

        {policy && (
          <div className="mt-5 text-[10px] text-[#8b755f]">
            Active policy: {policy.brand_name} · full history {policy.backfill_completed_at ? "processed" : "will be processed on first successful sync"} · ready connections checked automatically
          </div>
        )}
      </section>

      {(error || notice) && (
        <div
          className={`rounded-2xl border px-4 py-3 text-sm ${
            error
              ? "border-red-300/50 bg-red-50/90 text-red-700"
              : "border-emerald-300/50 bg-emerald-50/90 text-emerald-700"
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
          <div key={label} className="rounded-2xl border border-white/60 bg-[linear-gradient(145deg,rgba(255,252,247,0.93),rgba(238,224,204,0.86))] p-5 shadow-[0_12px_30px_rgba(0,0,0,0.16)]">
            <div className="text-[9px] uppercase tracking-[0.18em] text-[#8f7962]">{label}</div>
            <div className="mt-2 text-[30px] font-semibold tracking-[-0.04em] text-[#21170f]">{value}</div>
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
                className="rounded-[28px] border border-white/60 bg-[linear-gradient(145deg,rgba(255,252,247,0.94),rgba(239,225,205,0.88))] p-6 shadow-[0_18px_42px_rgba(0,0,0,0.18),inset_0_1px_0_rgba(255,255,255,0.9)]"
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/70 bg-white/90 p-2 shadow-sm">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src="/icons/google.png" alt="Google" className="h-full w-full object-contain" />
                    </div>
                    <div>
                    <div className="font-semibold text-[#2a1e15]">
                      {review.author_name || "Google guest"}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-3 text-[10px] text-[#8c7863]">
                      <Stars rating={review.rating} />
                      <span>
                        {review.review_time
                          ? new Date(review.review_time).toLocaleString()
                          : "Date unavailable"}
                      </span>
                    </div>
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

                <p className="mt-5 whitespace-pre-wrap text-[12px] leading-6 text-[#5f4e3d]">
                  {review.review_text || "The guest left a rating without written comments."}
                </p>

                {review.response_text && (
                  <div className="mt-5 rounded-2xl border border-[#c7985d]/18 bg-[#f2dfc3]/58 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.65)]">
                    <div className="mb-2 flex items-center gap-2 text-[9px] uppercase tracking-[0.14em] text-[#9e713d]">
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
                        className="w-full resize-y rounded-xl border border-[#8c6b42]/14 bg-white/58 p-3 text-[12px] leading-6 text-[#2f241b] outline-none focus:border-[#b9874c]/35"
                      />
                    ) : (
                      <p className="whitespace-pre-wrap text-[12px] leading-6 text-[#5f4e3d]">
                        {review.response_text}
                      </p>
                    )}
                  </div>
                )}

                {review.recovery_case && (
                  <div className="mt-4 flex gap-3 rounded-2xl border border-red-300/45 bg-red-50/82 p-4 text-[12px] text-red-700">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    <div>
                      <div className="font-medium">Critical recovery case open</div>
                      <div className="mt-1 text-red-700/70">
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
                      className="flex items-center gap-2 rounded-xl bg-[linear-gradient(180deg,#d4ae7a,#aa773d)] px-4 py-2 text-[11px] font-semibold text-white shadow-[0_7px_16px_rgba(128,87,40,0.20)] disabled:opacity-40"
                    >
                      <Send className="h-4 w-4" />
                      {publishingId === review.id
                        ? "Publishing…"
                        : "Approve and publish"}
                    </button>
                  </div>
                )}

                {review.last_response_error && (
                  <div className="mt-3 text-[10px] text-red-700/70">
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
