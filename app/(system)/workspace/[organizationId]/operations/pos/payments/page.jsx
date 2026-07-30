"use client";

export const dynamic = "force-dynamic";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
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

function numeric(record, fields) {
  for (const field of fields) {
    const value = Number(record?.[field]);
    if (Number.isFinite(value)) return value;
  }
  return 0;
}

function formatMoney(value, currencyCode) {
  const amount = Number(value || 0);

  if (!currencyCode) {
    return new Intl.NumberFormat(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  }

  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: currencyCode,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return new Intl.NumberFormat(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  }
}

export default function PaymentsPage() {
  const businessContext = useBusinessContext() || {};
  const organization = businessContext?.organization || null;
  const organizationId =
    businessContext?.organizationId || organization?.id || null;
  const currencyCode =
    organization?.currency_code || organization?.currency || null;
  const searchParams = useSearchParams();
  const router = useRouter();
  const tableNumber = searchParams.get("table");

  const [paymentState, setPaymentState] = useState(null);
  const [selectedItems, setSelectedItems] = useState([]);
  const [splitCount, setSplitCount] = useState(1);
  const [paymentMethod, setPaymentMethod] = useState("CARD");
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState(null);

  async function loadPaymentState() {
    if (!organizationId || !tableNumber) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/pos/payment-state", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId,
          organization_id: organizationId,
          tableNumber,
        }),
      });
      const result = await response.json();

      if (!response.ok || result.success === false) {
        throw new Error(result.error || "Unable to load payment state");
      }

      setPaymentState(result.state || null);
      setSelectedItems([]);
      setSplitCount(1);
    } catch (loadError) {
      setPaymentState(null);
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadPaymentState();
  }, [organizationId, tableNumber]);

  const items = paymentState?.items || [];
  const allItemsNet = useMemo(
    () =>
      items.reduce(
        (sum, item) =>
          sum + Number(item.price || 0) * Number(item.quantity || 1),
        0
      ),
    [items]
  );
  const selectedNet = useMemo(
    () =>
      items
        .filter((item) => selectedItems.includes(item.id))
        .reduce(
          (sum, item) =>
            sum + Number(item.price || 0) * Number(item.quantity || 1),
          0
        ),
    [items, selectedItems]
  );

  const persistedSubtotal = numeric(paymentState, [
    "subtotal",
    "netTotal",
    "net_total",
  ]) || allItemsNet;
  const persistedService = numeric(paymentState, [
    "serviceCharge",
    "service_charge",
    "serviceChargeAmount",
    "service_charge_amount",
  ]);
  const persistedTax = numeric(paymentState, [
    "tax",
    "vat",
    "taxAmount",
    "tax_amount",
    "vatAmount",
    "vat_amount",
  ]);

  const selectedShare =
    selectedNet > 0 && persistedSubtotal > 0
      ? Math.min(1, selectedNet / persistedSubtotal)
      : 0;
  const selectedService = Number(
    (persistedService * selectedShare).toFixed(2)
  );
  const selectedTax = Number((persistedTax * selectedShare).toFixed(2));
  const selectedGross = Number(
    (selectedNet + selectedService + selectedTax).toFixed(2)
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

  function toggleItem(itemId) {
    setSelectedItems((current) =>
      current.includes(itemId)
        ? current.filter((id) => id !== itemId)
        : [...current, itemId]
    );
  }

  async function payAmount(paymentAmount, mode) {
    if (!paymentState?.session?.table_number) {
      setError("No active table session");
      return;
    }

    if (!Number(paymentAmount) || Number(paymentAmount) <= 0) {
      setError("Invalid payment amount");
      return;
    }

    setActionLoading(true);
    setError(null);

    try {
      const response = await fetch(
        mode === "FULL"
          ? "/api/restaurant/payments/create"
          : "/api/restaurant/payments/partial",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            organizationId,
            organization_id: organizationId,
            tableNumber: paymentState.session.table_number,
            paymentMethod,
            paidAmount: Number(paymentAmount),
            amount: Number(paymentAmount),
            itemIds: selectedItems,
          }),
        }
      );
      const result = await response.json();

      if (!response.ok || result.success === false) {
        throw new Error(result.error || "Payment failed");
      }

      if (Number(result.remainingBalance || 0) <= 0 || mode === "FULL") {
        router.push(`/workspace/${organizationId}/operations/pos`);
        router.refresh();
        return;
      }

      await loadPaymentState();
    } catch (paymentError) {
      setError(paymentError.message);
    } finally {
      setActionLoading(false);
    }
  }

  if (loading) {
    return (
      <PageWrapper title="Payments" subtitle="Loading settlement">
        <div className="text-white/40">Loading...</div>
      </PageWrapper>
    );
  }

  if (!paymentState) {
    return (
      <PageWrapper title="Payments" subtitle="No active session">
        <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-8 text-white/50">
          {error || "Payment unavailable. No active table session found."}
        </div>
      </PageWrapper>
    );
  }

  return (
    <PageWrapper title="Payments" subtitle="Persisted billing and settlement">
      {error ? (
        <div className="mb-5 rounded-2xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-100">
          {error}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <section className="xl:col-span-2 rounded-[30px] border border-white/10 bg-white/[0.03] p-6">
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
              return (
                <button
                  key={item.id}
                  onClick={() => toggleItem(item.id)}
                  className={
                    selected
                      ? "flex w-full items-center justify-between rounded-2xl border border-[#D6A66A]/50 bg-[#D6A66A]/10 px-4 py-4 text-left"
                      : "flex w-full items-center justify-between rounded-2xl border border-white/10 bg-black/20 px-4 py-4 text-left"
                  }
                >
                  <div>
                    <div className="font-medium">
                      {item.item_name || item.name || "Item"}
                    </div>
                    <div className="mt-1 text-xs text-white/40">
                      {Number(item.quantity || 1)} item(s)
                    </div>
                  </div>
                  <div className="text-sm text-white/65">
                    {formatMoney(
                      Number(item.price || 0) * Number(item.quantity || 1),
                      currencyCode
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          {selectedItems.length ? (
            <div className="mt-6 rounded-2xl border border-[#D6A66A]/20 bg-[#D6A66A]/5 p-4 text-sm">
              <div className="flex justify-between text-white/55">
                <span>Selected items</span>
                <span>{formatMoney(selectedNet, currencyCode)}</span>
              </div>
              <div className="mt-2 flex justify-between text-white/55">
                <span>Allocated service charge</span>
                <span>{formatMoney(selectedService, currencyCode)}</span>
              </div>
              <div className="mt-2 flex justify-between text-white/55">
                <span>Allocated tax</span>
                <span>{formatMoney(selectedTax, currencyCode)}</span>
              </div>
              <div className="mt-3 flex justify-between text-lg font-semibold">
                <span>Selected total</span>
                <span>{formatMoney(selectedGross, currencyCode)}</span>
              </div>
            </div>
          ) : null}
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
                  onClick={() => setPaymentMethod(option.value)}
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
            onChange={(event) =>
              setSplitCount(Math.max(1, Number(event.target.value || 1)))
            }
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
            onChange={(event) => setAmount(event.target.value)}
            className="mt-2 w-full rounded-xl border border-white/10 bg-black px-4 py-3 text-xl"
          />

          <button
            disabled={actionLoading || selectedItems.length === 0}
            onClick={() => payAmount(selectedGross, "PARTIAL")}
            className="mt-6 w-full rounded-2xl border border-[#D6A66A]/40 bg-[#D6A66A]/10 py-4 text-sm font-semibold text-[#F3D7A2] disabled:opacity-30"
          >
            Pay Selected Items
          </button>

          <button
            disabled={actionLoading}
            onClick={() => payAmount(Number(amount || 0), "PARTIAL")}
            className="mt-3 w-full rounded-2xl border border-white/10 py-4 text-sm font-semibold disabled:opacity-30"
          >
            Pay Partial Amount
          </button>

          <button
            disabled={actionLoading}
            onClick={() => payAmount(paymentState.remainingBalance, "FULL")}
            className="mt-3 w-full rounded-2xl bg-[#D6A66A] py-4 text-sm font-semibold text-black disabled:opacity-30"
          >
            Pay Full Balance
          </button>
        </aside>
      </div>
    </PageWrapper>
  );
}
