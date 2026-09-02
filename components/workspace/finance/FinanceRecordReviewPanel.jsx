"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  FileText,
  MessageSquareText,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";

function text(value) {
  return String(value ?? "").trim();
}

function label(value) {
  return text(value)
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function valueAt(row, keys = []) {
  for (const key of keys) {
    const value = String(key || "").split(".").reduce((current, part) => current?.[part], row);
    if (value !== null && value !== undefined && value !== "") return value;
  }
  return null;
}

function recordTitle(row, capability) {
  return text(
    row?.invoice_number || row?.journal_number || row?.payment_number || row?.purchase_order_number ||
    row?.receipt_number || row?.transaction_number || row?.statement_number || row?.case_number ||
    row?.account_name || row?.vendor_name || row?.customer_name || row?.asset_name || row?.legal_name ||
    row?.period_name || row?.name || row?.title || row?.code || capability?.document || capability?.name || "Record"
  );
}

function recordSubtitle(row, fallback = "") {
  return [
    row?.account_code,
    row?.customer_name,
    row?.vendor_name,
    row?.reference,
    row?.currency_code,
    row?.status,
  ].filter(Boolean).slice(0, 3).join(" · ") || fallback;
}

function dateTime(value) {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value);
  return new Intl.DateTimeFormat(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(parsed);
}

function display(value) {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") return new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(value);
  return String(value);
}

function statusTone(value) {
  const status = text(value).toUpperCase();
  if (["REVIEWED", "CLEARED", "LOCKED", "RESOLVED"].includes(status)) {
    return "border-emerald-700/15 bg-emerald-50 text-emerald-800";
  }
  if (["CHANGES_REQUESTED", "OPEN"].includes(status)) {
    return "border-red-700/15 bg-red-50 text-red-800";
  }
  return "border-amber-700/15 bg-amber-50 text-amber-800";
}

function defaultDetailFields(row) {
  if (!row) return [];
  const hidden = new Set([
    "id", "organization_id", "entity_id", "period_id", "party_id", "staff_id", "created_by", "updated_by",
  ]);
  return Object.entries(row)
    .filter(([key, value]) => !hidden.has(key) && !key.endsWith("_id") && value !== null && value !== undefined && value !== "" && typeof value !== "object")
    .slice(0, 28)
    .map(([key, value]) => ({ label: label(key), value }));
}

function TabButton({ active, children, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`whitespace-nowrap border-b-2 px-0.5 pb-2 text-[10px] font-medium transition ${
        active
          ? "border-[#B18150] text-[#463F37]"
          : "border-transparent text-[#9A948C] hover:text-[#625D56]"
      }`}
    >
      {children}
    </button>
  );
}

export default function FinanceRecordReviewPanel({
  selected,
  capability,
  organizationId,
  entityId,
  periodId,
  presentation,
  rows = [],
  onSelect,
}) {
  const [tab, setTab] = useState("overview");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [reviewData, setReviewData] = useState({
    review_item: null,
    notes: [],
    signoffs: [],
    documents: [],
    audit_events: [],
  });
  const [noteBody, setNoteBody] = useState("");
  const [busyAction, setBusyAction] = useState("");

  const recordKey = selected?.id ? String(selected.id) : "";
  const selectedEntityId = selected?.entity_id || entityId || null;
  const selectedPeriodId = selected?.period_id || periodId || null;
  const detailFields = useMemo(() => defaultDetailFields(selected), [selected]);
  const collections = useMemo(
    () => selected
      ? Object.entries(selected).filter(([, value]) => Array.isArray(value) && value.length).slice(0, 6)
      : [],
    [selected]
  );

  async function loadReview() {
    if (!selected || !recordKey || !organizationId || !capability?.id) {
      setReviewData({ review_item: null, notes: [], signoffs: [], documents: [], audit_events: [] });
      return;
    }
    try {
      setLoading(true);
      setError("");
      const url = new URL("/api/finance/review", window.location.origin);
      url.searchParams.set("organizationId", organizationId);
      url.searchParams.set("capabilityId", capability.id);
      url.searchParams.set("recordKey", recordKey);
      if (selectedEntityId) url.searchParams.set("entityId", selectedEntityId);
      if (selectedPeriodId) url.searchParams.set("periodId", selectedPeriodId);
      const response = await fetch(url.toString(), { cache: "no-store", credentials: "include" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || body?.success === false) throw new Error(body?.error || "Unable to load review evidence");
      setReviewData({
        review_item: body.review_item || null,
        notes: body.notes || [],
        signoffs: body.signoffs || [],
        documents: body.documents || [],
        audit_events: body.audit_events || [],
      });
    } catch (loadError) {
      setError(loadError?.message || "Unable to load review evidence");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setTab("overview");
    setNoteBody("");
    loadReview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recordKey, capability?.id, organizationId, selectedEntityId, selectedPeriodId]);

  async function reviewAction(action, extra = {}) {
    if (!selected || !recordKey) return;
    try {
      setBusyAction(action);
      setError("");
      const response = await fetch("/api/finance/review", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId,
          entityId: selectedEntityId,
          periodId: selectedPeriodId,
          capabilityId: capability?.id,
          recordKey,
          recordType: capability?.document || capability?.id,
          recordLabel: recordTitle(selected, capability),
          action,
          ...extra,
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || body?.success === false) throw new Error(body?.error || "Finance review action failed");
      if (action === "add_note") setNoteBody("");
      await loadReview();
    } catch (actionError) {
      setError(actionError?.message || "Finance review action failed");
    } finally {
      setBusyAction("");
    }
  }

  if (!selected) {
    return <div className="p-6 text-[11px] text-[#8B857D]">Select a record to review details.</div>;
  }

  const reviewItem = reviewData.review_item;
  const openNotes = reviewData.notes.filter((note) => note.status !== "RESOLVED");
  const index = rows.findIndex((row) => row === selected || (row?.id && row.id === selected?.id));

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b border-black/[0.07] p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[9px] font-semibold uppercase tracking-[0.15em] text-[#9A7045]">Record review</div>
            <h2 className="mt-1 truncate text-[18px] font-semibold tracking-[-0.02em] text-[#292621]">{recordTitle(selected, capability)}</h2>
            <p className="mt-1 truncate text-[10px] text-[#8C867E]">{recordSubtitle(selected, presentation?.review_label)}</p>
          </div>
          {reviewItem?.status ? (
            <span className={`shrink-0 rounded-full border px-2 py-1 text-[9px] font-medium ${statusTone(reviewItem.status)}`}>
              {label(reviewItem.status)}
            </span>
          ) : valueAt(selected, ["status", "approval_status", "match_status"]) ? (
            <span className="shrink-0 rounded-full border border-black/[0.08] bg-[#F7F6F3] px-2 py-1 text-[9px] font-medium text-[#706B63]">
              {label(valueAt(selected, ["status", "approval_status", "match_status"]))}
            </span>
          ) : null}
        </div>

        <div className="mt-3 flex items-center justify-between border-t border-black/[0.06] pt-3 text-[9px] text-[#918B83]">
          <span>{index >= 0 ? index + 1 : 0} of {rows.length}</span>
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => onSelect?.(rows[Math.max(0, index - 1)])}
              disabled={index <= 0}
              className="rounded-md border border-black/[0.07] p-1 text-[#716B63] hover:bg-[#F7F6F3] disabled:opacity-30"
            ><ChevronLeft size={13} /></button>
            <button
              type="button"
              onClick={() => onSelect?.(rows[Math.min(rows.length - 1, index + 1)])}
              disabled={index < 0 || index >= rows.length - 1}
              className="rounded-md border border-black/[0.07] p-1 text-[#716B63] hover:bg-[#F7F6F3] disabled:opacity-30"
            ><ChevronRight size={13} /></button>
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <div className="flex gap-4 overflow-x-auto border-b border-black/[0.06]">
          <TabButton active={tab === "overview"} onClick={() => setTab("overview")}>Overview</TabButton>
          <TabButton active={tab === "lines"} onClick={() => setTab("lines")}>Lines {collections.length ? `(${collections.length})` : ""}</TabButton>
          <TabButton active={tab === "review"} onClick={() => setTab("review")}>Review {openNotes.length ? `(${openNotes.length})` : ""}</TabButton>
          <TabButton active={tab === "documents"} onClick={() => setTab("documents")}>Documents {reviewData.documents.length ? `(${reviewData.documents.length})` : ""}</TabButton>
          <TabButton active={tab === "audit"} onClick={() => setTab("audit")}>Audit</TabButton>
        </div>

        {error ? (
          <div className="mt-3 rounded-lg border border-red-700/15 bg-red-50 p-3 text-[10px] text-red-800">{error}</div>
        ) : null}

        {loading ? (
          <div className="mt-4 flex items-center gap-2 text-[10px] text-[#817B73]"><RefreshCw size={12} className="animate-spin" /> Loading review evidence…</div>
        ) : null}

        {tab === "overview" ? (
          <dl className="mt-3 divide-y divide-black/[0.055]">
            {detailFields.map((field) => (
              <div key={field.label} className="grid grid-cols-[120px_minmax(0,1fr)] gap-3 py-2.5 text-[10px]">
                <dt className="text-[#918B83]">{field.label}</dt>
                <dd className="min-w-0 break-words font-medium text-[#514C45]">{display(field.value)}</dd>
              </div>
            ))}
          </dl>
        ) : null}

        {tab === "lines" ? (
          <div className="mt-3 space-y-4">
            {collections.length === 0 ? (
              <div className="text-[10px] text-[#918B83]">No embedded lines or related collections are included in this record payload.</div>
            ) : collections.map(([key, items]) => (
              <section key={key}>
                <div className="mb-2 text-[9px] font-semibold uppercase tracking-[0.14em] text-[#918B83]">{label(key)}</div>
                <div className="overflow-x-auto rounded-lg border border-black/[0.07]">
                  <table className="min-w-full text-[9px]">
                    <tbody className="divide-y divide-black/[0.05]">
                      {items.slice(0, 50).map((item, itemIndex) => (
                        <tr key={item?.id || itemIndex}>
                          <td className="px-2.5 py-2 text-[#5D5750]">{recordTitle(item || {}, capability)}</td>
                          <td className="px-2.5 py-2 text-right text-[#7D766D]">{display(item?.amount ?? item?.debit ?? item?.credit ?? item?.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            ))}
          </div>
        ) : null}

        {tab === "review" ? (
          <div className="mt-3 space-y-4">
            {!reviewItem ? (
              <button
                type="button"
                disabled={Boolean(busyAction)}
                onClick={() => reviewAction("ensure_review")}
                className="inline-flex h-8 items-center gap-2 rounded-lg bg-[#1F1E1B] px-3 text-[10px] font-semibold text-white disabled:opacity-50"
              >
                <ShieldCheck size={12} /> Start review
              </button>
            ) : (
              <>
                <div className="rounded-lg border border-black/[0.07] bg-[#FAF9F7] p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <div className="text-[9px] font-semibold uppercase tracking-[0.12em] text-[#918B83]">Review status</div>
                      <div className="mt-1 text-[12px] font-semibold text-[#403B35]">{label(reviewItem.status)}</div>
                    </div>
                    <div className="text-right text-[9px] text-[#918B83]">Updated<br />{dateTime(reviewItem.updated_at)}</div>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <button type="button" disabled={Boolean(busyAction)} onClick={() => reviewAction("set_status", { status: "IN_PREPARATION" })} className="rounded-lg border border-black/[0.08] bg-white px-2 py-2 text-[9px] font-medium text-[#625D56] disabled:opacity-50">In preparation</button>
                    <button type="button" disabled={Boolean(busyAction)} onClick={() => reviewAction("set_status", { status: "CHANGES_REQUESTED" })} className="rounded-lg border border-black/[0.08] bg-white px-2 py-2 text-[9px] font-medium text-[#625D56] disabled:opacity-50">Request changes</button>
                    <button type="button" disabled={Boolean(busyAction)} onClick={() => reviewAction("signoff", { signoffRole: "PREPARER" })} className="rounded-lg border border-[#B18150]/25 bg-[#D6A66A]/[0.08] px-2 py-2 text-[9px] font-semibold text-[#73502D] disabled:opacity-50">Preparer sign-off</button>
                    <button type="button" disabled={Boolean(busyAction)} onClick={() => reviewAction("signoff", { signoffRole: "REVIEWER" })} className="rounded-lg bg-[#1F1E1B] px-2 py-2 text-[9px] font-semibold text-white disabled:opacity-50">Reviewer sign-off</button>
                  </div>
                </div>

                <div>
                  <div className="mb-2 flex items-center gap-2 text-[9px] font-semibold uppercase tracking-[0.12em] text-[#918B83]"><MessageSquareText size={11} /> Review notes</div>
                  <textarea
                    value={noteBody}
                    onChange={(event) => setNoteBody(event.target.value)}
                    placeholder="Add review note, query or required follow-up…"
                    className="min-h-20 w-full resize-y rounded-lg border border-black/[0.08] bg-white p-2.5 text-[10px] text-[#514C45] outline-none focus:border-[#B18150]/50"
                  />
                  <button
                    type="button"
                    disabled={!noteBody.trim() || Boolean(busyAction)}
                    onClick={() => reviewAction("add_note", { noteType: "REVIEW", body: noteBody })}
                    className="mt-2 h-8 rounded-lg border border-black/[0.08] bg-white px-3 text-[9px] font-semibold text-[#625D56] disabled:opacity-40"
                  >
                    Add note
                  </button>
                  <div className="mt-3 space-y-2">
                    {reviewData.notes.length === 0 ? (
                      <div className="text-[10px] text-[#918B83]">No review notes.</div>
                    ) : reviewData.notes.map((note) => (
                      <div key={note.id} className="rounded-lg border border-black/[0.07] bg-[#FAF9F7] p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="text-[9px] font-semibold text-[#665F56]">{label(note.note_type)} · {label(note.status)}</div>
                            <div className="mt-1 whitespace-pre-wrap text-[10px] leading-4 text-[#514C45]">{note.body}</div>
                            <div className="mt-1 text-[8px] text-[#A09A92]">{dateTime(note.created_at)}</div>
                          </div>
                          {note.status !== "RESOLVED" ? (
                            <button type="button" disabled={Boolean(busyAction)} onClick={() => reviewAction("resolve_note", { noteId: note.id })} className="shrink-0 rounded-md border border-black/[0.07] bg-white p-1.5 text-[#716B63]" title="Resolve note"><Check size={11} /></button>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="mb-2 text-[9px] font-semibold uppercase tracking-[0.12em] text-[#918B83]">Sign-off evidence</div>
                  <div className="space-y-2">
                    {reviewData.signoffs.length === 0 ? (
                      <div className="text-[10px] text-[#918B83]">No sign-offs yet.</div>
                    ) : reviewData.signoffs.map((signoff) => (
                      <div key={signoff.id} className="flex items-center justify-between rounded-lg border border-emerald-700/10 bg-emerald-50/60 px-3 py-2 text-[9px]">
                        <span className="font-semibold text-emerald-800">{label(signoff.signoff_role)}</span>
                        <span className="text-emerald-700/70">{dateTime(signoff.signed_at)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        ) : null}

        {tab === "documents" ? (
          <div className="mt-3 space-y-2">
            {reviewData.documents.length === 0 ? (
              <div className="text-[10px] text-[#918B83]">No linked Finance documents were found for this record.</div>
            ) : reviewData.documents.map((document) => (
              <a key={document.id} href={document.file_url || "#"} target="_blank" rel="noreferrer" className="flex items-center gap-3 rounded-lg border border-black/[0.07] bg-[#FAF9F7] p-3 hover:border-[#B18150]/30">
                <FileText size={14} className="shrink-0 text-[#9A7045]" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[10px] font-medium text-[#514C45]">{document.file_name || "Finance document"}</div>
                  <div className="mt-0.5 text-[8px] text-[#9A948C]">{label(document.status || "available")} · {dateTime(document.created_at)}</div>
                </div>
              </a>
            ))}
          </div>
        ) : null}

        {tab === "audit" ? (
          <div className="mt-3 space-y-2">
            {reviewData.audit_events.length === 0 ? (
              <div className="text-[10px] text-[#918B83]">No audit events were found for this record key.</div>
            ) : reviewData.audit_events.map((event) => (
              <div key={event.id} className="rounded-lg border border-black/[0.07] bg-[#FAF9F7] p-3">
                <div className="text-[9px] font-semibold text-[#625D56]">{label(event.action)}</div>
                <div className="mt-1 text-[8px] text-[#9A948C]">{event.actor_email || "System"} · {dateTime(event.created_at)}</div>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
