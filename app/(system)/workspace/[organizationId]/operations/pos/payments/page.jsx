"use client";

export const dynamic = "force-dynamic";

import {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  useTenant,
} from "@/app/providers/TenantProvider";

import {
  useSearchParams,
  useRouter,
} from "next/navigation";

import {
  CheckCircle2,
  CreditCard,
  Landmark,
  QrCode,
  Split,
  Wallet,
} from "lucide-react";

import PageWrapper from "@/components/PageWrapper";

import {
  splitBill,
} from "@/lib/payments/splitBill";



const PAYMENT_OPTIONS = [
  {
    value: "CARD",
    label: "CARD",
    icon: CreditCard,
  },
  {
    value: "CASH",
    label: "CASH",
    icon: Wallet,
  },
  {
    value: "QR",
    label: "QR PAYMENT",
    icon: QrCode,
  },
  {
    value: "TRANSFER",
    label: "BANK TRANSFER",
    icon: Landmark,
  },
  {
    value: "MIXED",
    label: "MIXED PAYMENT",
    icon: Split,
  },
];

function money(value) {
  return Number(value || 0).toLocaleString(
    undefined,
    {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }
  );
}

export default function PaymentsPage() {

  const tenant =
    useTenant();

  const organizationId =
    tenant?.id;

  const searchParams =
    useSearchParams();

  const router =
    useRouter();

  const tableNumber =
    searchParams.get("table");

  const [
    paymentState,
    setPaymentState,
  ] = useState(null);

  const [
    selectedItems,
    setSelectedItems,
  ] = useState([]);

  const [
    splitCount,
    setSplitCount,
  ] = useState(1);

  const [
    paymentMethod,
    setPaymentMethod,
  ] = useState("CARD");

  const [
    amount,
    setAmount,
  ] = useState("");

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    actionLoading,
    setActionLoading,
  ] = useState(false);

  async function loadPaymentState() {
    if (!tableNumber) {
      setLoading(false);
      return;
    }

    setLoading(true);

    const response =
      await fetch(
        "/api/pos/payment-state",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            organizationId:
              organizationId,
            tableNumber,
          }),
        }
      );

    const result =
      await response.json();

    if (!result.success) {
      console.error(result.error);
      setPaymentState(null);
      setLoading(false);
      return;
    }

    setPaymentState(
      result.state || null
    );

    setSelectedItems([]);
    setSplitCount(1);
    setLoading(false);
  }

  useEffect(() => {
    loadPaymentState();
  }, [tableNumber]);

  const selectedNet =
    useMemo(() => {
      return (
        paymentState?.items || []
      )
        .filter(item =>
          selectedItems.includes(item.id)
        )
        .reduce(
          (sum, item) =>
            sum +
            Number(item.price || 0) *
              Number(item.quantity || 1),
          0
        );
    }, [
      paymentState,
      selectedItems,
    ]);

  const selectedService =
    Number(
      (selectedNet * 0.05).toFixed(2)
    );

  const selectedTax =
    Number(
      (selectedNet * 0.07).toFixed(2)
    );

  const selectedGross =
    Number(
      (
        selectedNet +
        selectedService +
        selectedTax
      ).toFixed(2)
    );

  const splitPreview =
    useMemo(() => {
      return splitBill(
        {
          remainingBalance:
            paymentState?.remainingBalance || 0,
        },
        splitCount
      );
    }, [
      paymentState,
      splitCount,
    ]);

  const targetAmount =
    selectedItems.length > 0
      ? selectedGross
      : splitCount > 1
        ? splitPreview.perPerson
        : paymentState?.remainingBalance || 0;

  useEffect(() => {
    setAmount(
      targetAmount > 0
        ? targetAmount.toFixed(2)
        : ""
    );
  }, [
    targetAmount,
  ]);

  function toggleItem(itemId) {
    setSelectedItems(prev =>
      prev.includes(itemId)
        ? prev.filter(id => id !== itemId)
        : [
            ...prev,
            itemId,
          ]
    );
  }

  async function payAmount({
    paymentAmount,
    mode,
  }) {
    if (!paymentState?.session?.table_number) {
      alert("No active table session");
      return;
    }

    if (
      !paymentAmount ||
      Number(paymentAmount) <= 0
    ) {
      alert("Invalid payment amount");
      return;
    }

    setActionLoading(true);

    try {
      const response =
        await fetch(
          mode === "FULL"
            ? "/api/pos/payments/create"
            : "/api/pos/partial-payment",
          {
            method: "POST",
            headers: {
              "Content-Type":
                "application/json",
            },
            body: JSON.stringify({
              organizationId:
                organizationId,
              tableNumber:
                paymentState.session.table_number,
              paymentMethod,
              cashierName:
                "SYSTEM",
              paidAmount:
                Number(paymentAmount),
              amount:
                Number(paymentAmount),
            }),
          }
        );

      const result =
        await response.json();

      if (!result.success) {
        throw new Error(
          result.error ||
            "Payment failed"
        );
      }

      if (
        Number(
          result.remainingBalance || 0
        ) <= 0 ||
        mode === "FULL"
      ) {
        router.push("/operations/tables");

        router.refresh();
        return;
      }

      await loadPaymentState();

    } catch (error) {
      console.error(error);
      alert(error.message);
    } finally {
      setActionLoading(false);
    }
  }

  async function paySelectedItems() {
    if (
      selectedItems.length === 0
    ) {
      alert("Select items first");
      return;
    }

    await payAmount({
      paymentAmount:
        selectedGross,
      mode:
        "PARTIAL",
    });

    setSelectedItems([]);
  }

  async function payPartial() {
    await payAmount({
      paymentAmount:
        Number(amount || 0),
      mode:
        "PARTIAL",
    });
  }

  async function payFull() {
    await payAmount({
      paymentAmount:
        paymentState?.remainingBalance || 0,
      mode:
        "FULL",
    });
  }

  if (loading) {
    return (
      <PageWrapper
        title="Payments"
        subtitle="Loading settlement"
      >
        <div className="text-white/40">
          Loading...
        </div>
      </PageWrapper>
    );
  }

  if (!paymentState) {
    return (
      <PageWrapper
        title="Payments"
        subtitle="No active session"
      >
        <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-8 text-white/50">
          Payment unavailable. No active table session found.
        </div>
      </PageWrapper>
    );
  }

  return (
    <PageWrapper
      title="Payments"
      subtitle="Single-source billing and settlement"
    >
      <div className="grid grid-cols-3 gap-6">

        <div className="col-span-2 rounded-[30px] border border-white/10 bg-white/[0.03] p-6">

          <div className="mb-8 flex items-center justify-between">
            <div>
              <div className="mb-2 text-xs uppercase tracking-[0.2em] text-violet-400">
                Table
              </div>
              <div className="text-5xl font-light">
                {paymentState.session.table_number}
              </div>
            </div>

            <div className="text-right">
              <div className="mb-2 text-xs uppercase text-white/40">
                Session
              </div>
              <div className="text-2xl text-emerald-400">
                {paymentState.session.status}
              </div>
            </div>
          </div>

          <div className="mb-8 grid grid-cols-3 gap-4">
            <MetricCard
              label="Original Total"
              value={paymentState.grandTotal}
            />
            <MetricCard
              label="Already Paid"
              value={paymentState.paidAmount}
            />
            <MetricCard
              label="Remaining"
              value={paymentState.remainingBalance}
              highlight
            />
          </div>

          <div className="mb-8 space-y-3">
            {paymentState.items?.map(item => (
              <div
                key={item.id}
                onClick={() =>
                  toggleItem(item.id)
                }
                className={`flex cursor-pointer items-center justify-between rounded-2xl border p-4 transition-all ${
                  selectedItems.includes(item.id)
                    ? "border-emerald-400 bg-emerald-500/10"
                    : "border-white/10 bg-black/20"
                }`}
              >
                <div>
                  <div className="text-lg">

                    {item.seat_position && (
                      <span className="mr-2 font-black text-cyan-400">
                        S{item.seat_position}
                      </span>
                    )}

                    {item.item_name ||
                      item.dish_name ||
                      "Unnamed Item"}

                  </div>

                  {item.modifiers?.side && (
                    <div className="mt-1 text-xs text-cyan-300">
                      SIDE: {item.modifiers.side}
                    </div>
                  )}

                  {item.modifiers?.sauce && (
                    <div className="mt-1 text-xs text-cyan-300">
                      SAUCE: {item.modifiers.sauce}
                    </div>
                  )}

                  {item.modifiers?.spicy && (
                    <div className="mt-1 text-xs text-cyan-300">
                      SPICY: {item.modifiers.spicy}
                    </div>
                  )}

                  <div className="mt-1 text-xs uppercase text-white/40">
                    {item.status || "OPEN"}
                  </div>
                </div>

                <div className="text-right">
                  <div className="text-lg">
                    x{Number(item.quantity || 1)}
                  </div>
                  <div className="text-sm text-violet-400">
                    ฿{money(
                      Number(item.price || 0) *
                        Number(item.quantity || 1)
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-4">
            <div className="mb-2 text-xs uppercase tracking-[0.2em] text-emerald-400">
              Selected Items Payment
            </div>
            <div className="text-3xl font-light text-white">
              ฿{money(selectedGross)}
            </div>
            <div className="mt-2 text-xs text-white/40">
              Net ฿{money(selectedNet)} + Service ฿{money(selectedService)} + VAT ฿{money(selectedTax)}
            </div>
          </div>

        </div>

        <div className="rounded-[30px] border border-white/10 bg-white/[0.03] p-6">

          <div className="mb-8 text-3xl">
            Settlement
          </div>

          <div className="mb-8 space-y-4">
            <SummaryRow
              label="Subtotal"
              value={paymentState.subtotal}
            />
            <SummaryRow
              label="Service"
              value={paymentState.serviceCharge}
            />
            <SummaryRow
              label="Tax"
              value={paymentState.tax}
            />
            <SummaryRow
              label="Paid"
              value={paymentState.paidAmount}
            />

            <div className="border-t border-white/10 pt-4">
              <SummaryRow
                label="Remaining"
                value={paymentState.remainingBalance}
                big
              />
            </div>
          </div>

          <div className="mb-6">
            <div className="mb-3 text-sm uppercase tracking-[0.2em] text-white/40">
              Payment Method
            </div>

            <select
              value={paymentMethod}
              onChange={e =>
                setPaymentMethod(e.target.value)
              }
              className="h-12 w-full rounded-2xl border border-white/10 bg-black/30 px-4 text-white"
            >
              {PAYMENT_OPTIONS.map(option => (
                <option
                  key={option.value}
                  value={option.value}
                >
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className="mb-6">
            <div className="mb-3 text-sm uppercase tracking-[0.2em] text-white/40">
              Split Bill
            </div>

            <select
              value={splitCount}
              onChange={e =>
                setSplitCount(
                  Number(e.target.value)
                )
              }
              className="h-12 w-full rounded-2xl border border-white/10 bg-black/30 px-4 text-white"
            >
              <option value={1}>
                Full Bill
              </option>
              <option value={2}>
                Split 2
              </option>
              <option value={3}>
                Split 3
              </option>
              <option value={4}>
                Split 4
              </option>
              <option value={5}>
                Split 5
              </option>
            </select>

            {splitCount > 1 && (
              <div className="mt-4 rounded-2xl border border-violet-500/20 bg-violet-500/10 p-4">
                <div className="mb-2 text-xs uppercase tracking-[0.2em] text-violet-300">
                  Per Person
                </div>
                <div className="text-2xl font-light text-white">
                  ฿{money(splitPreview.perPerson)}
                </div>
              </div>
            )}
          </div>

          <div className="space-y-4">
            <input
              type="number"
              value={amount}
              onChange={e =>
                setAmount(e.target.value)
              }
              className="h-14 w-full rounded-2xl border border-white/10 bg-black/30 px-4 text-white outline-none"
            />

            <button
              onClick={
                selectedItems.length > 0
                  ? paySelectedItems
                  : payPartial
              }
              disabled={actionLoading}
              className="flex h-14 w-full items-center justify-center rounded-2xl bg-orange-500 text-lg font-semibold text-black"
            >
              {selectedItems.length > 0
                ? "PAY SELECTED ITEMS"
                : "PARTIAL PAYMENT"}
            </button>

            <button
              onClick={payFull}
              disabled={actionLoading}
              className="flex h-16 w-full items-center justify-center gap-3 rounded-2xl bg-emerald-500 text-lg font-semibold text-black transition-all hover:bg-emerald-400"
            >
              <CheckCircle2 className="h-6 w-6" />
              PAY FULL & CLOSE TABLE
            </button>
          </div>

        </div>

      </div>
    </PageWrapper>
  );
}

function MetricCard({
  label,
  value,
  highlight,
}) {
  return (
    <div className={`rounded-2xl border p-4 ${
      highlight
        ? "border-emerald-500/20 bg-emerald-500/10"
        : "border-white/10 bg-black/20"
    }`}>
      <div className="mb-2 text-xs uppercase tracking-[0.2em] text-white/40">
        {label}
      </div>
      <div className="text-2xl font-light text-white">
        ฿{money(value)}
      </div>
    </div>
  );
}

function SummaryRow({
  label,
  value,
  big,
}) {
  return (
    <div className="flex items-center justify-between">
      <div className={big ? "text-xl" : "text-white/60"}>
        {label}
      </div>
      <div className={big ? "text-3xl font-light" : "text-lg"}>
        ฿{money(value)}
      </div>
    </div>
  );
}
