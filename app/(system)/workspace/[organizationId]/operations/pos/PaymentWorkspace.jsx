"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { CreditCard, Landmark, QrCode, Split, Wallet } from "lucide-react";
import { useBusinessContext } from "@/app/providers/BusinessContextProvider";
import PageWrapper from "@/components/PageWrapper";
import { splitBill } from "@/lib/payments/splitBill";

const PAYMENT_OPTIONS = [
  { value: "CARD", label: "Card", icon: CreditCard },
  { value: "CASH", label: "Cash", icon: Wallet },
  { value: "QR", label: "QR payment", icon: QrCode },
  { value: "TRANSFER", label: "Bank transfer", icon: Landmark },
  { value: "MIXED", label: "Mixed payment", icon: Split },
];

function formatMoney(value, currencyCode) {
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
        : { minimumFractionDigits: 2, maximumFractionDigits: 2 }
    ).format(amount);
  } catch {
    return amount.toFixed(2);
  }
}

function itemAmount(item, field, fallback = 0) {
  const value = Number(item?.[field]);
  return Number.isFinite(value) ? value : Number(fallback || 0);
}

export default function PaymentWorkspace() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const businessContext = useBusinessContext() || {};
  const organization = businessContext.organization || null;
  const organizationId =
    params?.organizationId ||
    businessContext.organization_id ||
    organization?.id ||
    null;
  const currencyCode =
    organization?.currency_code ||
    organization?.currency ||
    businessContext.currency ||
    null;
  const requestedTable = searchParams.get("table");
  const paymentRequestKey = useRef(null);

  const [tableNumber, setTableNumber] = useState(requestedTable || "");
  const [payableOrders, setPayableOrders] = useState([]);
  const [paymentState, setPaymentState] = useState(null);
  const [selectedItems, setSelectedItems] = useState([]);
  const [splitCount, setSplitCount] = useState(1);
  const [paymentMethod, setPaymentMethod] = useState("CARD");
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState(null);

  const loadPayableOrders = useCallback(async () => {
    if (!organizationId) return [];

    const response = await fetch(
      `/api/restaurant/operations?scope=payments&organizationId=${encodeURIComponent(
        organizationId
      )}`,
      { cache: "no-store", credentials: "include" }
    );
    const result = await response.json();

    if (!response.ok || result.success === false) {
      throw new Error(result.error || "Unable to load payable orders");
    }

    const orders = result.payableOrders || [];
    setPayableOrders(orders);
    return orders;
  }, [organizationId]);

  const loadPaymentState = useCallback(
    async (targetTable) => {
      if (!organizationId || !targetTable) {
        setPaymentState(null);
        return;
      }

      const response = await fetch("/api/pos/payment-state", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId, tableNumber: targetTable }),
      });
      const result = await response.json();

      if (!response.ok || result.success === false) {
        throw new Error(result.error || "Unable to load payment state");
      }

      setPaymentState(result.state || null);
      setSelectedItems([]);
      setSplitCount(1);
      paymentRequestKey.current = null;
    },
    [organizationId]
  );

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!organizationId) return;

      setLoading(true);
      setError(null);

      try {
        const orders = await loadPayableOrders();
        const initial =
          requestedTable ||
          orders.find((order) => order.table_number)?.table_number ||
          "";

        if (cancelled) return;

        setTableNumber(initial);
        if (initial) await loadPaymentState(initial);
      } catch (loadError) {
        if (!cancelled) setError(loadError.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [organizationId, requestedTable, loadPayableOrders, loadPaymentState]);

  const items = paymentState?.items || [];
  const selectedRows = useMemo(
    () =>
      items.filter(
        (item) => selectedItems.includes(item.id) && !item.fully_paid
      ),
    [items, selectedItems]
  );
  const selectedGross = useMemo(
    () =>
      Number(
        selectedRows
          .reduce(
            (sum, item) =>
              sum +
              itemAmount(
                item,
                "remaining_amount",
                Number(item.price || 0) * Number(item.quantity || 1)
              ),
            0
          )
          .toFixed(2)
      ),
    [selectedRows]
  );
  const splitPreview = useMemo(
    () =>
      splitBill(
        { remainingBalance: paymentState?.remainingBalance || 0 },
        splitCount
      ),
    [paymentState, splitCount]
  );
  const targetAmount =
    selectedItems.length > 0
      ? selectedGross
      : splitCount > 1
        ? splitPreview.perPerson
        : Number(paymentState?.remainingBalance || 0);

  useEffect(() => {
    setAmount(targetAmount > 0 ? targetAmount.toFixed(2) : "");
  }, [targetAmount]);

  async function changeTable(value) {
    setTableNumber(value);
    setError(null);
    setLoading(true);

    try {
      await loadPaymentState(value);
      const next = new URLSearchParams(searchParams.toString());
      next.set("view", "checkout");
      next.set("table", value);
      router.replace(
        `/workspace/${organizationId}/operations/pos?${next.toString()}`,
        { scroll: false }
      );
    } catch (loadError) {
      setPaymentState(null);
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  }

  function toggleItem(item) {
    if (item.fully_paid || actionLoading) return;

    paymentRequestKey.current = null;
    setSelectedItems((current) =>
      current.includes(item.id)
        ? current.filter((id) => id !== item.id)
        : [...current, item.id]
    );
  }

  async function pay(paymentAmount, partial, itemIds = []) {
    if (!paymentState?.session?.table_number) return;

    if (!Number(paymentAmount) || Number(paymentAmount) <= 0) {
      setError("Payment amount must be greater than zero");
      return;
    }

    if (!paymentRequestKey.current) {
      paymentRequestKey.current = crypto.randomUUID();
    }

    setActionLoading(true);
    setError(null);

    try {
      const response = await fetch(
        partial
          ? "/api/restaurant/payments/partial"
          : "/api/restaurant/payments/create",
        {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": paymentRequestKey.current,
          },
          body: JSON.stringify({
            organizationId,
            idempotencyKey: paymentRequestKey.current,
            tableNumber: paymentState.session.table_number,
            paymentMethod,
            paidAmount: Number(paymentAmount),
            itemIds,
          }),
        }
      );
      const result = await response.json();

      if (!response.ok || result.success === false) {
        throw new Error(result.error || "Payment failed");
      }

      paymentRequestKey.current = null;
      await loadPayableOrders();

      if (result.fullyPaid || Number(result.remainingBalance || 0) <= 0) {
        const orderId = result.orderId || paymentState.orders?.[0]?.id || "";
        const next = new URLSearchParams();
        next.set("view", "receipts");
        if (orderId) next.set("order_id", orderId);
        router.push(
          `/workspace/${organizationId}/operations/pos?${next.toString()}`
        );
        return;
      }

      await loadPaymentState(tableNumber);
    } catch (paymentError) {
      setError(paymentError.message);
    } finally {
      setActionLoading(false);
    }
  }

  if (loading) {
    return (
      <PageWrapper title="POS Checkout" subtitle="Loading settlement">
        <div className="text-white/40">Loading...</div>
      </PageWrapper>
    );
  }

  if (!paymentState) {
    return (
      <PageWrapper title="POS Checkout" subtitle="Select an unpaid table">
        {error ? (
          <div className="mb-5 rounded-2xl border border-red-400/20 bg-red-500/10 p-4 text-red-100">
            {error}
          </div>
        ) : null}

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {payableOrders.length ? (
            payableOrders.map((order) => (
              <button
                key={order.id}
                onClick={() => changeTable(order.table_number)}
                className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 text-left transition hover:border-[#D6A66A]/40"
              >
                <div className="text-xl font-semibold">
                  Table {order.table_number}
                </div>
                <div className="mt-2 text-sm text-white/45">
                  {order.order_number || order.id}
                </div>
                <div className="mt-4 text-lg">
                  {formatMoney(order.remaining_balance, currencyCode)}
                </div>
              </button>
            ))
          ) : (
            <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-8 text-white/45">
              No unpaid restaurant orders.
            </div>
          )}
        </div>
      </PageWrapper>
    );
  }

  return (
    <PageWrapper title="POS Checkout" subtitle="Billing, split and settlement">
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <select
          value={tableNumber}
          onChange={(event) => changeTable(event.target.value)}
          className="rounded-xl border border-white/10 bg-black px-4 py-3 text-sm"
        >
          {payableOrders.map((order) => (
            <option key={order.id} value={order.table_number}>
              Table {order.table_number} — {formatMoney(order.remaining_balance, currencyCode)}
            </option>
          ))}
        </select>
      </div>

      {error ? (
        <div className="mb-5 rounded-2xl border border-red-400/20 bg-red-500/10 p-4 text-red-100">
          {error}
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-3">
        <section className="rounded-[30px] border border-white/10 bg-white/[0.03] p-6 xl:col-span-2">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-[#D6A66A]">
                Table
              </p>
              <h2 className="mt-2 text-5xl font-light">
                {paymentState.session.table_number}
              </h2>
            </div>
            <div className="text-right">
              <p className="text-xs text-white/40">Remaining</p>
              <p className="mt-1 text-3xl font-semibold">
                {formatMoney(paymentState.remainingBalance, currencyCode)}
              </p>
            </div>
          </div>

          <div className="mt-8 space-y-2">
            {items.map((item) => {
              const selected = selectedItems.includes(item.id);
              const paid = Boolean(item.fully_paid);

              return (
                <button
                  key={item.id}
                  disabled={paid || actionLoading}
                  onClick={() => toggleItem(item)}
                  className={`flex w-full items-center justify-between rounded-2xl border px-4 py-4 text-left ${
                    paid
                      ? "border-emerald-400/15 bg-emerald-400/5 opacity-55"
                      : selected
                        ? "border-[#D6A66A]/50 bg-[#D6A66A]/10"
                        : "border-white/10 bg-black/20"
                  }`}
                >
                  <div>
                    <div className="font-medium">
                      {item.item_name || item.name || "Item"}
                    </div>
                    <div className="mt-1 text-xs text-white/40">
                      {paid ? "Paid" : `${Number(item.quantity || 1)} item(s)`}
                    </div>
                  </div>
                  <div className="text-sm text-white/60">
                    {paid
                      ? "Paid"
                      : formatMoney(item.remaining_amount, currencyCode)}
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        <aside className="rounded-[30px] border border-white/10 bg-white/[0.03] p-6">
          <p className="text-xs uppercase tracking-[0.2em] text-white/40">
            Payment method
          </p>
          <div className="mt-4 grid grid-cols-2 gap-2">
            {PAYMENT_OPTIONS.map((option) => {
              const Icon = option.icon;

              return (
                <button
                  key={option.value}
                  onClick={() => {
                    paymentRequestKey.current = null;
                    setPaymentMethod(option.value);
                  }}
                  className={
                    paymentMethod === option.value
                      ? "rounded-2xl border border-[#D6A66A]/50 bg-[#D6A66A]/10 p-4 text-[#F3D7A2]"
                      : "rounded-2xl border border-white/10 bg-black/20 p-4 text-white/55"
                  }
                >
                  <Icon className="mx-auto h-5 w-5" />
                  <div className="mt-2 text-xs">{option.label}</div>
                </button>
              );
            })}
          </div>

          <label className="mt-6 block text-xs uppercase tracking-[0.2em] text-white/40">
            Split count
          </label>
          <input
            type="number"
            min="1"
            value={splitCount}
            onChange={(event) => {
              paymentRequestKey.current = null;
              setSplitCount(Math.max(1, Number(event.target.value || 1)));
            }}
            className="mt-2 w-full rounded-xl border border-white/10 bg-black px-4 py-3"
          />

          <label className="mt-5 block text-xs uppercase tracking-[0.2em] text-white/40">
            Amount
          </label>
          <input
            type="number"
            min="0"
            step="0.01"
            value={amount}
            onChange={(event) => {
              paymentRequestKey.current = null;
              setAmount(event.target.value);
            }}
            className="mt-2 w-full rounded-xl border border-white/10 bg-black px-4 py-3 text-xl"
          />

          <button
            disabled={
              actionLoading || selectedItems.length === 0 || selectedGross <= 0
            }
            onClick={() => pay(selectedGross, true, selectedItems)}
            className="mt-6 w-full rounded-2xl border border-[#D6A66A]/40 bg-[#D6A66A]/10 py-4 text-sm font-semibold text-[#F3D7A2] disabled:opacity-30"
          >
            Pay Selected Items
          </button>
          <button
            disabled={actionLoading}
            onClick={() => pay(Number(amount || 0), true, [])}
            className="mt-3 w-full rounded-2xl border border-white/10 py-4 text-sm font-semibold disabled:opacity-30"
          >
            Pay Partial Amount
          </button>
          <button
            disabled={actionLoading}
            onClick={() => pay(paymentState.remainingBalance, false, [])}
            className="mt-3 w-full rounded-2xl bg-[#D6A66A] py-4 text-sm font-semibold text-black disabled:opacity-30"
          >
            Pay Full Balance
          </button>
        </aside>
      </div>
    </PageWrapper>
  );
}
