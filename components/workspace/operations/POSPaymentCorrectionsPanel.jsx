"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw, RotateCcw, Undo2 } from "lucide-react";
import POSCashMovementsPanel from "@/components/workspace/operations/POSCashMovementsPanel";

function numeric(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatMoney(value, currencyCode) {
  try {
    return new Intl.NumberFormat(
      undefined,
      currencyCode
        ? { style: "currency", currency: currencyCode }
        : { minimumFractionDigits: 2, maximumFractionDigits: 2 }
    ).format(numeric(value));
  } catch {
    return numeric(value).toFixed(2);
  }
}

async function readJson(response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { success: false, error: text };
  }
}

export default function POSPaymentCorrectionsPanel({
  organizationId,
  entityId,
  applicationId,
  currencyCode,
  activeSessionId,
  onChanged,
}) {
  const [actor, setActor] = useState(null);
  const [payments, setPayments] = useState([]);
  const [corrections, setCorrections] = useState([]);
  const [reasonByPayment, setReasonByPayment] = useState({});
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(null);
  const [error, setError] = useState(null);

  const eligiblePayments = useMemo(
    () => payments.filter((payment) => payment.eligible && !payment.corrected),
    [payments]
  );

  const load = useCallback(async () => {
    if (!organizationId || !entityId || !applicationId) return;
    setLoading(true);
    setError(null);
    try {
      const search = new URLSearchParams({
        organizationId,
        entityId,
        applicationId,
      });
      const response = await fetch(
        `/api/pos/payment-corrections?${search.toString()}`,
        {
          cache: "no-store",
          credentials: "include",
        }
      );
      const result = await readJson(response);
      if (!response.ok || result.success === false) {
        throw new Error(result.error || "Unable to load payment corrections");
      }
      setActor(result.actor || null);
      setPayments(result.payments || []);
      setCorrections(result.corrections || []);
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  }, [applicationId, entityId, organizationId]);

  useEffect(() => {
    load();
  }, [load]);

  async function execute(payment, correctionType) {
    const reason = String(reasonByPayment[payment.id] || "").trim();
    if (!reason) {
      setError("A refund or reversal reason is required.");
      return;
    }
    if (!activeSessionId) {
      setError("Open a cash session before paying a refund or reversal.");
      return;
    }

    const key = `${correctionType}:${payment.id}`;
    setActionLoading(key);
    setError(null);
    try {
      const response = await fetch("/api/pos/payment-corrections", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": `pos-correction:${correctionType.toLowerCase()}:${payment.id}:${crypto.randomUUID()}`,
        },
        body: JSON.stringify({
          organizationId,
          entityId,
          applicationId,
          cashSessionId: activeSessionId,
          paymentId: payment.id,
          correctionType,
          reason,
        }),
      });
      const result = await readJson(response);
      if (!response.ok || result.success === false) {
        throw new Error(result.error || "Payment correction failed");
      }
      setReasonByPayment((current) => ({ ...current, [payment.id]: "" }));
      await load();
      await onChanged?.();
    } catch (actionError) {
      setError(actionError.message);
    } finally {
      setActionLoading(null);
    }
  }

  return (
    <>
      <POSCashMovementsPanel
        organizationId={organizationId}
        entityId={entityId}
        applicationId={applicationId}
        currencyCode={currencyCode}
        activeSessionId={activeSessionId}
        onChanged={onChanged}
      />

      <article className="rounded-[30px] border border-white/10 bg-white/[0.03] p-7 xl:col-span-2">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-[0.2em] text-[#D6A66A]">
              Payment corrections
            </div>
            <h2 className="mt-2 text-2xl font-semibold">Refunds & reversals</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-white/40">
              Full settled cash sales only. The original sale and payment remain immutable; the correction creates linked Finance reversal journals and the cash payout is charged to the currently open drawer.
            </p>
          </div>
          <button
            type="button"
            onClick={load}
            className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-4 py-2 text-sm text-white/55"
          >
            <RefreshCw size={14} /> Refresh
          </button>
        </div>

        <div className="mt-4 flex flex-wrap gap-2 text-[11px] text-white/40">
          <span className="rounded-full border border-white/10 px-3 py-1.5">Cash only</span>
          <span className="rounded-full border border-white/10 px-3 py-1.5">Full sale only</span>
          <span className="rounded-full border border-white/10 px-3 py-1.5">Manager / Owner approval</span>
          <span className="rounded-full border border-white/10 px-3 py-1.5">Original settlement preserved</span>
        </div>

        {error ? (
          <div className="mt-4 rounded-xl border border-red-400/20 bg-red-500/10 p-3 text-sm text-red-100">
            {error}
          </div>
        ) : null}

        {!activeSessionId ? (
          <div className="mt-5 rounded-2xl border border-amber-300/15 bg-amber-300/[0.04] p-4 text-sm text-amber-100/70">
            Open a cash session to pay out a refund or reversal. Closed historical drawers are never modified.
          </div>
        ) : null}

        {!actor?.can_correct ? (
          <div className="mt-5 rounded-2xl border border-white/10 p-4 text-sm text-white/40">
            Manager or owner authority is required to execute payment corrections.
          </div>
        ) : null}

        <div className="mt-6 grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
          <div>
            <div className="text-xs uppercase tracking-[0.18em] text-white/35">
              Eligible settled cash payments
            </div>
            <div className="mt-3 space-y-3">
              {loading ? (
                <div className="rounded-2xl border border-white/10 p-5 text-sm text-white/35">
                  Loading payments...
                </div>
              ) : eligiblePayments.length ? (
                eligiblePayments.map((payment) => {
                  const reason = reasonByPayment[payment.id] || "";
                  const busy = Boolean(actionLoading?.endsWith(`:${payment.id}`));
                  return (
                    <div
                      key={payment.id}
                      className="rounded-2xl border border-white/10 bg-black/20 p-4"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="font-semibold">
                            {payment.document_number ||
                              payment.payment_reference ||
                              `Payment ${String(payment.id).slice(0, 8)}`}
                          </div>
                          <div className="mt-1 text-[11px] text-white/30">
                            {payment.paid_at
                              ? new Date(payment.paid_at).toLocaleString()
                              : "Settled payment"}
                          </div>
                        </div>
                        <div className="text-lg font-semibold text-[#E2C48A]">
                          {formatMoney(
                            payment.amount,
                            payment.currency || currencyCode
                          )}
                        </div>
                      </div>
                      <textarea
                        value={reason}
                        onChange={(event) =>
                          setReasonByPayment((current) => ({
                            ...current,
                            [payment.id]: event.target.value,
                          }))
                        }
                        placeholder="Required reason — e.g. guest refund, duplicate charge, sale void"
                        rows={2}
                        className="mt-4 w-full resize-none rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm outline-none"
                      />
                      <div className="mt-3 grid gap-2 sm:grid-cols-2">
                        <button
                          type="button"
                          disabled={
                            busy ||
                            !activeSessionId ||
                            !actor?.can_correct ||
                            !reason.trim()
                          }
                          onClick={() => execute(payment, "REFUND")}
                          className="inline-flex items-center justify-center gap-2 rounded-xl bg-amber-300 px-3 py-2.5 text-xs font-semibold text-black disabled:opacity-35"
                        >
                          <RotateCcw size={14} /> Refund cash
                        </button>
                        <button
                          type="button"
                          disabled={
                            busy ||
                            !activeSessionId ||
                            !actor?.can_correct ||
                            !reason.trim()
                          }
                          onClick={() => execute(payment, "REVERSAL")}
                          className="inline-flex items-center justify-center gap-2 rounded-xl border border-red-400/30 bg-red-500/10 px-3 py-2.5 text-xs font-semibold text-red-100 disabled:opacity-35"
                        >
                          <Undo2 size={14} /> Reverse sale
                        </button>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="rounded-2xl border border-white/10 p-5 text-sm text-white/35">
                  No uncorrected settled cash payments found.
                </div>
              )}
            </div>
          </div>

          <div>
            <div className="text-xs uppercase tracking-[0.18em] text-white/35">
              Correction evidence
            </div>
            <div className="mt-3 max-h-[520px] space-y-3 overflow-y-auto pr-1">
              {corrections.length ? (
                corrections.map((correction) => (
                  <div
                    key={correction.id}
                    className="rounded-2xl border border-white/10 bg-black/20 p-4"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-xs font-semibold text-white/70">
                        {String(correction.correction_type || "").toUpperCase()}
                      </span>
                      <span className="font-semibold">
                        {formatMoney(
                          correction.amount,
                          correction.currency_code || currencyCode
                        )}
                      </span>
                    </div>
                    <div className="mt-2 text-xs leading-5 text-white/45">
                      {correction.reason}
                    </div>
                    <div className="mt-2 text-[10px] text-white/25">
                      {correction.created_at
                        ? new Date(correction.created_at).toLocaleString()
                        : correction.id}
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-2xl border border-white/10 p-5 text-sm text-white/35">
                  No refunds or reversals recorded.
                </div>
              )}
            </div>
          </div>
        </div>
      </article>
    </>
  );
}
