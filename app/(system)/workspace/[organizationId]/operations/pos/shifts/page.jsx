"use client";

export const dynamic = "force-dynamic";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { useBusinessContext } from "@/app/providers/BusinessContextProvider";

function numeric(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatMoney(value, currencyCode) {
  const amount = numeric(value);
  try {
    return new Intl.NumberFormat(
      undefined,
      currencyCode
        ? { style: "currency", currency: currencyCode }
        : { minimumFractionDigits: 2, maximumFractionDigits: 2 }
    ).format(amount);
  } catch {
    return amount.toFixed(2);
  }
}

function varianceClass(value) {
  const variance = numeric(value);
  if (Math.abs(variance) <= 0.01) return "text-emerald-300";
  return variance < 0 ? "text-red-300" : "text-amber-300";
}

function Stat({ label, value, currencyCode, emphasis = false }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
      <div className="text-[10px] uppercase tracking-[0.18em] text-white/35">
        {label}
      </div>
      <div className={emphasis ? "mt-2 text-xl font-semibold text-[#E2C48A]" : "mt-2 text-lg font-semibold"}>
        {formatMoney(value, currencyCode)}
      </div>
    </div>
  );
}

export default function ShiftPage({ posConfiguration }) {
  const params = useParams();
  const businessContext = useBusinessContext() || {};
  const organization = businessContext.organization || null;
  const organizationId =
    params?.organizationId ||
    businessContext.organization_id ||
    organization?.id ||
    null;
  const entityId =
    businessContext.entity_id ||
    businessContext.entity?.id ||
    null;
  const applicationId = posConfiguration?.applicationId || null;
  const currencyCode =
    businessContext.entity?.currency ||
    businessContext.entity?.currency_code ||
    organization?.currency_code ||
    organization?.currency ||
    businessContext.currency ||
    null;
  const configuredPresentation = posConfiguration?.presentation || {};

  const [presentation, setPresentation] = useState(configuredPresentation);
  const [actor, setActor] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [activeSession, setActiveSession] = useState(null);
  const [openingFloat, setOpeningFloat] = useState("0");
  const [closingCount, setClosingCount] = useState("0");
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState(null);

  const activeExpectedCash = useMemo(() => {
    if (!activeSession) return 0;
    return numeric(activeSession.opening_float) + numeric(activeSession.cash_total);
  }, [activeSession]);

  const loadSessions = useCallback(async () => {
    if (!organizationId) return;

    if (!entityId) {
      setError("Select an active legal entity before cash control");
      setSessions([]);
      setActiveSession(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const search = new URLSearchParams({ organizationId, entityId });
      if (applicationId) search.set("applicationId", applicationId);

      const response = await fetch(
        `/api/pos/cash-sessions?${search.toString()}`,
        { cache: "no-store", credentials: "include" }
      );
      const result = await response.json();
      if (!response.ok || result.success === false) {
        throw new Error(result.error || "Unable to load cash sessions");
      }

      setPresentation({
        ...configuredPresentation,
        ...(result.presentation || {}),
      });
      setActor(result.actor || null);
      setSessions(result.sessions || []);
      setActiveSession(result.active_session || null);
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  }, [applicationId, configuredPresentation, entityId, organizationId]);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  async function execute(action) {
    setActionLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/pos/cash-sessions", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          organizationId,
          entityId,
          ...(applicationId ? { applicationId } : {}),
          sessionId: activeSession?.session_id || activeSession?.id || null,
          openingFloat: numeric(openingFloat),
          closingCount: numeric(closingCount),
        }),
      });
      const result = await response.json();
      if (!response.ok || result.success === false) {
        throw new Error(result.error || "Cash session action failed");
      }

      if (action === "OPEN") setClosingCount("0");
      if (action === "CLOSE") setOpeningFloat("0");
      await loadSessions();
    } catch (actionError) {
      setError(actionError.message);
    } finally {
      setActionLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-black px-6 py-8 text-white">
      <div className="mx-auto max-w-[1400px]">
        <header className="rounded-[34px] border border-white/10 bg-white/[0.035] p-7">
          <div className="flex flex-wrap items-start justify-between gap-5">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-[#D6A66A]">
                {presentation.cashControlEyebrow || "Commerce Operations"}
              </p>
              <h1 className="mt-3 text-4xl font-semibold">POS Cash Control</h1>
              <p className="mt-2 text-sm text-white/45">
                Controlled drawer opening, tender reconciliation, expected cash and variance.
              </p>
            </div>
            <button
              onClick={loadSessions}
              className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-4 py-2 text-sm text-white/60"
            >
              <RefreshCw size={15} /> Refresh
            </button>
          </div>
          {error ? (
            <div className="mt-5 rounded-2xl border border-red-400/20 bg-red-500/10 p-4 text-sm text-red-100">
              {error}
            </div>
          ) : null}
        </header>

        {loading ? (
          <div className="mt-6 rounded-3xl border border-white/10 p-10 text-center text-white/35">
            Loading cash control...
          </div>
        ) : (
          <section className="mt-6 grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
            <article className="rounded-[30px] border border-white/10 bg-white/[0.03] p-7">
              <div className="text-xs uppercase tracking-[0.2em] text-[#D6A66A]">
                Authenticated operator
              </div>
              <h2 className="mt-3 text-2xl font-semibold">
                {actor?.staff_name || "Current staff member"}
              </h2>
              <div className="mt-1 text-sm text-white/40">
                {actor?.staff_id || actor?.user_id || "Authenticated session"}
              </div>

              {!activeSession ? (
                <>
                  <label className="mt-8 block text-xs uppercase tracking-[0.2em] text-white/40">
                    Opening float
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={openingFloat}
                    onChange={(event) => setOpeningFloat(event.target.value)}
                    className="mt-2 w-full rounded-xl border border-white/10 bg-black px-4 py-4 text-xl"
                  />
                  <button
                    onClick={() => execute("OPEN")}
                    disabled={actionLoading || !entityId}
                    className="mt-5 w-full rounded-2xl bg-[#D6A66A] py-4 text-sm font-semibold text-black disabled:opacity-40"
                  >
                    {actionLoading ? "Opening..." : "Open Cash Session"}
                  </button>
                </>
              ) : (
                <>
                  <div className="mt-7 rounded-2xl border border-emerald-400/20 bg-emerald-400/[0.06] p-5">
                    <div className="text-xs uppercase tracking-[0.2em] text-emerald-200/60">
                      Active cash session
                    </div>
                    <div className="mt-2 text-sm font-semibold break-all">
                      {activeSession.session_id || activeSession.id}
                    </div>
                    <div className="mt-2 text-xs text-white/40">
                      Opened {activeSession.opened_at ? new Date(activeSession.opened_at).toLocaleString() : ""}
                    </div>
                  </div>

                  <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    <Stat label="Opening float" value={activeSession.opening_float} currencyCode={currencyCode} />
                    <Stat label="Cash sales" value={activeSession.cash_total} currencyCode={currencyCode} />
                    <Stat label="Expected cash" value={activeExpectedCash} currencyCode={currencyCode} emphasis />
                    <Stat label="Card" value={activeSession.card_total} currencyCode={currencyCode} />
                    <Stat label="QR" value={activeSession.qr_total} currencyCode={currencyCode} />
                    <Stat label="Transfer" value={activeSession.transfer_total} currencyCode={currencyCode} />
                  </div>

                  <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-4">
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-xs uppercase tracking-[0.18em] text-white/35">Net settled sales</span>
                      <span className="text-xl font-semibold">{formatMoney(activeSession.net_sales, currencyCode)}</span>
                    </div>
                  </div>

                  <label className="mt-6 block text-xs uppercase tracking-[0.2em] text-white/40">
                    Closing cash count
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={closingCount}
                    onChange={(event) => setClosingCount(event.target.value)}
                    className="mt-2 w-full rounded-xl border border-white/10 bg-black px-4 py-4 text-xl"
                  />

                  <div className="mt-3 flex items-center justify-between rounded-xl border border-white/10 px-4 py-3 text-sm">
                    <span className="text-white/45">Live variance preview</span>
                    <span className={varianceClass(numeric(closingCount) - activeExpectedCash)}>
                      {formatMoney(numeric(closingCount) - activeExpectedCash, currencyCode)}
                    </span>
                  </div>

                  <button
                    onClick={() => execute("CLOSE")}
                    disabled={actionLoading}
                    className="mt-5 w-full rounded-2xl border border-red-400/30 bg-red-500/10 py-4 text-sm font-semibold text-red-100 disabled:opacity-40"
                  >
                    {actionLoading ? "Reconciling..." : "Reconcile & Close Cash Session"}
                  </button>
                </>
              )}
            </article>

            <article className="rounded-[30px] border border-white/10 bg-white/[0.03] p-7">
              <div className="text-xs uppercase tracking-[0.2em] text-white/40">
                Recent cash sessions
              </div>
              <div className="mt-5 max-h-[760px] space-y-3 overflow-y-auto">
                {sessions.length ? (
                  sessions.map((session) => {
                    const closed = String(session.status || "").toUpperCase() === "CLOSED";
                    return (
                      <div
                        key={session.session_id || session.id}
                        className="rounded-2xl border border-white/10 bg-black/20 p-4"
                      >
                        <div className="flex justify-between gap-3">
                          <div>
                            <div className="font-medium">{session.staff_name || "Staff"}</div>
                            <div className="mt-1 text-[10px] text-white/30 break-all">
                              {session.session_id || session.id}
                            </div>
                          </div>
                          <div className={closed ? "text-xs text-white/40" : "text-xs text-emerald-300"}>
                            {session.status}
                          </div>
                        </div>

                        <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-xs text-white/50">
                          <div>Open {formatMoney(session.opening_float, currencyCode)}</div>
                          <div>Cash {formatMoney(session.cash_total, currencyCode)}</div>
                          <div>Card {formatMoney(session.card_total, currencyCode)}</div>
                          <div>QR {formatMoney(session.qr_total, currencyCode)}</div>
                          <div>Transfer {formatMoney(session.transfer_total, currencyCode)}</div>
                          <div>Sales {formatMoney(session.net_sales, currencyCode)}</div>
                        </div>

                        {closed ? (
                          <div className="mt-4 border-t border-white/10 pt-4">
                            <div className="grid grid-cols-2 gap-2 text-sm">
                              <div className="text-white/45">Expected cash</div>
                              <div className="text-right">{formatMoney(session.expected_cash, currencyCode)}</div>
                              <div className="text-white/45">Counted cash</div>
                              <div className="text-right">{formatMoney(session.closing_count, currencyCode)}</div>
                              <div className="text-white/45">Variance</div>
                              <div className={`text-right font-semibold ${varianceClass(session.variance)}`}>
                                {formatMoney(session.variance, currencyCode)}
                              </div>
                            </div>
                            {session.closed_by_name ? (
                              <div className="mt-3 text-[11px] text-white/30">
                                Closed by {session.closed_by_name}
                              </div>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    );
                  })
                ) : (
                  <div className="rounded-2xl border border-white/10 p-5 text-sm text-white/35">
                    No POS cash sessions found.
                  </div>
                )}
              </div>
            </article>
          </section>
        )}
      </div>
    </main>
  );
}
