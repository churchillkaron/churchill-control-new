"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import {
  Banknote,
  CreditCard,
  Landmark,
  LoaderCircle,
  QrCode,
  RefreshCw,
  Split,
  Wallet,
} from "lucide-react";

import { useBusinessContext } from "@/app/providers/BusinessContextProvider";
import { splitBill } from "@/lib/payments/splitBill";
import usePOSRealtime from "@/lib/operations/commerce/realtime/usePOSRealtime";

const PAYMENT_OPTIONS = Object.freeze([
  { value: "CARD", label: "Card", icon: CreditCard },
  { value: "CASH", label: "Cash", icon: Wallet },
  { value: "QR", label: "QR", icon: QrCode },
  { value: "TRANSFER", label: "Transfer", icon: Landmark },
]);

function text(value) {
  return String(value ?? "").trim();
}

function roundMoney(value) {
  const amount = Number(value || 0);
  return Number.isFinite(amount) ? Number(amount.toFixed(2)) : 0;
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
        : {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          },
    ).format(amount);
  } catch {
    return amount.toFixed(2);
  }
}

function contextKey(context) {
  return text(context?.id) || `${text(context?.type) || "context"}:${text(context?.reference)}`;
}

function contextMatchesReference(context, preferredReference) {
  const preferred = text(preferredReference).toLowerCase();
  if (!preferred) return false;

  const values = [context?.id, context?.reference, context?.label]
    .map((value) => text(value).toLowerCase())
    .filter(Boolean);

  if (values.includes(preferred)) return true;
  return values.some((value) => value === `table ${preferred}`);
}

function itemAmount(item) {
  const remaining = Number(item?.remaining_amount);
  if (Number.isFinite(remaining)) return remaining;
  return Number(item?.price || 0) * Number(item?.quantity || 1);
}

function settlementRules(paymentState) {
  const settlement = paymentState?.settlement || null;
  const configured = Array.isArray(settlement?.payment_methods)
    ? settlement.payment_methods
    : [];

  return {
    blocked: settlement?.ready === false,
    blocker: settlement?.blocker || null,
    cashSessionId: settlement?.cash_session_id || null,
    itemSelectionAllowed: settlement?.item_selection_allowed !== false,
    partialAllowed: settlement?.partial_allowed !== false,
    paymentOptions: configured.length
      ? PAYMENT_OPTIONS.filter((option) => configured.includes(option.value))
      : PAYMENT_OPTIONS,
  };
}

function paymentLabel(paymentMethod) {
  return PAYMENT_OPTIONS.find((option) => option.value === paymentMethod)?.label || paymentMethod;
}

function cashPresetValues(amount, currencyCode) {
  const due = roundMoney(amount);
  if (due <= 0) return [];

  const currency = String(currencyCode || "").toUpperCase();
  const steps = currency === "THB" ? [100, 500, 1000] : [10, 20, 50];
  const values = [due];

  for (const step of steps) {
    const rounded = Math.ceil(due / step) * step;
    if (rounded >= due) values.push(rounded);
  }

  return [...new Set(values.map(roundMoney))].slice(0, 4);
}

export default function POSInlineCheckout({
  posConfiguration,
  onPaymentComplete,
  onRefresh,
  compact = false,
  preferredContextReference = null,
}) {
  const params = useParams();
  const businessContext = useBusinessContext() || {};
  const organization = businessContext.organization || null;
  const organizationId = text(
    params?.organizationId || businessContext.organization_id || organization?.id,
  );
  const entityId = text(
    businessContext.entity_id || businessContext.entity?.id,
  );
  const applicationId = text(posConfiguration?.applicationId) || null;
  const contextLabel = posConfiguration?.context?.singularLabel || "Check";
  const currencyCode =
    businessContext.entity?.currency ||
    businessContext.entity?.currency_code ||
    organization?.currency_code ||
    organization?.currency ||
    businessContext.currency ||
    null;

  const paymentRequestKey = useRef(null);
  const [contexts, setContexts] = useState([]);
  const [selectedContext, setSelectedContext] = useState(null);
  const [paymentState, setPaymentState] = useState(null);
  const [selectedItems, setSelectedItems] = useState([]);
  const [splitCount, setSplitCount] = useState(1);
  const [paymentMethod, setPaymentMethod] = useState("CARD");
  const [amount, setAmount] = useState("");
  const [cashTendered, setCashTendered] = useState("");
  const [mixedMode, setMixedMode] = useState(false);
  const [lastTender, setLastTender] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState(null);

  const loadContexts = useCallback(async () => {
    if (!organizationId) return [];

    const query = new URLSearchParams({ organizationId });
    if (entityId) query.set("entityId", entityId);
    if (applicationId) query.set("applicationId", applicationId);

    const response = await fetch(`/api/pos/payable-contexts?${query.toString()}`, {
      cache: "no-store",
      credentials: "include",
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result.success === false) {
      throw new Error(result.error || "Unable to load open checks");
    }

    const next = Array.isArray(result.contexts) ? result.contexts : [];
    setContexts(next);
    return next;
  }, [applicationId, entityId, organizationId]);

  const loadPaymentState = useCallback(async (context, { preserveDraft = false } = {}) => {
    if (!organizationId || !context) {
      setPaymentState(null);
      return null;
    }

    const response = await fetch("/api/pos/payment-state", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        organizationId,
        ...(entityId ? { entityId } : {}),
        ...(applicationId ? { applicationId } : {}),
        context,
      }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result.success === false) {
      throw new Error(result.error || "Unable to load check");
    }

    const nextState = result.state || null;
    const nextContext = result.context || context;
    setSelectedContext(nextContext);
    setPaymentState(nextState);

    if (preserveDraft) {
      const payableIds = new Set(
        (nextState?.items || [])
          .filter((item) => !item.fully_paid)
          .map((item) => item.id),
      );
      setSelectedItems((current) => current.filter((id) => payableIds.has(id)));
    } else {
      setSelectedItems([]);
      setSplitCount(1);
    }

    paymentRequestKey.current = null;
    return nextState;
  }, [applicationId, entityId, organizationId]);

  const load = useCallback(async ({ preserveSelection = true } = {}) => {
    if (!organizationId) return;
    setError(null);

    try {
      const nextContexts = await loadContexts();
      const currentKey = contextKey(selectedContext);
      const selectedEntry = preserveSelection && currentKey
        ? nextContexts.find(({ context }) => contextKey(context) === currentKey)
        : null;
      const requestedEntry = !selectedEntry && preferredContextReference
        ? nextContexts.find(({ context }) => contextMatchesReference(context, preferredContextReference))
        : null;
      const nextContext = selectedEntry?.context || requestedEntry?.context || nextContexts[0]?.context || null;

      if (!nextContext) {
        setSelectedContext(null);
        setPaymentState(null);
        setSelectedItems([]);
        setSplitCount(1);
        setMixedMode(false);
        setLastTender(null);
        paymentRequestKey.current = null;
        return;
      }

      await loadPaymentState(nextContext, { preserveDraft: Boolean(selectedEntry) });
    } catch (loadError) {
      setError(loadError?.message || "Unable to load checkout");
    }
  }, [loadContexts, loadPaymentState, organizationId, preferredContextReference, selectedContext]);

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      setLoading(true);
      await load({ preserveSelection: false });
      if (!cancelled) setLoading(false);
    }

    bootstrap();
    return () => {
      cancelled = true;
    };
  }, [organizationId, applicationId, preferredContextReference]);

  const realtimeStatus = usePOSRealtime({
    organizationId,
    applicationSubscriptions: posConfiguration?.realtimeSubscriptions || [],
    enabled: Boolean(organizationId),
    onChange: () => load({ preserveSelection: true }),
  });

  const rules = useMemo(() => settlementRules(paymentState), [paymentState]);
  const items = paymentState?.items || [];
  const unpaidItems = items.filter((item) => !item.fully_paid);
  const selectedRows = unpaidItems.filter((item) => selectedItems.includes(item.id));
  const selectedTotal = roundMoney(
    selectedRows.reduce((sum, item) => sum + itemAmount(item), 0),
  );
  const remainingBalance = roundMoney(paymentState?.remainingBalance || 0);
  const splitPreview = useMemo(
    () => splitBill({ remainingBalance }, splitCount),
    [remainingBalance, splitCount],
  );
  const suggestedAmount = selectedItems.length
    ? selectedTotal
    : splitCount > 1
      ? roundMoney(splitPreview.perPerson || 0)
      : remainingBalance;
  const numericAmount = roundMoney(amount);
  const numericTendered = roundMoney(cashTendered);
  const changeDue = paymentMethod === "CASH"
    ? roundMoney(Math.max(0, numericTendered - numericAmount))
    : 0;
  const mixedAvailable = rules.partialAllowed && rules.paymentOptions.length > 1;
  const cashPresets = useMemo(
    () => cashPresetValues(numericAmount, currencyCode),
    [currencyCode, numericAmount],
  );

  useEffect(() => {
    setAmount(suggestedAmount > 0 ? suggestedAmount.toFixed(2) : "");
  }, [suggestedAmount]);

  useEffect(() => {
    if (paymentMethod !== "CASH") {
      setCashTendered("");
      return;
    }
    setCashTendered((current) => {
      const currentAmount = roundMoney(current);
      return currentAmount >= numericAmount && currentAmount > 0
        ? current
        : numericAmount > 0
          ? numericAmount.toFixed(2)
          : "";
    });
  }, [numericAmount, paymentMethod]);

  useEffect(() => {
    if (rules.paymentOptions.some((option) => option.value === paymentMethod)) return;
    if (rules.paymentOptions[0]) setPaymentMethod(rules.paymentOptions[0].value);
  }, [paymentMethod, rules.paymentOptions]);

  async function chooseContext(context) {
    setLoading(true);
    setError(null);
    setMixedMode(false);
    setLastTender(null);
    try {
      await loadPaymentState(context);
    } catch (loadError) {
      setError(loadError?.message || "Unable to open check");
    } finally {
      setLoading(false);
    }
  }

  function toggleItem(item) {
    if (!rules.itemSelectionAllowed || item.fully_paid || actionLoading || mixedMode) return;
    paymentRequestKey.current = null;
    setSelectedItems((current) => current.includes(item.id)
      ? current.filter((id) => id !== item.id)
      : [...current, item.id]);
  }

  function enterMixedMode() {
    if (!mixedAvailable || actionLoading) return;
    paymentRequestKey.current = null;
    setSelectedItems([]);
    setSplitCount(1);
    setMixedMode(true);
    setLastTender(null);
    setAmount(remainingBalance > 0 ? remainingBalance.toFixed(2) : "");
  }

  function exitMixedMode() {
    if (actionLoading) return;
    paymentRequestKey.current = null;
    setMixedMode(false);
    setLastTender(null);
    setAmount(remainingBalance > 0 ? remainingBalance.toFixed(2) : "");
  }

  async function settle(paymentAmount, partial, itemIds = []) {
    const context = paymentState?.context || selectedContext;
    const paidAmount = roundMoney(paymentAmount);
    if (!context) return;
    if (!paidAmount || paidAmount <= 0) {
      setError("Payment amount must be greater than zero");
      return;
    }
    if (paidAmount > remainingBalance + 0.01) {
      setError("Payment amount cannot exceed the remaining check balance");
      return;
    }
    if (rules.blocked) {
      setError(rules.blocker || "Settlement is not ready");
      return;
    }
    if (partial && !rules.partialAllowed) {
      setError("Partial settlement is not allowed for this check");
      return;
    }

    const tenderedAmount = paymentMethod === "CASH" ? numericTendered : paidAmount;
    if (paymentMethod === "CASH" && tenderedAmount + 0.001 < paidAmount) {
      setError("Cash received must cover the payment amount");
      return;
    }

    if (!paymentRequestKey.current) paymentRequestKey.current = crypto.randomUUID();
    setActionLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/pos/payments/settle", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": paymentRequestKey.current,
        },
        body: JSON.stringify({
          organizationId,
          ...(entityId ? { entityId } : {}),
          ...(applicationId ? { applicationId } : {}),
          context,
          ...(context?.id ? { salesOrderId: context.id } : {}),
          ...(rules.cashSessionId ? { cashSessionId: rules.cashSessionId } : {}),
          partial,
          idempotencyKey: paymentRequestKey.current,
          paymentMethod,
          paidAmount,
          tenderedAmount,
          itemIds,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result.success === false) {
        throw new Error(result.error || "Payment failed");
      }

      const completedTender = {
        method: paymentMethod,
        paidAmount,
        tenderedAmount,
        changeDue: paymentMethod === "CASH"
          ? roundMoney(Math.max(0, tenderedAmount - paidAmount))
          : 0,
      };
      setLastTender(completedTender);
      setCashTendered("");
      paymentRequestKey.current = null;
      const fullyPaid = result.fullyPaid || roundMoney(result.remainingBalance || 0) <= 0;

      if (fullyPaid) {
        const orderId = result.orderId || paymentState?.orders?.[0]?.id || null;
        setMixedMode(false);
        await load({ preserveSelection: false });
        await onRefresh?.();
        onPaymentComplete?.({ orderId, result, context, tender: completedTender });
        return;
      }

      await loadPaymentState(context);
      await onRefresh?.();
    } catch (paymentError) {
      setError(paymentError?.message || "Payment failed");
    } finally {
      setActionLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[360px] items-center justify-center rounded-[26px] border border-white/10 bg-[#090909] text-sm text-white/45">
        <LoaderCircle size={18} className="mr-2 animate-spin text-[#D6A66A]" />
        Loading checkout...
      </div>
    );
  }

  const activeContext = paymentState?.context || selectedContext;

  return (
    <section
      className={`rounded-[26px] border border-white/10 bg-[#090909] text-white ${compact ? "p-4" : "p-5"}`}
      data-pos-inline-checkout="true"
      data-stationary-payment-rail="true"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#D6A66A]">Checkout</div>
          <div className="mt-1 text-lg font-semibold">Settle on this screen</div>
          <div className="mt-1 text-[11px] text-white/40">
            {realtimeStatus === "live" ? "Live check" : "Live sync with fallback refresh"}
          </div>
        </div>
        <button
          type="button"
          onClick={() => load({ preserveSelection: true })}
          className="rounded-xl border border-white/10 p-2 text-white/45 transition hover:text-white"
          aria-label="Refresh checkout"
        >
          <RefreshCw size={15} />
        </button>
      </div>

      {error ? (
        <div className="mt-4 rounded-xl border border-red-400/20 bg-red-500/10 px-3 py-2 text-xs text-red-100">
          {error}
        </div>
      ) : null}

      {!paymentState ? (
        <div className="mt-4">
          {contexts.length ? (
            <div className="space-y-2">
              {contexts.map((entry) => (
                <button
                  key={contextKey(entry.context)}
                  type="button"
                  onClick={() => chooseContext(entry.context)}
                  className="flex w-full items-center justify-between rounded-2xl border border-white/10 bg-white/[0.035] px-4 py-3 text-left transition hover:border-[#D6A66A]/40"
                >
                  <div>
                    <div className="text-sm font-semibold">{entry.context?.label || entry.context?.reference || contextLabel}</div>
                    <div className="mt-1 text-[11px] text-white/40">{entry.order_count || 0} order(s)</div>
                  </div>
                  <div className="text-sm font-semibold text-[#E9CF9A]">{money(entry.remaining_balance, currencyCode)}</div>
                </button>
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-white/10 px-4 py-8 text-center text-sm text-white/35">
              No unpaid checks.
            </div>
          )}
        </div>
      ) : (
        <div className="mt-4">
          {contexts.length > 1 ? (
            <select
              value={contextKey(activeContext)}
              onChange={(event) => {
                const entry = contexts.find(({ context }) => contextKey(context) === event.target.value);
                if (entry) chooseContext(entry.context);
              }}
              className="w-full rounded-xl border border-white/10 bg-black px-3 py-2.5 text-sm"
            >
              {contexts.map((entry) => (
                <option key={contextKey(entry.context)} value={contextKey(entry.context)}>
                  {entry.context?.label || entry.context?.reference || contextLabel} — {money(entry.remaining_balance, currencyCode)}
                </option>
              ))}
            </select>
          ) : null}

          <div className="mt-3 flex items-end justify-between gap-3 rounded-2xl border border-white/10 bg-black/30 p-4">
            <div>
              <div className="text-[10px] uppercase tracking-[0.18em] text-white/35">{contextLabel}</div>
              <div className="mt-1 text-xl font-semibold">{activeContext?.label || activeContext?.reference || "Open check"}</div>
            </div>
            <div className="text-right">
              <div className="text-[10px] uppercase tracking-[0.18em] text-white/35">Remaining</div>
              <div className="mt-1 text-2xl font-semibold">{money(remainingBalance, currencyCode)}</div>
            </div>
          </div>

          {lastTender ? (
            <div className="mt-3 rounded-2xl border border-emerald-300/20 bg-emerald-300/[0.06] px-3 py-2.5 text-xs text-emerald-100/85">
              {paymentLabel(lastTender.method)} received {money(lastTender.paidAmount, currencyCode)}
              {lastTender.changeDue > 0 ? ` · change ${money(lastTender.changeDue, currencyCode)}` : ""}
            </div>
          ) : null}

          <div className="mt-4 max-h-[270px] space-y-1.5 overflow-y-auto pr-1">
            {items.map((item) => {
              const paid = Boolean(item.fully_paid);
              const selected = selectedItems.includes(item.id);
              const seat = item.seat_position || item.seatPosition || item.seat || null;
              return (
                <button
                  key={item.id}
                  type="button"
                  disabled={paid || actionLoading || !rules.itemSelectionAllowed || mixedMode}
                  onClick={() => toggleItem(item)}
                  className={`flex w-full items-center justify-between rounded-xl border px-3 py-2.5 text-left ${paid ? "border-emerald-400/10 bg-emerald-400/[0.04] opacity-55" : selected ? "border-[#D6A66A]/50 bg-[#D6A66A]/10" : "border-white/10 bg-white/[0.025]"}`}
                >
                  <div className="min-w-0">
                    <div className="truncate text-xs font-medium">{item.item_name || item.name || "Item"}</div>
                    <div className="mt-0.5 text-[10px] text-white/35">
                      {paid ? "Paid" : `${seat ? `Seat ${seat} · ` : ""}${Number(item.quantity || 1)} × item`}
                    </div>
                  </div>
                  <div className="ml-3 text-xs text-white/60">{paid ? "Paid" : money(itemAmount(item), currencyCode)}</div>
                </button>
              );
            })}
          </div>

          {rules.blocked ? (
            <div className="mt-4 rounded-xl border border-amber-300/20 bg-amber-300/[0.06] px-3 py-2 text-xs text-amber-100/80">
              {rules.blocker || "This check is not ready for settlement."}
            </div>
          ) : null}

          {mixedAvailable ? (
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={actionLoading}
                onClick={mixedMode ? exitMixedMode : enterMixedMode}
                className={mixedMode
                  ? "rounded-xl border border-[#D6A66A]/45 bg-[#D6A66A]/10 px-3 py-2.5 text-xs font-semibold text-[#E9CF9A]"
                  : "rounded-xl border border-white/10 bg-white/[0.025] px-3 py-2.5 text-xs font-semibold text-white/60"}
              >
                <span className="inline-flex items-center gap-2"><Split size={14} /> Split tender</span>
              </button>
              <div className="rounded-xl border border-white/10 bg-black/25 px-3 py-2.5 text-[10px] leading-4 text-white/40">
                {mixedMode ? "Take one real tender at a time until remaining reaches zero." : "Use cash + card/QR/transfer on one check."}
              </div>
            </div>
          ) : null}

          <div className="mt-4 grid grid-cols-4 gap-1.5">
            {rules.paymentOptions.map((option) => {
              const Icon = option.icon;
              const active = paymentMethod === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => {
                    paymentRequestKey.current = null;
                    setPaymentMethod(option.value);
                  }}
                  className={active
                    ? "rounded-xl border border-[#D6A66A]/50 bg-[#D6A66A]/12 px-2 py-2.5 text-[#E9CF9A]"
                    : "rounded-xl border border-white/10 bg-white/[0.025] px-2 py-2.5 text-white/45"}
                >
                  <Icon size={15} className="mx-auto" />
                  <div className="mt-1 text-[9px]">{option.label}</div>
                </button>
              );
            })}
          </div>

          {!mixedMode && rules.partialAllowed ? (
            <div className="mt-4">
              <div className="flex items-center gap-1.5">
                {[1, 2, 3, 4].map((count) => (
                  <button
                    key={count}
                    type="button"
                    onClick={() => {
                      paymentRequestKey.current = null;
                      setSelectedItems([]);
                      setSplitCount(count);
                    }}
                    className={splitCount === count && !selectedItems.length
                      ? "flex-1 rounded-lg bg-white px-2 py-2 text-[10px] font-semibold text-black"
                      : "flex-1 rounded-lg border border-white/10 px-2 py-2 text-[10px] text-white/45"}
                  >
                    {count === 1 ? "Full" : `Split ${count}`}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <div className="mt-4 rounded-2xl border border-white/10 bg-black/25 p-3">
            <div className="flex items-center justify-between gap-3">
              <div className="text-[10px] uppercase tracking-[0.16em] text-white/35">
                {mixedMode ? `This ${paymentLabel(paymentMethod)} tender` : selectedItems.length ? "Selected items" : splitCount > 1 ? `1 of ${splitCount}` : "Payment"}
              </div>
              {mixedMode ? <div className="text-[10px] text-[#D6A66A]">Remaining after: {money(Math.max(0, remainingBalance - numericAmount), currencyCode)}</div> : null}
            </div>

            <input
              type="number"
              min="0"
              max={remainingBalance || undefined}
              step="0.01"
              value={amount}
              onChange={(event) => {
                paymentRequestKey.current = null;
                setAmount(event.target.value);
              }}
              className="mt-2 w-full rounded-xl border border-white/10 bg-black px-3 py-3 text-xl font-semibold outline-none"
              aria-label="Payment amount"
            />

            {paymentMethod === "CASH" ? (
              <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.025] p-3" data-cash-change-workflow="true">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.16em] text-white/35"><Banknote size={13} /> Cash received</div>
                    <div className="mt-1 text-[10px] text-white/30">Enter what the guest physically handed you.</div>
                  </div>
                  <div className="text-right">
                    <div className="text-[9px] uppercase tracking-[0.14em] text-white/30">Change</div>
                    <div className="mt-1 text-lg font-semibold text-[#E9CF9A]">{money(changeDue, currencyCode)}</div>
                  </div>
                </div>

                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={cashTendered}
                  onChange={(event) => {
                    paymentRequestKey.current = null;
                    setCashTendered(event.target.value);
                  }}
                  className="mt-3 w-full rounded-xl border border-white/10 bg-black px-3 py-2.5 text-lg font-semibold outline-none"
                  aria-label="Cash received"
                />

                <div className="mt-2 grid grid-cols-4 gap-1.5">
                  {cashPresets.map((value, index) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setCashTendered(value.toFixed(2))}
                      className="rounded-lg border border-white/10 px-2 py-2 text-[10px] text-white/55"
                    >
                      {index === 0 ? "Exact" : money(value, currencyCode)}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            <button
              type="button"
              disabled={
                actionLoading ||
                rules.blocked ||
                !numericAmount ||
                numericAmount > remainingBalance + 0.01 ||
                (paymentMethod === "CASH" && numericTendered + 0.001 < numericAmount)
              }
              onClick={() => settle(
                numericAmount,
                numericAmount < remainingBalance,
                mixedMode ? [] : selectedItems,
              )}
              className="mt-3 w-full rounded-xl bg-[#D6A66A] px-5 py-3.5 text-sm font-bold text-black disabled:opacity-35"
            >
              {actionLoading
                ? "Taking payment..."
                : mixedMode
                  ? `Take ${paymentLabel(paymentMethod)} · ${money(numericAmount, currencyCode)}`
                  : selectedItems.length
                    ? `Pay items · ${money(numericAmount, currencyCode)}`
                    : `Pay · ${money(numericAmount, currencyCode)}`}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
