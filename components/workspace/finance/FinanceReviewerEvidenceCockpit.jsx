"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  BadgeCheck,
  BookOpenCheck,
  ChevronRight,
  FileCheck2,
  Link2,
  LoaderCircle,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";

function clean(value) {
  return String(value ?? "").trim();
}

function label(value) {
  return clean(value).replace(/[_-]+/g, " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

function shortDate(value) {
  return value ? String(value).slice(0, 10) : "—";
}

function isReviewWork(row) {
  const status = clean(row?.status).toUpperCase();
  const role = clean(row?.required_role).toUpperCase();
  return status === "READY_FOR_REVIEW" ||
    status === "CHANGES_REQUESTED" ||
    (["REVIEWER", "PARTNER"].includes(role) && ["READY", "IN_PROGRESS", "BLOCKED"].includes(status));
}

function tone(value) {
  const state = clean(value).toUpperCase();
  if (["BLOCKED", "CHANGES_REQUESTED", "SYSTEM_BLOCKED"].includes(state)) return "border-red-700/15 bg-red-50 text-red-800";
  if (["READY_FOR_REVIEW", "READY", "IN_PROGRESS", "INSPECT"].includes(state)) return "border-amber-700/15 bg-amber-50 text-amber-800";
  if (["VERIFIED", "REVIEWED", "CLEARED", "COMPLETE"].includes(state)) return "border-emerald-700/15 bg-emerald-50 text-emerald-800";
  return "border-black/[0.08] bg-[#F7F6F3] text-[#716B63]";
}

function money(value, currency) {
  const amount = Number(value || 0);
  try {
    return currency
      ? new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: 2 }).format(amount)
      : new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(amount);
  } catch {
    return `${currency || ""} ${amount.toLocaleString()}`.trim();
  }
}

function Card({ title, icon: Icon, children }) {
  return (
    <div className="rounded-xl border border-black/[0.06] bg-[#FCFBF9] p-3">
      <div className="flex items-center gap-1.5 text-[8px] font-semibold uppercase tracking-[0.1em] text-[#918B83]">
        <Icon size={10} /> {title}
      </div>
      <div className="mt-2">{children}</div>
    </div>
  );
}

export default function FinanceReviewerEvidenceCockpit({ organizationId }) {
  const [queueState, setQueueState] = useState({ loading: true, error: "", rows: [] });
  const [selectedId, setSelectedId] = useState(null);
  const [evidenceState, setEvidenceState] = useState({ loading: false, error: "", data: null });

  async function loadQueue() {
    if (!organizationId) return;
    try {
      setQueueState((current) => ({ ...current, loading: true, error: "" }));
      const url = new URL("/api/workspace/finance/work-programs", window.location.origin);
      url.searchParams.set("organizationId", organizationId);
      const response = await fetch(url.toString(), { cache: "no-store", credentials: "include" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || body?.success === false) throw new Error(body?.error || "Unable to load reviewer evidence queue");
      const rows = [];
      for (const run of body.runs || []) {
        for (const item of run.work_items || []) {
          if (!isReviewWork(item)) continue;
          rows.push({
            ...item,
            run_id: run.id,
            engagement_id: run.engagement_id,
            client_organization_id: run.organization_id,
            period_id: run.period_id,
            run_due_at: run.due_at,
          });
        }
      }
      rows.sort((a, b) => String(a.due_at || "9999-12-31").localeCompare(String(b.due_at || "9999-12-31")) || Number(a.sequence_no || 0) - Number(b.sequence_no || 0));
      setQueueState({ loading: false, error: "", rows });
      setSelectedId((current) => rows.some((row) => row.id === current) ? current : rows[0]?.id || null);
    } catch (error) {
      setQueueState((current) => ({ ...current, loading: false, error: error?.message || "Unable to load reviewer evidence queue" }));
    }
  }

  useEffect(() => { loadQueue(); }, [organizationId]);

  const selected = useMemo(
    () => queueState.rows.find((row) => row.id === selectedId) || null,
    [queueState.rows, selectedId],
  );

  async function loadEvidence(row) {
    if (!organizationId || !row?.id || !row?.run_id) {
      setEvidenceState({ loading: false, error: "", data: null });
      return;
    }
    try {
      setEvidenceState((current) => ({ ...current, loading: true, error: "" }));
      const url = new URL("/api/workspace/finance/reviewer-evidence", window.location.origin);
      url.searchParams.set("organizationId", organizationId);
      url.searchParams.set("runId", row.run_id);
      url.searchParams.set("workItemId", row.id);
      const response = await fetch(url.toString(), { cache: "no-store", credentials: "include" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || body?.success === false) throw new Error(body?.error || "Unable to load reviewer evidence");
      setEvidenceState({ loading: false, error: "", data: body.evidence || null });
    } catch (error) {
      setEvidenceState({ loading: false, error: error?.message || "Unable to load reviewer evidence", data: null });
    }
  }

  useEffect(() => { loadEvidence(selected); }, [organizationId, selected?.id, selected?.run_id]);

  if (!organizationId) return null;
  if (!queueState.loading && !queueState.error && !queueState.rows.length) return null;

  const evidence = evidenceState.data;
  const ledger = evidence?.ledger_impact || null;
  const review = evidence?.review_control || {};
  const system = evidence?.system_verification || {};
  const activeEvidence = evidence?.evidence || {};
  const currency = evidence?.ledger_impact?.accounts?.find((row) => row.currency_code)?.currency_code || null;

  return (
    <section className="mb-4 rounded-[24px] border border-[#A37849]/15 bg-[#FBF8F3] p-4 md:p-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex items-center gap-2 text-[9px] font-medium uppercase tracking-[0.16em] text-[#8A633C]"><BookOpenCheck size={12} /> Reviewer evidence cockpit</div>
          <h2 className="mt-1.5 text-[19px] font-semibold tracking-[-0.025em] text-[#2A2723]">Evidence before judgment</h2>
          <p className="mt-1 max-w-3xl text-[9px] leading-5 text-[#756F67]">One reviewer view for source documents, accounting impact, prior-period context, review points and sign-offs. Ledger impact is shown only when Avantiqo can prove the linkage.</p>
        </div>
        <button type="button" onClick={loadQueue} disabled={queueState.loading} className="inline-flex h-8 items-center gap-1.5 self-start rounded-lg border border-black/[0.08] bg-white px-2.5 text-[8px] font-semibold text-[#716B63] disabled:opacity-50"><RefreshCw size={10} className={queueState.loading ? "animate-spin" : ""} /> Refresh</button>
      </div>

      {queueState.error ? <div className="mt-3 rounded-xl border border-red-700/15 bg-red-50 p-3 text-[8px] text-red-800">{queueState.error}</div> : null}
      {queueState.loading && !queueState.rows.length ? <div className="mt-3 flex min-h-20 items-center justify-center text-[9px] text-[#817D76]"><LoaderCircle size={12} className="mr-2 animate-spin text-[#A37849]" /> Reading governed reviewer evidence…</div> : null}

      {queueState.rows.length ? (
        <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(280px,0.55fr)_minmax(680px,1.45fr)]">
          <div className="overflow-hidden rounded-2xl border border-black/[0.07] bg-white">
            <div className="border-b border-black/[0.06] bg-[#FAF9F7] px-3 py-2 text-[7px] font-semibold uppercase tracking-[0.1em] text-[#8A867F]">Evidence queue · {queueState.rows.length}</div>
            <div className="max-h-[460px] overflow-y-auto">
              {queueState.rows.slice(0, 40).map((row) => (
                <button key={row.id} type="button" onClick={() => setSelectedId(row.id)} className={`w-full border-b border-black/[0.05] px-3 py-2.5 text-left last:border-0 ${row.id === selectedId ? "bg-[#FFF8EE]" : "hover:bg-[#FCFBF9]"}`}>
                  <div className="flex items-start justify-between gap-2"><div className="min-w-0"><div className="truncate text-[9px] font-semibold text-[#423D37]">{row.title}</div><div className="mt-0.5 text-[7px] text-[#9A948C]">{label(row.capability_id || row.work_type || "review work")} · due {shortDate(row.due_at)}</div></div><ChevronRight size={10} className="mt-0.5 shrink-0 text-[#B1AAA2]" /></div>
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-black/[0.07] bg-white p-4">
            {evidenceState.loading && !evidence ? <div className="flex min-h-[240px] items-center justify-center text-[9px] text-[#817D76]"><LoaderCircle size={12} className="mr-2 animate-spin text-[#A37849]" /> Building evidence chain…</div> : null}
            {evidenceState.error ? <div className="rounded-xl border border-red-700/15 bg-red-50 p-3 text-[8px] text-red-800">{evidenceState.error}</div> : null}
            {evidence ? (
              <>
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-black/[0.06] pb-3">
                  <div><div className="text-[7px] font-semibold uppercase tracking-[0.11em] text-[#8A633C]">Selected workpaper</div><div className="mt-1 text-[14px] font-semibold text-[#39342F]">{evidence.work_item?.title || selected?.title}</div><div className="mt-1 text-[8px] text-[#928B83]">{label(evidence.work_item?.capability_id || "Accounting review")} · {shortDate(evidence.period?.current?.start_date)} to {shortDate(evidence.period?.current?.end_date)}</div></div>
                  <span className={`rounded-full border px-2 py-1 text-[7px] font-semibold uppercase ${tone(evidence.work_item?.status)}`}>{label(evidence.work_item?.status)}</span>
                </div>

                <div className="mt-3 grid gap-2 md:grid-cols-4">
                  <Card title="Evidence" icon={FileCheck2}><div className="text-[12px] font-semibold text-[#45403A]">{activeEvidence.active_count || 0}</div><div className="mt-0.5 text-[7px] text-[#989188]">{activeEvidence.controlled_count || 0} controlled · {activeEvidence.approval_pending || 0} approval pending</div></Card>
                  <Card title="Review points" icon={AlertTriangle}><div className={`text-[12px] font-semibold ${review.open_points ? "text-[#9A533D]" : "text-[#556B51]"}`}>{review.open_points || 0}</div><div className="mt-0.5 text-[7px] text-[#989188]">Open reviewer questions</div></Card>
                  <Card title="Sign-offs" icon={BadgeCheck}><div className="text-[12px] font-semibold text-[#45403A]">{review.active_signoffs?.length || 0}</div><div className="mt-0.5 text-[7px] text-[#989188]">Active governed approvals</div></Card>
                  <Card title="System truth" icon={ShieldCheck}><div className={`inline-flex rounded-full border px-2 py-1 text-[7px] font-semibold uppercase ${tone(system.satisfied ? "VERIFIED" : system.applicable ? "BLOCKED" : "INSPECT")}`}>{system.satisfied ? "Verified" : system.applicable ? "Inspect / blocked" : "Human evidence"}</div><div className="mt-1 text-[7px] text-[#989188]">{system.mode ? label(system.mode) : "No automated gate"}</div></Card>
                </div>

                <div className="mt-3 grid gap-3 lg:grid-cols-2">
                  <Card title="Preparer conclusion" icon={FileCheck2}><div className={`min-h-16 whitespace-pre-wrap text-[8px] leading-4 ${evidence.work_item?.conclusion ? "text-[#5A544D]" : "text-[#9A7045]"}`}>{evidence.work_item?.conclusion || "No preparer conclusion is recorded. Reviewer clearance should not rely on an inferred conclusion."}</div></Card>
                  <Card title="Prior-period work" icon={RefreshCw}><div className="text-[8px] leading-4 text-[#5F5952]">{evidence.prior_work?.work_item ? <><div className="font-semibold">{evidence.prior_work.work_item.title}</div><div className="mt-1">Status: {label(evidence.prior_work.work_item.status)}</div><div>Conclusion: {evidence.prior_work.work_item.conclusion || "None recorded"}</div></> : "No comparable prior workpaper was found for this template step."}</div></Card>
                </div>

                <div className="mt-3 rounded-xl border border-black/[0.06] bg-[#FCFBF9] p-3">
                  <div className="flex items-center justify-between gap-3"><div className="flex items-center gap-1.5 text-[8px] font-semibold uppercase tracking-[0.1em] text-[#918B83]"><Link2 size={10} /> Ledger and journal impact</div><span className={`rounded-full border px-2 py-1 text-[7px] font-semibold uppercase ${tone(ledger?.linked ? "VERIFIED" : "INSPECT")}`}>{ledger?.linked ? "Proven link" : "No proven link"}</span></div>
                  <div className="mt-1.5 text-[7px] leading-4 text-[#8A847C]">{ledger?.reason}</div>
                  {ledger?.linked ? <div className="mt-3 overflow-hidden rounded-lg border border-black/[0.05] bg-white"><div className="grid grid-cols-[minmax(180px,1.2fr)_100px_100px_minmax(150px,0.9fr)] gap-2 border-b border-black/[0.05] bg-[#FAF9F7] px-3 py-2 text-[6px] font-semibold uppercase tracking-[0.08em] text-[#989188]"><span>Account</span><span>Linked impact</span><span>Period movement</span><span>Prior comparison</span></div>{(ledger.accounts || []).slice(0, 8).map((account) => <div key={account.account_id} className="grid grid-cols-[minmax(180px,1.2fr)_100px_100px_minmax(150px,0.9fr)] gap-2 border-b border-black/[0.04] px-3 py-2 text-[7px] text-[#635D56] last:border-0"><span className="truncate font-semibold text-[#46413B]">{account.account_code ? `${account.account_code} · ` : ""}{account.account_name}</span><span>{money(account.linked_impact?.net, account.currency_code || currency)}</span><span>{money(account.current_period_movement?.net, account.currency_code || currency)}</span><span>{account.previous_period_movement ? `${money(account.previous_period_movement.net, account.currency_code || currency)} prior${account.change_percent != null ? ` · ${account.change_percent}% change` : ""}` : "No prior period"}</span></div>)}</div> : null}
                </div>

                <div className="mt-3 grid gap-3 lg:grid-cols-2">
                  <Card title="Source documents" icon={FileCheck2}>{(activeEvidence.links || []).filter((link) => link.status === "ACTIVE").length ? <div className="space-y-1.5">{(activeEvidence.links || []).filter((link) => link.status === "ACTIVE").slice(0, 8).map((link) => <div key={link.id} className="flex items-center justify-between gap-2 text-[7px]"><div className="min-w-0"><div className="truncate font-semibold text-[#514B45]">{link.document?.file_name || "Evidence document"}</div><div className="text-[#9B948C]">{label(link.evidence_category)}{link.document?.controlled ? " · controlled" : ""}</div></div><span className={`rounded border px-1.5 py-0.5 text-[6px] uppercase ${tone(link.document?.approval_required && !link.document?.approved_at ? "INSPECT" : "VERIFIED")}`}>{link.document?.approval_required && !link.document?.approved_at ? "Approval pending" : "Available"}</span></div>)}</div> : <div className="text-[8px] text-[#9A7045]">No governed source document is linked to this workpaper.</div>}</Card>
                  <Card title="Reviewer trail" icon={BadgeCheck}><div className="space-y-1.5 text-[7px] text-[#5F5952]">{review.notes?.slice(0, 5).map((note) => <div key={note.id} className="rounded-lg border border-black/[0.05] bg-white px-2 py-1.5"><div className="font-semibold">{label(note.note_type)} · {label(note.status)}</div><div className="mt-0.5 text-[#817A72]">{note.body}</div></div>)}{!review.notes?.length ? <div className="text-[#8F8981]">No review points recorded.</div> : null}{review.active_signoffs?.map((signoff) => <div key={signoff.id} className="flex items-center gap-1.5 text-[#61715C]"><BadgeCheck size={8} /> {label(signoff.signoff_role)} signed {shortDate(signoff.signed_at)}</div>)}</div></Card>
                </div>

                {(system.blockers || []).length ? <div className="mt-3 rounded-xl border border-red-700/12 bg-red-50 p-3"><div className="text-[8px] font-semibold uppercase text-red-800">Deterministic blockers</div><div className="mt-1.5 space-y-1 text-[7px] text-red-800">{system.blockers.map((blocker, index) => <div key={index}>{blocker}</div>)}</div></div> : null}

                <div className="mt-3 border-t border-black/[0.05] pt-2 text-[7px] leading-4 text-[#918A82]">Evidence is read-only here. Linking/unlinking evidence, resolving review points, reviewer sign-off and partner clearance continue through the governed Finance workflows and are revalidated server-side.</div>
              </>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}
