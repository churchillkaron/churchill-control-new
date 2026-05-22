"use client";

export const dynamic = "force-dynamic";

import {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  useSearchParams,
} from "next/navigation";

import {
  CreditCard,
  Split,
  CheckCircle2,
  QrCode,
  Landmark,
  Wallet,
} from "lucide-react";

import PageWrapper
from "@/components/PageWrapper";

import { supabase }
from "@/lib/shared/supabase/client";

import {
  calculateBill,
} from "@/lib/payments/calculateBill";

import {
  splitBill,
} from "@/lib/payments/splitBill";

import {
  postPaymentJournal,
} from "@/lib/accounting/postPaymentJournal";

import {
  updateOrderStatusFromItems,
} from "@/lib/orders/updateOrderStatusFromItems";


const TENANT_ID =
  "76e2caa6-dd78-49e5-b0f5-1ff94185c2d4";

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

export default function PaymentsPage() {

  const searchParams =
    useSearchParams();

  const orderId =
    searchParams.get(
      "order_id"
    );

  const [
    order,
    setOrder,
  ] = useState(null);

  const [
    splitCount,
    setSplitCount,
  ] = useState(1);

  const [
    selectedItems,
    setSelectedItems,
  ] = useState([]);

  const [
    paymentMethod,
    setPaymentMethod,
  ] = useState("CARD");

  const [
    tenders,
    setTenders,
  ] = useState([
    {
      method: "CARD",
      amount: "",
    },
  ]);

  const [
    partialAmount,
    setPartialAmount,
  ] = useState("");

  const [
    partialLoading,
    setPartialLoading,
  ] = useState(false);

  const [
    loading,
    setLoading,
  ] = useState(true);

  async function loadOrder() {

    if (!orderId)
      return;

    setLoading(true);

    const {
      data,
    } = await supabase

      .from("orders")

      .select(`
        *,
        order_items (*)
      `)

      .eq(
        "id",
        orderId
      )

      .not(
        "status",
        "in",
        "(PAID,CLOSED)"
      )

      .single();

    setOrder(data);

    setLoading(false);

  }

  useEffect(() => {

    loadOrder();

  }, [orderId]);

  const bill =
    useMemo(() => {

      if (!order)
        return null;

      const unpaidItems =
        {
          ...order,

          order_items:
            order.order_items.filter(
              item =>
                item.status !==
                "PAID_SPLIT"
            ),
        };

      return calculateBill(
        unpaidItems
      );

    }, [order]);

  const splitData =
    useMemo(() => {

      if (!order)
        return null;

      return splitBill(
        order,
        splitCount
      );

    }, [
      order,
      splitCount,
    ]);

  async function partialPaymentAction() {

    try {

      setPartialLoading(true);

      const response =
        await fetch(
          "/api/pos/partial-payment",
          {
            method: "POST",

            headers: {
              "Content-Type":
                "application/json",
            },

            body: JSON.stringify({

              tenantId:
                TENANT_ID,

              tableNumber:
                order.table_number,

              paymentMethod,

              amount:
                Number(
                  partialAmount || 0
                ),

              cashierName:
                "SYSTEM",

            }),

          }
        );

      const result =
        await response.json();

      if (!result.success) {

        throw new Error(
          result.error
        );

      }

      alert(
        `Partial payment completed. Remaining balance: ฿${result.result.remainingBalance}`
      );

      window.location.reload();

    } catch (err) {

      console.error(err);

      alert(
        err.message
      );

    } finally {

      setPartialLoading(false);

    }

  }


  function toggleSplitItem(
    itemId
  ) {

    setSelectedItems(
      prev =>

        prev.includes(itemId)

          ? prev.filter(
              id => id !== itemId
            )

          : [
              ...prev,
              itemId,
            ]
    );

  }

  const selectedSplitTotal =
    order?.order_items
      ?.filter(
        item =>
          selectedItems.includes(
            item.id
          )
      )
      ?.reduce(
        (
          sum,
          item
        ) =>

          sum +

          (
            Number(
              item.price || 0
            ) *

            Number(
              item.quantity || 1
            )
          ),

        0
      ) || 0;


  async function paySelectedItems() {

    try {

      if (
        selectedItems.length === 0
      ) {

        alert(
          "Select items first"
        );

        return;
      }

      const selectedOrderItems =
        order.order_items.filter(
          item =>
            selectedItems.includes(
              item.id
            )
        );

      const selectedTotal =
        selectedOrderItems.reduce(
          (
            sum,
            item
          ) =>

            sum +

            (
              Number(
                item.price || 0
              ) *

              Number(
                item.quantity || 1
              )
            ),

          0
        );

      await supabase

        .from("pos_payments")

        .insert({

          tenant_id:
            TENANT_ID,

          order_id:
            order.id,

          payment_type:
            "ITEM_SPLIT",

          amount_paid:
            selectedTotal,

          total_amount:
            selectedTotal,

          change_amount:
            0,

        });

      await supabase

        .from("order_items")

        .update({

          status:
            "PAID_SPLIT",

        })

        .in(
          "id",
          selectedItems
        );

      const remainingItems =
        order.order_items.filter(
          item =>
            !selectedItems.includes(item.id) &&
            item.status !== "PAID_SPLIT"
        );

      if (remainingItems.length === 0) {

        await supabase
          .from("orders")
          .update({
            status: "PAID",
            payment_status: "PAID",
            paid_at: new Date().toISOString(),
          })
          .eq("id", order.id);

        await supabase
          .from("restaurant_tables")
          .update({
            status: "AVAILABLE",
          })
          .eq("table_name", order.table_number);

        alert("All items paid. Table closed.");

        window.location.href = "/tables";

        return;
      }

      alert(
        "Selected items paid"
      );

      window.location.reload();

    } catch (err) {

      console.error(err);

      alert(
        err.message
      );

    }

  }


  function updateTender(
    index,
    field,
    value
  ) {

    setTenders(prev => {

      const updated =
        [...prev];

      updated[index] = {
        ...updated[index],
        [field]: value,
      };

      return updated;

    });

  }

  function addTender() {

    setTenders(prev => [

      ...prev,

      {
        method: "CARD",
        amount: "",
      },

    ]);

  }

  const tenderTotal =
    tenders.reduce(
      (
        sum,
        tender
      ) =>

        sum +
        Number(
          tender.amount || 0
        ),

      0
    );

  const validPaymentTotal =
    (
      order?.payments || []
    )

      .filter(
        payment =>

          payment.payment_status !==
          "VOIDED"
      )

      .reduce(
        (
          sum,
          payment
        ) =>

          sum +

          Number(
            payment.amount_paid || 0
          ),

        0
      );

  const remainingBalance =
    Math.max(
      0,

      Number(
        bill?.total || 0
      ) -

      validPaymentTotal
    );

  const remainingTenderBalance =
    Math.max(
      0,
      remainingBalance -
      tenderTotal
    );


  useEffect(() => {

    if (
      tenders.length === 1 &&
      (
        !tenders[0].amount ||
        Number(tenders[0].amount) === 0
      ) &&
      remainingBalance > 0
    ) {

      setTenders([

        {

          ...tenders[0],

          amount:
            remainingBalance.toFixed(2),

        },

      ]);

    }

  }, [remainingBalance]);



  async function requestVoidItem(
    item
  ) {

    const reason =
      prompt(
        "Void item reason"
      );

    if (!reason)
      return;

    try {

      const res =
        await fetch(
          "/api/pos/items/void",
          {
            method: "POST",

            headers: {
              "Content-Type":
                "application/json",
            },

            body: JSON.stringify({

              item,

              reason,

            }),

          }
        );

      const json =
        await res.json();

      if (!json.success) {
        throw new Error(
          json.error
        );
      }

      alert(
        "Void request submitted"
      );

      window.location.reload();

    } catch (err) {

      console.error(err);

      alert(
        err.message
      );

    }

  }

  async function requestVoid(
    payment
  ) {

    const reason =
      prompt(
        "Void reason"
      );

    if (!reason)
      return;

    try {

      const res =
        await fetch(
          "/api/pos/payments/void",
          {
            method: "POST",

            headers: {
              "Content-Type":
                "application/json",
            },

            body: JSON.stringify({

              payment,

              reason,

            }),

          }
        );

      const json =
        await res.json();

      if (!json.success) {
        throw new Error(
          json.error
        );
      }

      alert(
        "Void request submitted"
      );

    } catch (err) {

      console.error(err);

      alert(
        err.message
      );

    }

  }


  async function completePayment() {

    if (!order)
      return;

    try {

      if (
        tenderTotal <= 0
      ) {

        alert(
          "Enter payment amount"
        );

        return;
      }

      if (
        tenderTotal >
        remainingBalance
      ) {

        alert(
          "Payment exceeds remaining balance"
        );

        return;
      }

      for (
        const tender of
        tenders
      ) {

        if (
          !tender.amount ||
          Number(tender.amount) <= 0
        ) continue;

        const {
          data: payment,
          error,
        } = await supabase

          .from("pos_payments")

          .insert({

            tenant_id:
              TENANT_ID,

            order_id:
              order.id,

            payment_type:
              tender.method,

            amount_paid:
              Number(
                tender.amount
              ),

            total_amount:
              bill.total,

            change_amount:
              0,

          })

          .select()

          .single();

        if (error)
          throw error;

        await postPaymentJournal(
          supabase,
          payment,
          order
        );

      }

      await supabase

        .from("order_items")

        .update({

          status:
            "CLOSED",

          closed_at:
            new Date().toISOString(),

        })

        .eq(
          "order_id",
          order.id
        );

      await updateOrderStatusFromItems(
        order.id
      );

      await supabase

        .from("orders")

        .update({

          status:
            "PAID",

          payment_status:
            "PAID",

          paid_at:
            new Date().toISOString(),

        })

        .eq(
          "id",
          order.id
        );

      await supabase

        .from(
          "restaurant_tables"
        )

        .update({

          status:
            "AVAILABLE",

        })

        .eq(
          "table_name",
          order.table_number
        );

      alert(
        "Payment completed"
      );

      await supabase
        .from("orders")
        .update({
          status: "CLOSED",
          payment_status: "PAID",
          completed_at: new Date().toISOString(),
        })
        .eq("id", order.id);

      await supabase
        .from("restaurant_tables")
        .update({
          status: "AVAILABLE",
        })
        .eq(
          "table_name",
          order.table_number
        );

      await fetch(
        "/api/pos/orders/close",
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json",
          },

          body: JSON.stringify({
            orderId:
              order.id,
          }),

        }
      );

      window.location.href = "/tables";

    } catch (err) {

      console.error(
        err
      );

      alert(
        err.message
      );

    }

  }

  return (

    <PageWrapper
      title="Payments"
      subtitle="Enterprise billing & settlement"
    >

      {loading ? (

        <div className="text-white/40">
          Loading...
        </div>

      ) : order ? (

        <div className="grid grid-cols-3 gap-6">

          <div className="col-span-2 rounded-[30px] border border-white/10 bg-white/[0.03] p-6">

            <div className="mb-8 flex items-center justify-between">

              <div>

                <div className="mb-2 text-xs uppercase tracking-[0.2em] text-violet-400">

                  Table

                </div>

                <div className="text-5xl font-light">

                  {order.table_number}

                </div>

              </div>

              <div className="text-right">

                <div className="mb-2 text-xs uppercase text-white/40">

                  Status

                </div>

                <div className="text-2xl text-emerald-400">

                  {order.status}

                </div>

              </div>

            </div>

            <div className="mb-8 space-y-3">

              {order.order_items?.map(
                item => (

                  <div
                    key={item.id}

                    onClick={() => {

                      if (
                        item.status ===
                        "PAID_SPLIT"
                      ) return;

                      toggleSplitItem(
                        item.id
                      )

                    }}

                    className={`flex cursor-pointer items-center justify-between rounded-2xl border p-4 transition-all ${
                      selectedItems.includes(item.id)
                        ? "border-emerald-400 bg-emerald-500/10"
                        : "border-white/10 bg-black/20"
                    }`}
                  >

                    <div>

                      <div className="text-lg">

                        {
                          item.item_name ||
                          item.dish_name
                        }

                      </div>

                      <div className="mt-1 text-xs uppercase text-white/40">

                        {
                          item.status === "PAID_SPLIT"

                            ? "PAID"

                            : item.status
                        }

                      </div>

                    </div>

                    <div className="text-right">

                      <div className="text-lg">

                        x{
                          item.quantity
                        }

                      </div>

                      <div className="text-sm text-violet-400">

                        ฿{
                          Number(
                            item.price || 0
                          ) *
                          Number(
                            item.quantity || 0
                          )
                        }

                      </div>

                      <button
                        onClick={() =>
                          requestVoidItem(
                            item
                          )
                        }
                        className="mt-3 rounded-xl bg-red-500 px-4 py-2 text-xs font-semibold text-white"
                      >

                        VOID ITEM

                      </button>

                    </div>

                  </div>

                )
              )}

            </div>

            <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-4">

              <div className="mb-2 text-xs uppercase tracking-[0.2em] text-emerald-400">

                Selected Split Total

              </div>

              <div className="text-3xl font-light text-white">

                ฿{
                  selectedSplitTotal.toLocaleString()
                }

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
                value={
                  bill?.subtotal
                }
              />

              <SummaryRow
                label="Service"
                value={
                  bill?.serviceAmount
                }
              />

              <SummaryRow
                label="Tax"
                value={
                  bill?.taxAmount
                }
              />

              <div className="border-t border-white/10 pt-4">

                <SummaryRow
                  label="Total"
                  value={
                    bill?.total
                  }
                  big
                />

              </div>

              <div className="mt-6">

                <button
                  onClick={() =>
                    requestVoid(
                      {
                        id: order.id,
                      }
                    )
                  }
                  className="w-full rounded-2xl bg-red-500 py-4 text-lg font-semibold text-white"
                >

                  VOID PAYMENT

                </button>

              </div>

            </div>


            <div className="mb-6">

              <div className="mb-3 text-sm uppercase tracking-[0.2em] text-white/40">

                Payment Methods

              </div>

              <div className="space-y-4">

                {tenders.map(
                  (
                    tender,
                    index
                  ) => (

                    <div
                      key={index}
                      className="rounded-2xl border border-white/10 bg-black/20 p-4"
                    >

                      <div className="mb-3">

                        <select
                          value={tender.method}
                          onChange={e =>
                            updateTender(
                              index,
                              "method",
                              e.target.value
                            )
                          }
                          className="w-full rounded-xl bg-black/40 p-3 text-white"
                        >

                          {PAYMENT_OPTIONS.map(
                            option => (

                              <option
                                key={option.value}
                                value={option.value}
                              >
                                {option.label}
                              </option>

                            )
                          )}

                        </select>

                      </div>

                      <input
                        type="number"
                        value={tender.amount}
                        onChange={e =>
                          updateTender(
                            index,
                            "amount",
                            e.target.value
                          )
                        }
                        placeholder="Amount"
                        className="w-full rounded-xl bg-black/40 p-3 text-white"
                      />

                    </div>

                  )
                )}

                <button
                  onClick={addTender}
                  className="w-full rounded-2xl border border-dashed border-violet-500 py-3 text-violet-400"
                >

                  + ADD PAYMENT METHOD

                </button>

                <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-4">

                  <div className="mb-2 text-xs uppercase tracking-[0.2em] text-emerald-400">

                    Remaining Balance

                  </div>

                  <div className="text-3xl font-light text-white">

                    ฿{
                      remainingTenderBalance.toLocaleString()
                    }

                  </div>

                </div>

              </div>

            </div>
            <div className="mb-6">

              <div className="mb-3 text-sm uppercase tracking-[0.2em] text-white/40">

                Split Bill

              </div>

              <select
                value={
                  splitCount
                }
                onChange={e =>
                  setSplitCount(
                    Number(
                      e.target.value
                    )
                  )
                }
                className="h-12 w-full rounded-2xl border border-white/10 bg-black/20 px-4"
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

            </div>

            <div className="space-y-4">

              <input
                type="number"
                value={partialAmount}
                onChange={e => setPartialAmount(e.target.value)}
                placeholder="Partial amount"
                className="h-14 w-full rounded-2xl border border-white/10 bg-black/30 px-4 text-white outline-none"
              />

              <button
                onClick={partialPaymentAction}
                disabled={partialLoading}
                className="flex h-14 w-full items-center justify-center rounded-2xl bg-orange-500 text-lg font-semibold text-black"
              >
                PARTIAL PAYMENT
              </button>

              <button
                onClick={completePayment}
                className="flex h-16 w-full items-center justify-center gap-3 rounded-2xl bg-emerald-500 text-lg font-semibold text-black transition-all hover:bg-emerald-400"
              >

                <CheckCircle2 className="h-6 w-6" />

                COMPLETE PAYMENT

              </button>

            </div>

          </div>

        </div>

      ) : (

        <div className="text-white/40">

          Payment unavailable

        </div>

      )}

    </PageWrapper>

  );

}

function SummaryRow({
  label,
  value,
  big,
}) {

  return (

    <div className="flex items-center justify-between">

      <div
        className={
          big
            ? "text-xl"
            : "text-white/60"
        }
      >

        {label}

      </div>

      <div
        className={
          big
            ? "text-3xl font-light"
            : "text-lg"
        }
      >

        ฿{
          Number(
            value || 0
          ).toFixed(2)
        }

      </div>

    </div>

  );

}
