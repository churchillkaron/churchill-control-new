"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { RotateCcw, ShieldCheck, Undo2, X } from "lucide-react";
import { useParams } from "next/navigation";

import { useBusinessContext } from "@/app/providers/BusinessContextProvider";

function text(value) {
  return String(value ?? "").trim();
}

function money(value, currencyCode) {
  const amount = Number(value || 0);
  try {
    return new Intl.NumberFormat(
      undefined,
      currencyCode
        ? {
            style: "currency",
            currency: currencyCode,
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          }
        : { minimumFractionDigits: 2, maximumFractionDigits: 2 },
    ).format(amount);
  } catch {
    return amount.toFixed(2);
  }
}

function paymentTitle(payment) {
  return (
    payment?.document_number ||
    payment?.payment_reference ||
    payment?.source_document ||
    `Payment ${String(payment?.id || "").slice(0, 8)}`
  );
}

export default function RestaurantPaymentCorrections({
  posConfiguration,
  refreshKey = 0,
  onCorrected,
}) {
  const params = useParams();
  const businessContext = useBusinessContext() || {};
  const organization = businessContext.organization || null;
  const organizationId = text(
    params?.organizationId || businessContext.organization_id || organization?.id,
  );
  const entityId = text(businessContext.entity_id || businessContext.entity?.id);
  const applicationId = text(posConfiguration?.applicationId) || "restaurant";
  const currencyCode =
    businessContext.entity?.currency ||
    businessContext.entity?.currency_code ||
    organization?.currency_code ||
    organization?.currency ||
    businessContext.currency ||
    null;

  const [state, setState] = useState(null);
  const [open, setOpen] = useState(false);
  const [selectedPaymentId, setSelectedPaymentId] = useState(null);
  const [action, setAction] = useState("REFUND");
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState(null);

  const load = useCallback(async () => {
    if (!organizationId || !entityId) {
      setState(null);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const query = new URLSearchParams({
        organizationId,
        entityId,
        applicationId,
      });
      const response = await fetch(`/api/pos/payment-corrections?${query.toString()}`, {
        cache: "no-store",
        credentials: "include",
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result.success === false) {
        if ([403, 501].includes(response.status)) {
          setState(null);
          return;
        }
        throw new Error(result.error || "Unable to load payment corrections");
      }
      setState(result);
    } catch (loadError) {
      setError(loadError?.message || "Unable to load payment corrections");
    } finally {
      setLoading(false);
    }
  }, [applicationId, entityId, organizationId]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  const eligiblePayments = useMemo(
    () => (state?.payments || []).filter((payment) => payment.eligible),
    [state],
  );
  const selectedPayment = eligiblePayments.find((payment) => payment.id === selectedPaymentId) || null;
  const canCorrect = Boolean(
    state?.actor?.can_correct &&
      state?.actor?.staff_id &&
      state?.active_cash_session?.id &&
      eligiblePayments.length,
  );

  if (!loading && !canCorrect && !open) return null;

  function begin() {
    if (!canCorrect) return;
    setSelectedPaymentId(eligiblePayments[0]?.id || null);
    setAction("REFUND");
    setReason("");
    setError(null);
    setMessage(null);
    setOpen(true);
  }

  async function submitCorrection() {
    if (!selectedPayment || !reason.trim() || !state?.active_cash_session?.id) return;
    setSubmitting(true);
    setError(null);
    setMessage(null);
    try {
      const idempotencyKey = `restaurant-payment-correction:${selectedPayment.id}:${action}:${crypto.randomUUID()}`;
      const response = await fetch("/api/pos/payment-corrections", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify({
          organizationId,
          entityId,
          applicationId,
          cashSessionId: state.active_cash_session.id,
          paymentId: selectedPayment.id,
          correctionType: action,
          reason: reason.trim(),
          idempotencyKey,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result.success === false) {
        throw new Error(result.error || "Payment correction failed");
      }
      setMessage(
        result.dispatch_pending
          ? `${action === "REFUND" ? "Refund" : "Reversal"} recorded · downstream posting pending`
          : `${action === "REFUND" ? "Refund" : "Reversal"} recorded`,
      );
      setOpen(false);
      setReason("");
      setSelectedPaymentId(null);
      await load();
      onCorrected?.(result);
    } catch (submitError) {
      setError(submitError?.message || "Payment correction failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section
      className="mt-3 rounded-[22px] border border-white/10 bg-white/[0.025] p-3"
      data-restaurant-payment-corrections="true"
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-[9px] font-semibold uppercase tracking-[0.16em] text-[#D6A66A]">
            <ShieldCheck size={13} /> Manager corrections
          </div>
          <div className="mt-1 text-xs text-white/45">
            Cash refunds and reversals · original payment remains in the audit trail.
          </div>
        </div>
        <button
          type="button"
          disabled={!canCorrect || loading}
          onClick={begin}
          className="rounded-xl bg-[#25231F] px-3 py-2 text-[10px] font-semibold text-white disabled:opacity-30"
        >
          Correct payment
        </button>
      </div>

      {message ? (
        <div className="mt-2 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.06] px-3 py-2 text-[11px] text-emerald-700">
          {message}
        </div>
      ) : null}
      {error && !open ? (
        <div className="mt-2 rounded-xl border border-red-500/20 bg-red-500/[0.06] px-3 py-2 text-[11px] text-red-700">
          {error}
        </div>
      ) : null}

      {open ? (
        <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-[520px] rounded-[24px] border border-white/10 bg-[#090909] p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#D6A66A]">Manager authority</div>
                <h2 className="mt-1 text-lg font-semibold text-white">Refund or reverse cash payment</h2>
                <p className="mt-1 text-xs text-white/40">Full payment only. A reason is mandatory and the original payment is never deleted.</p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-xl border border-white/10 p-2 text-white/45"
                aria-label="Close payment correction"
              >
                <X size={16} />
              </button>
            </div>

            <div className="mt-5 space-y-4">
              <label className="block">
                <span className="text-[9px] font-semibold uppercase tracking-[0.15em] text-white/35">Payment</span>
                <select
                  value={selectedPaymentId || ""}
                  onChange={(event) => setSelectedPaymentId(event.target.value || null)}
                  className="mt-1.5 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-xs text-white"
                >
                  {eligiblePayments.map((payment) => (
                    <option key={payment.id} value={payment.id}>
                      {paymentTitle(payment)} · {money(payment.amount, payment.currency || currencyCode)}
                    </option>
                  ))}
                </select>
              </label>

              <div>
                <div className="text-[9px] font-semibold uppercase tracking-[0.15em] text-white/35">Correction</div>
                <div className="mt-1.5 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setAction("REFUND")}
                    className={action === "REFUND"
                      ? "flex items-center justify-center gap-2 rounded-xl bg-[#D6A66A] px-3 py-2.5 text-xs font-bold text-black"
                      : "flex items-center justify-center gap-2 rounded-xl border border-white/10 px-3 py-2.5 text-xs text-white/50"}
                  >
                    <RotateCcw size={14} /> Refund
                  </button>
                  <button
                    type="button"
                    onClick={() => setAction("REVERSAL")}
                    className={action === "REVERSAL"
                      ? "flex items-center justify-center gap-2 rounded-xl bg-[#D6A66A] px-3 py-2.5 text-xs font-bold text-black"
                      : "flex items-center justify-center gap-2 rounded-xl border border-white/10 px-3 py-2.5 text-xs text-white/50"}
                  >
                    <Undo2 size={14} /> Reverse
                  </button>
                </div>
              </div>

              {selectedPayment ? (
                <div className="rounded-xl border border-white/10 bg-white/[0.025] p-3">
                  <div className="text-[9px] uppercase tracking-[0.14em] text-white/30">Original cash payment</div>
                  <div className="mt-1 flex items-end justify-between gap-3">
                    <div className="text-xs text-white/55">{paymentTitle(selectedPayment)}</div>
                    <div className="text-lg font-semibold text-white">{money(selectedPayment.amount, selectedPayment.currency || currencyCode)}</div>
                  </div>
                </div>
              ) : null}

              <label className="block">
                <span className="text-[9px] font-semibold uppercase tracking-[0.15em] text-white/35">Required reason</span>
                <textarea
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  rows={3}
                  placeholder="Why is this payment being corrected?"
                  className="mt-1.5 w-full resize-none rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-xs text-white outline-none"
                />
              </label>

              {error ? (
                <div className="rounded-xl border border-red-400/20 bg-red-500/10 px-3 py-2 text-xs text-red-100">{error}</div>
              ) : null}

              <button
                type="button"
                disabled={!selectedPayment || !reason.trim() || submitting}
                onClick={submitCorrection}
                className="w-full rounded-xl bg-[#25231F] px-4 py-3 text-xs font-semibold text-white disabled:opacity-30"
              >
                {submitting ? "Recording correction..." : `Record ${action === "REFUND" ? "refund" : "reversal"}`}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
