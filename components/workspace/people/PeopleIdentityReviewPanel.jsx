"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BadgeCheck,
  CalendarClock,
  FileCheck2,
  FileWarning,
  ShieldCheck,
  X,
} from "lucide-react";

function dateLabel(value) {
  if (!value) return "Not set";
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function expiryTone(expiry) {
  if (!expiry) return "border-white/10 bg-white/[0.03] text-white/55";
  if (expiry.state === "EXPIRED" || expiry.state === "EXPIRING_7") {
    return "border-red-400/20 bg-red-400/[0.08] text-red-100";
  }
  if (["EXPIRING_14", "EXPIRING_30"].includes(expiry.state)) {
    return "border-amber-300/20 bg-amber-300/[0.07] text-amber-100";
  }
  if (["EXPIRING_60", "EXPIRING_90"].includes(expiry.state)) {
    return "border-[#D6A66A]/20 bg-[#D6A66A]/[0.07] text-[#E8C18C]";
  }
  return "border-emerald-400/20 bg-emerald-400/[0.07] text-emerald-100";
}

function expiryCopy(expiry, expiryDate) {
  if (!expiry) return "Expiry not configured";
  if (expiry.state === "NO_EXPIRY") return "No expiry date";
  if (expiry.state === "EXPIRED") {
    return `Expired ${Math.abs(Number(expiry.days_remaining || 0))} days ago · ${dateLabel(expiryDate)}`;
  }
  if (expiry.state === "VALID") {
    return `Valid · ${expiry.days_remaining} days remaining · ${dateLabel(expiryDate)}`;
  }
  return `Expires in ${expiry.days_remaining} days · ${dateLabel(expiryDate)}`;
}

export default function PeopleIdentityReviewPanel({
  employee,
  onClose,
}) {
  const [review, setReview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState(null);
  const [decisionNotes, setDecisionNotes] = useState("");

  const staffId = employee?.id || "";

  const load = useCallback(async () => {
    if (!staffId) return;
    setLoading(true);
    setError("");
    try {
      const response = await fetch(
        `/api/people/identity-documents?staffId=${encodeURIComponent(staffId)}`,
        { cache: "no-store" },
      );
      const result = await response.json();
      if (!response.ok || !result?.success) {
        throw new Error(result?.error || "Unable to load identity review");
      }
      setReview(result);
    } catch (loadError) {
      setError(loadError?.message || "Unable to load identity review");
    } finally {
      setLoading(false);
    }
  }, [staffId]);

  useEffect(() => {
    load();
  }, [load]);

  const items = useMemo(() => {
    if (!review?.documents) return [];
    return [
      ["passport", "Passport", review.documents.passport],
      ["national_id", "National ID", review.documents.national_id],
      ["work_permit", "Work permit", review.documents.work_permit],
    ];
  }, [review]);

  async function openPreview(document) {
    if (!document?.id) return;
    setWorking(true);
    setError("");
    try {
      const response = await fetch(
        `/api/people/identity-documents?staffId=${encodeURIComponent(staffId)}&action=preview&documentId=${encodeURIComponent(document.id)}`,
        { cache: "no-store" },
      );
      const result = await response.json();
      if (!response.ok || !result?.success) {
        throw new Error(result?.error || "Unable to preview identity document");
      }
      setPreview(result.preview || null);
    } catch (previewError) {
      setError(previewError?.message || "Unable to preview identity document");
    } finally {
      setWorking(false);
    }
  }

  async function decide(document, decision) {
    if (!document?.id) return;
    if (decision === "REJECT" && !decisionNotes.trim()) {
      setError("Add a rejection reason before rejecting this identity document.");
      return;
    }

    setWorking(true);
    setError("");
    try {
      const response = await fetch("/api/people/identity-documents", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          staffId,
          documentId: document.id,
          decision,
          notes: decisionNotes.trim() || null,
        }),
      });
      const result = await response.json();
      if (!response.ok || !result?.success) {
        throw new Error(result?.error || "Unable to decide identity document");
      }
      setReview(result);
      setPreview(null);
      setDecisionNotes("");
    } catch (decisionError) {
      setError(decisionError?.message || "Unable to decide identity document");
    } finally {
      setWorking(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[80] bg-black/80 p-3 backdrop-blur-md sm:p-6">
      <div className="mx-auto flex h-full max-w-7xl flex-col overflow-hidden rounded-[30px] border border-white/10 bg-[#080808] text-white shadow-2xl">
        <div className="flex items-center gap-4 border-b border-white/[0.08] px-5 py-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-[#D6A66A]/20 bg-[#D6A66A]/10">
            <ShieldCheck className="h-5 w-5 text-[#D6A66A]" />
          </div>
          <div className="min-w-0">
            <div className="text-[9px] font-black uppercase tracking-[0.22em] text-[#D6A66A]">
              Identity Review
            </div>
            <div className="mt-1 truncate text-xl font-black">
              {employee?.name || "Employee"}
            </div>
            <div className="mt-1 truncate text-xs text-white/35">
              {employee?.email || "No email"} · private identity evidence
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="ml-auto flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-white/60"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid min-h-0 flex-1 gap-0 xl:grid-cols-[440px_1fr]">
          <aside className="overflow-y-auto border-b border-white/[0.08] p-5 xl:border-b-0 xl:border-r">
            {error ? (
              <div className="mb-4 rounded-2xl border border-red-400/20 bg-red-400/[0.08] p-3 text-sm text-red-100">
                {error}
              </div>
            ) : null}

            {loading ? (
              <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5 text-sm text-white/40">
                Loading identity evidence...
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <StatusCard
                    label="Legal entity"
                    value={review?.employment?.entity_id ? "Bound" : "Not configured"}
                    detail={review?.employment?.entity_id || "No current employment entity"}
                  />
                  <StatusCard
                    label="Identity attention"
                    value={review?.documents?.has_attention ? "Required" : "Clear"}
                    detail={
                      review?.documents?.has_critical
                        ? "Critical expiry issue"
                        : review?.documents?.has_attention
                          ? "Review outstanding items"
                          : "No current expiry alert"
                    }
                    attention={review?.documents?.has_attention}
                  />
                </div>

                <div className="mt-4 space-y-3">
                  {items.map(([key, label, entry]) => (
                    <DocumentCard
                      key={key}
                      label={label}
                      entry={entry}
                      onPreview={openPreview}
                      onSelectPending={(doc) => {
                        setPreview(null);
                        openPreview(doc);
                      }}
                      working={working}
                    />
                  ))}
                </div>
              </>
            )}
          </aside>

          <section className="min-h-0 overflow-y-auto p-5">
            {preview ? (
              <div className="space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-[9px] uppercase tracking-[0.2em] text-white/30">
                      Secure visual preview
                    </div>
                    <div className="mt-1 text-lg font-black">
                      {preview.document?.document_name || preview.document?.document_type}
                    </div>
                    <div className="mt-1 text-xs text-white/35">
                      Signed preview expires in {preview.expires_in} seconds · version {preview.version_number}
                    </div>
                  </div>
                  <div className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[9px] uppercase tracking-[0.12em] text-white/45">
                    {preview.document?.document_status || "unknown"}
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <Detail label="Document number" value={preview.document?.document_number || "Not recorded"} />
                  <Detail label="Effective" value={dateLabel(preview.document?.effective_date)} />
                  <Detail label="Expiry" value={dateLabel(preview.document?.expiry_date)} />
                  <Detail label="Legal entity" value={preview.document?.entity_id || "Staff identity"} mono />
                </div>

                <div className="overflow-hidden rounded-2xl border border-white/10 bg-white">
                  {String(preview.document?.mime_type || "").startsWith("image/") ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={preview.url}
                      alt="Private staff identity document"
                      className="max-h-[650px] w-full object-contain"
                    />
                  ) : (
                    <iframe
                      src={preview.url}
                      title="Private staff identity document"
                      className="h-[650px] w-full bg-white"
                    />
                  )}
                </div>

                {String(preview.document?.document_status || "").toLowerCase() === "pending_approval" ? (
                  <div className="rounded-2xl border border-[#D6A66A]/20 bg-[#D6A66A]/[0.06] p-4">
                    <div className="flex items-center gap-2 text-sm font-black text-[#E8C18C]">
                      <FileCheck2 className="h-4 w-4" /> Verification decision
                    </div>
                    <p className="mt-2 text-xs leading-5 text-white/45">
                      Confirm that the person, document number, expiry date and legal entity match the employee record before approval.
                    </p>
                    <textarea
                      value={decisionNotes}
                      onChange={(event) => setDecisionNotes(event.target.value)}
                      rows={3}
                      placeholder="Decision notes / rejection reason"
                      className="mt-3 w-full rounded-xl border border-white/10 bg-black/30 p-3 text-xs text-white outline-none placeholder:text-white/25"
                    />
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={working}
                        onClick={() => decide(preview.document, "APPROVE")}
                        className="rounded-xl bg-[#D6A66A] px-4 py-2.5 text-[10px] font-black uppercase tracking-[0.12em] text-black disabled:opacity-40"
                      >
                        Approve identity document
                      </button>
                      <button
                        type="button"
                        disabled={working || !decisionNotes.trim()}
                        onClick={() => decide(preview.document, "REJECT")}
                        className="rounded-xl border border-red-400/20 bg-red-400/[0.08] px-4 py-2.5 text-[10px] font-black uppercase tracking-[0.12em] text-red-100 disabled:opacity-40"
                      >
                        Reject
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="flex min-h-[520px] items-center justify-center rounded-[24px] border border-dashed border-white/10 bg-white/[0.02] p-8 text-center">
                <div className="max-w-md">
                  <ShieldCheck className="mx-auto h-8 w-8 text-[#D6A66A]/60" />
                  <div className="mt-4 text-lg font-black">Select a document to review visually.</div>
                  <div className="mt-2 text-sm leading-6 text-white/35">
                    Passport, national ID and work permit remain private. Owner/HR receives a temporary signed preview and every preview access is logged.
                  </div>
                </div>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

function StatusCard({ label, value, detail, attention = false }) {
  return (
    <div className={`rounded-2xl border p-3 ${attention ? "border-amber-300/20 bg-amber-300/[0.06]" : "border-white/[0.08] bg-white/[0.03]"}`}>
      <div className="text-[8px] uppercase tracking-[0.16em] text-white/25">{label}</div>
      <div className={`mt-1 text-sm font-black ${attention ? "text-amber-100" : "text-white"}`}>{value}</div>
      <div className="mt-1 truncate text-[9px] text-white/30">{detail}</div>
    </div>
  );
}

function Detail({ label, value, mono = false }) {
  return (
    <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-3">
      <div className="text-[8px] uppercase tracking-[0.13em] text-white/25">{label}</div>
      <div className={`mt-1 break-all text-[10px] font-semibold text-white/65 ${mono ? "font-mono" : ""}`}>{value}</div>
    </div>
  );
}

function DocumentCard({ label, entry, onPreview, working }) {
  const current = entry?.current || null;
  const verified = entry?.verified || null;
  const pending = entry?.pending_replacement || (
    current?.verification === "PENDING" ? current : null
  );
  const authoritative = verified || (current?.verification === "VERIFIED" ? current : null);

  return (
    <div className="rounded-[22px] border border-white/[0.08] bg-white/[0.03] p-4">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-black/25">
          {authoritative ? (
            <BadgeCheck className="h-4 w-4 text-emerald-300" />
          ) : pending ? (
            <CalendarClock className="h-4 w-4 text-amber-200" />
          ) : (
            <FileWarning className="h-4 w-4 text-white/30" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <div className="text-sm font-black">{label}</div>
            <span className="rounded-full border border-white/10 bg-black/20 px-2 py-0.5 text-[7px] font-black uppercase tracking-[0.12em] text-white/40">
              {authoritative ? "Verified" : pending ? "Pending" : entry?.required ? "Missing" : "Optional"}
            </span>
          </div>

          {authoritative ? (
            <div className="mt-3">
              <div className={`rounded-xl border px-3 py-2 text-[9px] ${expiryTone(authoritative.expiry)}`}>
                {expiryCopy(authoritative.expiry, authoritative.expiry_date)}
              </div>
              <div className="mt-2 text-[9px] text-white/35">
                {authoritative.document_number ? `No. ${authoritative.document_number} · ` : ""}
                version {authoritative.version_number}
              </div>
              <button
                type="button"
                disabled={working}
                onClick={() => onPreview(authoritative)}
                className="mt-3 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-[9px] font-black uppercase tracking-[0.1em] text-white/60 disabled:opacity-35"
              >
                View verified document
              </button>
            </div>
          ) : null}

          {pending && pending.id !== authoritative?.id ? (
            <div className="mt-3 rounded-xl border border-[#D6A66A]/20 bg-[#D6A66A]/[0.06] p-3">
              <div className="text-[8px] font-black uppercase tracking-[0.12em] text-[#E8C18C]">
                Pending replacement
              </div>
              <div className="mt-1 text-[9px] text-white/45">
                {pending.expiry_date ? `Expiry ${dateLabel(pending.expiry_date)} · ` : ""}
                awaiting owner/HR verification
              </div>
              <button
                type="button"
                disabled={working}
                onClick={() => onPreview(pending)}
                className="mt-2 rounded-lg border border-[#D6A66A]/20 bg-[#D6A66A]/10 px-3 py-2 text-[9px] font-black uppercase tracking-[0.1em] text-[#E8C18C] disabled:opacity-35"
              >
                Review visually
              </button>
            </div>
          ) : null}

          {!authoritative && !pending ? (
            <div className="mt-2 text-[9px] leading-4 text-white/30">
              {entry?.required ? "No current document has been uploaded and verified." : "No work permit is currently recorded for this legal entity."}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
