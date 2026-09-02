"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useParams } from "next/navigation";
import {
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
  { value: "MIXED", label: "Mixed", icon: Split },
]);

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

export default function POSInlineCheckout({
  posConfiguration,
  onPaymentComplete,
  onRefresh,
  compact = false,
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
      const nextContext = selectedEntry?.context || nextContexts[0]?.context || null;

      if (!nextContext) {
        setSelectedContext(null);
        setPaymentState(null);
        setSelectedItems([]);
        setSplitCount(1);
        paymentRequestKey.current = null;
        return;
      }

      await loadPaymentState(nextContext, { preserveDraft: Boolean(selectedEntry) });
    } catch (loadError) {
      setError(loadError?.message || "Unable to load checkout");
    }
  }, [loadContexts, loadPaymentState, organizationId, selectedContext]);

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
  }, [organizationId, applicationId]);

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
  const selectedTotal = Number(
    selectedRows.reduce((sum, item) => sum + itemAmount(item), 0).toFixed(2),
  );
  const splitPreview = useMemo(
    () => splitBill(
      { remainingBalance: paymentState?.remainingBalance || 0 },
      splitCount,
    ),
    [paymentState?.remainingBalance, splitCount],
  );
  const suggestedAmount = selectedItems.length
    ? selectedTotal
    : splitCount > 1
      ? Number(splitPreview.perPerson || 0)
      : Number(paymentState?.remainingBalance || 0);

  useEffect(() => {
    setAmount(suggestedAmount > 0 ? suggestedAmount.toFixed(2) : "");
  }, [suggestedAmount]);

  useEffect(() => {
    if (rules.paymentOptions.some((option) => option.value === paymentMethod)) return;
    if (rules.paymentOptions[0]) setPaymentMethod(rules.paymentOptions[0].value);
  }, [paymentMethod, rules.paymentOptions]);

  async function chooseContext(context) {
    setLoading(true);
    setError(null);
    try {
      await loadPaymentState(context);
    } catch (loadError) {
      setError(loadError?.message || "Unable to open check");
    } finally {
      setLoading(false);
    }
  }

  function toggleItem(item) {
    if (!rules.itemSelectionAllowed || item.fully_paid || actionLoading) return;
    paymentRequestKey.current = null;
    setSelectedItems((current) => current.includes(item.id)
      ? current.filter((id) => id !== item.id)
      : [...current, item.id]);
  }

  async function settle(paymentAmount, partial, itemIds = []) {
    const context = paymentState?.context || selectedContext;
    const numericAmount = Number(paymentAmount || 0);
    if (!context) return;
    if (!numericAmount || numericAmount <= 0) {
      setError("Payment amount must be greater than zero");
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
          paidAmount: numericAmount,
          tenderedAmount: numericAmount,
          itemIds,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result.success === false) {
        throw new Error(result.error || "Payment failed");
      }

      paymentRequestKey.current = null;
      const fullyPaid = result.fullyPaid || Number(result.remainingBalance || 0) <= 0;

      if (fullyPaid) {
        const orderId = result.orderId || paymentState?.orders?.[0]?.id || null;
        await load({ preserveSelection: false });
        await onRefresh?.();
        onPaymentComplete?.({ orderId, result, context });
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
    <section className={`rounded-[26px] border border-white/10 bg-[#090909] text-white ${compact ? "p-4" : "p-5"}`} data-pos-inline-checkout="true">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#D6A66A]">Checkout</div>
          <div className="mt-1 text-lg font-semibold">Pay without leaving the POS</div>
          <div className="mt-1 text-[11px] text-white/40">
            {realtimeStatus === "live" ? "Live" : "Live sync with fallback refresh"}
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

          <div className="mt-4 flex items-end justify-between gap-3 rounded-2xl border border-white/10 bg-black/30 p-4">
            <div>
              <div className="text-[10px] uppercase tracking-[0.18em] text-white/35">{contextLabel}</div>
              <div className="mt-1 text-xl font-semibold">{activeContext?.label || activeContext?.reference || "Open check"}</div>
            </div>
            <div className="text-right">
              <div className="text-[10px] uppercase tracking-[0.18em] text-white/35">Remaining</div>
              <div className="mt-1 text-2xl font-semibold">{money(paymentState.remainingBalance, currencyCode)}</div>
            </div>
          </div>

          <div className="mt-4 max-h-[270px] space-y-1.5 overflow-y-auto pr-1">
            {items.map((item) => {
              const paid = Boolean(item.fully_paid);
              const selected = selectedItems.includes(item.id);
              return (
                <button
                  key={item.id}
                  type="button"
                  disabled={paid || actionLoading || !rules.itemSelectionAllowed}
                  onClick={() => toggleItem(item)}
                  className={`flex w-full items-center justify-between rounded-xl border px-3 py-2.5 text-left ${paid ? "border-emerald-400/10 bg-emerald-400/[0.04] opacity-55" : selected ? "border-[#D6A66A]/50 bg-[#D6A66A]/10" : "border-white/10 bg-white/[0.025]"}`}
                >
                  <div className="min-w-0">
                    <div className="truncate text-xs font-medium">{item.item_name || item.name || "Item"}</div>
                    <div className="mt-0.5 text-[10px] text-white/35">{paid ? "Paid" : `${Number(item.quantity || 1)} × item`}</div>
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

          <div className="mt-4 grid grid-cols-5 gap-1.5">
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

          {rules.partialAllowed ? (
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

          <div className="mt-4 grid grid-cols-[1fr_auto] gap-2">
            <input
              type="number"
              min="0"
              step="0.01"
              value={amount}
              onChange={(event) => {
                paymentRequestKey.current = null;
                setAmount(event.target.value);
              }}
              className="min-w-0 rounded-xl border border-white/10 bg-black px-3 py-3 text-lg font-semibold outline-none"
              aria-label="Payment amount"
            />
            <button
              type="button"
              disabled={actionLoading || rules.blocked || !Number(amount || 0)}
              onClick={() => settle(Number(amount || 0), Number(amount || 0) < Number(paymentState.remainingBalance || 0), selectedItems)}
              className="rounded-xl bg-[#D6A66A] px-5 py-3 text-sm font-bold text-black disabled:opacity-35"
            >
              {actionLoading ? "Paying..." : selectedItems.length ? "Pay items" : "Pay"}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
