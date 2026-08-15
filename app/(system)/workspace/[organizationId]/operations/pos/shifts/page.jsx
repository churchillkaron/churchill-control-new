"use client";

export const dynamic = "force-dynamic";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { CheckCircle2, LockKeyhole, RefreshCw, ShieldCheck, XCircle } from "lucide-react";
import { useBusinessContext } from "@/app/providers/BusinessContextProvider";
import POSPaymentCorrectionsPanel from "@/components/workspace/operations/POSPaymentCorrectionsPanel";

function numeric(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatMoney(value, currencyCode) {
  const amount = numeric(value);
  try {
    return new Intl.NumberFormat(undefined, currencyCode ? { style: "currency", currency: currencyCode } : { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount);
  } catch {
    return amount.toFixed(2);
  }
}

function varianceClass(value) {
  const variance = numeric(value);
  if (Math.abs(variance) <= 0.01) return "text-emerald-300";
  return variance < 0 ? "text-red-300" : "text-amber-300";
}

function statusTone(status) {
  const value = String(status || "").toUpperCase();
  if (["APPROVED", "CONFIRMED"].includes(value)) return "border-emerald-400/20 bg-emerald-400/[0.07] text-emerald-200";
  if (["REJECTED", "BLOCKED"].includes(value)) return "border-red-400/20 bg-red-400/[0.07] text-red-200";
  return "border-amber-300/20 bg-amber-300/[0.06] text-amber-100";
}

function StatusBadge({ label, status }) {
  return (
    <div className={`rounded-xl border px-3 py-2 ${statusTone(status)}`}>
      <div className="text-[9px] uppercase tracking-[0.18em] opacity-55">{label}</div>
      <div className="mt-1 text-xs font-semibold">{String(status || "PENDING").toUpperCase()}</div>
    </div>
  );
}

function Stat({ label, value, currencyCode, emphasis = false }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
      <div className="text-[10px] uppercase tracking-[0.18em] text-white/35">{label}</div>
      <div className={emphasis ? "mt-2 text-xl font-semibold text-[#E2C48A]" : "mt-2 text-lg font-semibold"}>{formatMoney(value, currencyCode)}</div>
    </div>
  );
}

async function readJson(response) {
  const text = await response.text();
  if (!text) return {};
  try { return JSON.parse(text); } catch { return { success: false, error: text }; }
}

export default function ShiftPage({ posConfiguration }) {
  const params = useParams();
  const businessContext = useBusinessContext() || {};
  const organization = businessContext.organization || null;
  const organizationId = params?.organizationId || businessContext.organization_id || organization?.id || null;
  const entityId = businessContext.entity_id || businessContext.entity?.id || null;
  const applicationId = posConfiguration?.applicationId || null;
  const currencyCode = businessContext.entity?.currency || businessContext.entity?.currency_code || organization?.currency_code || organization?.currency || businessContext.currency || null;
  const configuredPresentation = posConfiguration?.presentation || {};

  const [presentation, setPresentation] = useState(configuredPresentation);
  const [actor, setActor] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [activeSession, setActiveSession] = useState(null);
  const [financeCanConfirm, setFinanceCanConfirm] = useState(false);
  const [openingFloat, setOpeningFloat] = useState("0");
  const [closingCount, setClosingCount] = useState("0");
  const [notesBySession, setNotesBySession] = useState({});
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(null);
  const [error, setError] = useState(null);

  const activeExpectedCash = useMemo(() => {
    if (!activeSession) return 0;
    return (
      numeric(activeSession.opening_float) +
      numeric(activeSession.cash_total) +
      numeric(activeSession.paid_in_total) +
      numeric(activeSession.adjustment_in_total) -
      numeric(activeSession.paid_out_total) -
      numeric(activeSession.adjustment_out_total) -
      numeric(activeSession.refund_total) -
      numeric(activeSession.reversal_total)
    );
  }, [activeSession]);

  const loadSessions = useCallback(async () => {
    if (!organizationId) return;
    if (!entityId) {
      setError("Select an active legal entity before cash control");
      setSessions([]);
      setActiveSession(null);
      setFinanceCanConfirm(false);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const search = new URLSearchParams({ organizationId, entityId });
      if (applicationId) search.set("applicationId", applicationId);
      const financeSearch = new URLSearchParams({ organizationId });
      const [cashResponse, financeResponse] = await Promise.all([
        fetch(`/api/pos/cash-sessions?${search.toString()}`, { cache: "no-store", credentials: "include" }),
        fetch(`/api/finance/pos-cash-sessions/confirm?${financeSearch.toString()}`, { cache: "no-store", credentials: "include" }),
      ]);
      const [result, financeResult] = await Promise.all([readJson(cashResponse), readJson(financeResponse)]);
      if (!cashResponse.ok || result.success === false) throw new Error(result.error || "Unable to load cash sessions");
      setPresentation({ ...configuredPresentation, ...(result.presentation || {}) });
      setActor(result.actor || null);
      setSessions(result.sessions || []);
      setActiveSession(result.active_session || null);
      setFinanceCanConfirm(Boolean(financeResponse.ok && financeResult?.success && financeResult?.can_confirm));
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  }, [applicationId, configuredPresentation, entityId, organizationId]);

  useEffect(() => { loadSessions(); }, [loadSessions]);

  function sessionNotes(session) {
    return notesBySession[String(session?.session_id || session?.id || "")] || "";
  }

  function updateSessionNotes(session, value) {
    const key = String(session?.session_id || session?.id || "");
    setNotesBySession((current) => ({ ...current, [key]: value }));
  }

  async function execute(action, session = activeSession) {
    const sessionId = session?.session_id || session?.id || null;
    const loadingKey = `${action}:${sessionId || "new"}`;
    setActionLoading(loadingKey);
    setError(null);
    try {
      const response = await fetch("/api/pos/cash-sessions", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, organizationId, entityId, ...(applicationId ? { applicationId } : {}), sessionId, openingFloat: numeric(openingFloat), closingCount: numeric(closingCount), notes: session ? sessionNotes(session) : null }),
      });
      const result = await readJson(response);
      if (!response.ok || result.success === false) throw new Error(result.error || "Cash session action failed");
      if (action === "OPEN") setClosingCount("0");
      if (action === "CLOSE") setOpeningFloat("0");
      if (sessionId) updateSessionNotes(session, "");
      await loadSessions();
    } catch (actionError) {
      setError(actionError.message);
    } finally {
      setActionLoading(null);
    }
  }

  async function confirmAccounting(session) {
    const sessionId = session?.session_id || session?.id || null;
    const loadingKey = `ACCOUNTING:${sessionId}`;
    setActionLoading(loadingKey);
    setError(null);
    try {
      const response = await fetch("/api/finance/pos-cash-sessions/confirm", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId, entityId, applicationId, sessionId, notes: sessionNotes(session) }),
      });
      const result = await readJson(response);
      if (!response.ok || result.success === false) throw new Error(result.error || "Accounting confirmation failed");
      updateSessionNotes(session, "");
      await loadSessions();
    } catch (actionError) {
      setError(actionError.message);
    } finally {
      setActionLoading(null);
    }
  }

  return (
    <main className="min-h-screen bg-black px-6 py-8 text-white">
      <div className="mx-auto max-w-[1400px]">
        <header className="rounded-[34px] border border-white/10 bg-white/[0.035] p-7">
          <div className="flex flex-wrap items-start justify-between gap-5">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-[#D6A66A]">{presentation.cashControlEyebrow || "Commerce Operations"}</p>
              <h1 className="mt-3 text-4xl font-semibold">POS Cash Control</h1>
              <p className="mt-2 text-sm text-white/45">Drawer reconciliation, governed cash in/out, refunds and reversals, manager review and Finance-confirmed final lock.</p>
            </div>
            <button onClick={loadSessions} className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-4 py-2 text-sm text-white/60"><RefreshCw size={15} /> Refresh</button>
          </div>
          <div className="mt-5 flex flex-wrap gap-2 text-xs">
            <div className="rounded-full border border-white/10 px-3 py-1.5 text-white/45">Review authority: {actor?.can_review ? "Manager / Owner" : "View only"}</div>
            <div className="rounded-full border border-white/10 px-3 py-1.5 text-white/45">Finance confirmation: {financeCanConfirm ? "Authorized" : "Separate Finance authority"}</div>
          </div>
          {error ? <div className="mt-5 rounded-2xl border border-red-400/20 bg-red-500/10 p-4 text-sm text-red-100">{error}</div> : null}
        </header>

        {loading ? (
          <div className="mt-6 rounded-3xl border border-white/10 p-10 text-center text-white/35">Loading cash control...</div>
        ) : (
          <section className="mt-6 grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
            <article className="rounded-[30px] border border-white/10 bg-white/[0.03] p-7">
              <div className="text-xs uppercase tracking-[0.2em] text-[#D6A66A]">Authenticated operator</div>
              <h2 className="mt-3 text-2xl font-semibold">{actor?.staff_name || "Current staff member"}</h2>
              <div className="mt-1 text-sm text-white/40">{actor?.role || actor?.staff_id || actor?.user_id || "Authenticated session"}</div>

              {!activeSession ? (
                <>
                  <label className="mt-8 block text-xs uppercase tracking-[0.2em] text-white/40">Opening float</label>
                  <input type="number" min="0" step="0.01" value={openingFloat} onChange={(event) => setOpeningFloat(event.target.value)} className="mt-2 w-full rounded-xl border border-white/10 bg-black px-4 py-4 text-xl" />
                  <button onClick={() => execute("OPEN", null)} disabled={Boolean(actionLoading) || !entityId} className="mt-5 w-full rounded-2xl bg-[#D6A66A] py-4 text-sm font-semibold text-black disabled:opacity-40">{actionLoading === "OPEN:new" ? "Opening..." : "Open Cash Session"}</button>
                </>
              ) : (
                <>
                  <div className="mt-7 rounded-2xl border border-emerald-400/20 bg-emerald-400/[0.06] p-5">
                    <div className="text-xs uppercase tracking-[0.2em] text-emerald-200/60">Active cash session</div>
                    <div className="mt-2 break-all text-sm font-semibold">{activeSession.session_id || activeSession.id}</div>
                    <div className="mt-2 text-xs text-white/40">Opened {activeSession.opened_at ? new Date(activeSession.opened_at).toLocaleString() : ""}</div>
                  </div>
                  <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    <Stat label="Opening float" value={activeSession.opening_float} currencyCode={currencyCode} />
                    <Stat label="Cash sales" value={activeSession.cash_total} currencyCode={currencyCode} />
                    <Stat label="Expected cash" value={activeExpectedCash} currencyCode={currencyCode} emphasis />
                    <Stat label="Cash in" value={activeSession.paid_in_total} currencyCode={currencyCode} />
                    <Stat label="Cash out" value={activeSession.paid_out_total} currencyCode={currencyCode} />
                    <Stat label="Adjustment in" value={activeSession.adjustment_in_total} currencyCode={currencyCode} />
                    <Stat label="Adjustment out" value={activeSession.adjustment_out_total} currencyCode={currencyCode} />
                    <Stat label="Refunds" value={activeSession.refund_total} currencyCode={currencyCode} />
                    <Stat label="Reversals" value={activeSession.reversal_total} currencyCode={currencyCode} />
                    <Stat label="Card" value={activeSession.card_total} currencyCode={currencyCode} />
                    <Stat label="QR" value={activeSession.qr_total} currencyCode={currencyCode} />
                    <Stat label="Transfer" value={activeSession.transfer_total} currencyCode={currencyCode} />
                  </div>
                  <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-4">
                    <div className="flex items-center justify-between gap-4"><span className="text-xs uppercase tracking-[0.18em] text-white/35">Net settled sales</span><span className="text-xl font-semibold">{formatMoney(activeSession.net_sales, currencyCode)}</span></div>
                  </div>
                  <label className="mt-6 block text-xs uppercase tracking-[0.2em] text-white/40">Closing cash count</label>
                  <input type="number" min="0" step="0.01" value={closingCount} onChange={(event) => setClosingCount(event.target.value)} className="mt-2 w-full rounded-xl border border-white/10 bg-black px-4 py-4 text-xl" />
                  <div className="mt-3 flex items-center justify-between rounded-xl border border-white/10 px-4 py-3 text-sm"><span className="text-white/45">Live variance preview</span><span className={varianceClass(numeric(closingCount) - activeExpectedCash)}>{formatMoney(numeric(closingCount) - activeExpectedCash, currencyCode)}</span></div>
                  <button onClick={() => execute("CLOSE", activeSession)} disabled={Boolean(actionLoading)} className="mt-5 w-full rounded-2xl border border-red-400/30 bg-red-500/10 py-4 text-sm font-semibold text-red-100 disabled:opacity-40">{actionLoading?.startsWith("CLOSE:") ? "Reconciling..." : "Reconcile & Close Cash Session"}</button>
                </>
              )}
            </article>

            <article className="rounded-[30px] border border-white/10 bg-white/[0.03] p-7">
              <div className="text-xs uppercase tracking-[0.2em] text-white/40">Reconciliation & governance history</div>
              <div className="mt-5 max-h-[820px] space-y-4 overflow-y-auto pr-1">
                {sessions.length ? sessions.map((session) => {
                  const sessionId = session.session_id || session.id;
                  const closed = String(session.status || "").toUpperCase() === "CLOSED";
                  const approvalStatus = String(session.approval_status || "PENDING").toUpperCase();
                  const accountingStatus = String(session.accounting_status || "PENDING").toUpperCase();
                  const notes = sessionNotes(session);
                  const reviewing = Boolean(actionLoading?.endsWith(`:${sessionId}`));
                  return (
                    <div key={sessionId} className="rounded-2xl border border-white/10 bg-black/20 p-5">
                      <div className="flex items-start justify-between gap-3">
                        <div><div className="font-medium">{session.staff_name || "Staff"}</div><div className="mt-1 break-all text-[10px] text-white/30">{sessionId}</div></div>
                        <div className={closed ? "text-xs text-white/40" : "text-xs text-emerald-300"}>{session.status}</div>
                      </div>
                      <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-xs text-white/50">
                        <div>Open {formatMoney(session.opening_float, currencyCode)}</div>
                        <div>Cash {formatMoney(session.cash_total, currencyCode)}</div>
                        <div>Cash in {formatMoney(session.paid_in_total, currencyCode)}</div>
                        <div>Cash out {formatMoney(session.paid_out_total, currencyCode)}</div>
                        <div>Adjustment in {formatMoney(session.adjustment_in_total, currencyCode)}</div>
                        <div>Adjustment out {formatMoney(session.adjustment_out_total, currencyCode)}</div>
                        <div>Refunds {formatMoney(session.refund_total, currencyCode)}</div>
                        <div>Reversals {formatMoney(session.reversal_total, currencyCode)}</div>
                        <div>Card {formatMoney(session.card_total, currencyCode)}</div>
                        <div>QR {formatMoney(session.qr_total, currencyCode)}</div>
                        <div>Transfer {formatMoney(session.transfer_total, currencyCode)}</div>
                        <div>Net sales {formatMoney(session.net_sales, currencyCode)}</div>
                      </div>

                      {closed ? (
                        <>
                          <div className="mt-4 border-t border-white/10 pt-4">
                            <div className="grid grid-cols-2 gap-2 text-sm">
                              <div className="text-white/45">Expected cash</div><div className="text-right">{formatMoney(session.expected_cash, currencyCode)}</div>
                              <div className="text-white/45">Counted cash</div><div className="text-right">{formatMoney(session.closing_count, currencyCode)}</div>
                              <div className="text-white/45">Variance</div><div className={`text-right font-semibold ${varianceClass(session.variance)}`}>{formatMoney(session.variance, currencyCode)}</div>
                            </div>
                            {session.closed_by_name ? <div className="mt-3 text-[11px] text-white/30">Reconciled by {session.closed_by_name}</div> : null}
                          </div>
                          <div className="mt-4 grid grid-cols-2 gap-2"><StatusBadge label="Manager review" status={approvalStatus} /><StatusBadge label="Accounting" status={accountingStatus} /></div>
                          {session.review_log ? <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.025] p-3 text-xs text-white/45"><div>Reviewed by {session.review_log.acted_by_name || session.review_log.role || "authorized manager"}</div>{session.review_log.notes ? <div className="mt-1 text-white/60">{session.review_log.notes}</div> : null}</div> : null}

                          {approvalStatus === "PENDING" && actor?.can_review ? (
                            <div className="mt-4 rounded-2xl border border-amber-300/15 bg-amber-300/[0.035] p-4">
                              <div className="flex items-center gap-2 text-xs font-semibold text-amber-100"><ShieldCheck size={15} /> Manager review</div>
                              <textarea value={notes} onChange={(event) => updateSessionNotes(session, event.target.value)} placeholder="Review note or rejection reason" rows={2} className="mt-3 w-full resize-none rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm outline-none" />
                              <div className="mt-3 grid grid-cols-2 gap-2">
                                <button type="button" disabled={reviewing} onClick={() => execute("APPROVE", session)} className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-400 px-3 py-2.5 text-xs font-semibold text-black disabled:opacity-40"><CheckCircle2 size={14} /> Approve</button>
                                <button type="button" disabled={reviewing || !notes.trim()} onClick={() => execute("REJECT", session)} className="inline-flex items-center justify-center gap-2 rounded-xl border border-red-400/30 bg-red-500/10 px-3 py-2.5 text-xs font-semibold text-red-100 disabled:opacity-40"><XCircle size={14} /> Reject</button>
                              </div>
                            </div>
                          ) : null}

                          {approvalStatus === "APPROVED" && accountingStatus === "PENDING" ? (
                            <div className="mt-4 rounded-2xl border border-cyan-300/15 bg-cyan-300/[0.035] p-4">
                              <div className="flex items-center gap-2 text-xs font-semibold text-cyan-100"><ShieldCheck size={15} /> Finance confirmation</div>
                              {session.approved_by_name ? <div className="mt-2 text-[11px] text-white/35">Approved by {session.approved_by_name}</div> : null}
                              {financeCanConfirm ? (
                                <>
                                  <textarea value={notes} onChange={(event) => updateSessionNotes(session, event.target.value)} placeholder="Accounting confirmation note" rows={2} className="mt-3 w-full resize-none rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm outline-none" />
                                  <button type="button" disabled={reviewing} onClick={() => confirmAccounting(session)} className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-cyan-300 px-3 py-2.5 text-xs font-semibold text-black disabled:opacity-40"><LockKeyhole size={14} /> Confirm Accounting & Lock</button>
                                </>
                              ) : <div className="mt-3 text-xs leading-5 text-white/40">Awaiting a Finance-authorized user with finance.close.execute.</div>}
                            </div>
                          ) : null}

                          {approvalStatus === "REJECTED" || accountingStatus === "BLOCKED" ? <div className="mt-4 rounded-xl border border-red-400/20 bg-red-500/[0.06] p-3 text-xs text-red-100">Reconciliation is blocked. A rejected drawer cannot proceed to accounting confirmation.</div> : null}
                          {session.period_closed && accountingStatus === "CONFIRMED" ? <div className="mt-4 rounded-xl border border-emerald-400/20 bg-emerald-400/[0.06] p-3 text-xs text-emerald-100"><div className="flex items-center gap-2 font-semibold"><LockKeyhole size={14} /> Final accounting lock</div><div className="mt-1 text-emerald-100/60">Finance posting evidence verified. This POS session is final.{session.variance_journal_entry_id ? " Cash over/short variance was posted to Finance." : ""}{session.accounting_confirmed_by_name ? ` Confirmed by ${session.accounting_confirmed_by_name}.` : ""}</div></div> : null}
                        </>
                      ) : null}
                    </div>
                  );
                }) : <div className="rounded-2xl border border-white/10 p-5 text-sm text-white/35">No POS cash sessions found.</div>}
              </div>
            </article>

            <POSPaymentCorrectionsPanel
              organizationId={organizationId}
              entityId={entityId}
              applicationId={applicationId}
              currencyCode={currencyCode}
              activeSessionId={activeSession?.session_id || activeSession?.id || null}
              onChanged={loadSessions}
            />
          </section>
        )}
      </div>
    </main>
  );
}