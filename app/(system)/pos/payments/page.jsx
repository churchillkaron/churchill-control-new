"use client";

export const dynamic = "force-dynamic";

import { useEffect, useMemo, useState } from "react";

import { useSearchParams } from "next/navigation";

import {
  CreditCard,
  Split,
  CheckCircle2,
} from "lucide-react";

import PageWrapper from "@/components/PageWrapper";

import { supabase } from "@/lib/shared/supabase/client";

import {
  calculateBill,
} from "@/lib/payments/calculateBill";

import {
  splitBill,
} from "@/lib/payments/splitBill";

import {
  postPaymentJournal,
} from "@/lib/accounting/postPaymentJournal";

const TENANT_ID =
  "76e2caa6-dd78-49e5-b0f5-1ff94185c2d4";

export default function PaymentsPage() {

  const searchParams =
    useSearchParams();

  const orderId =
    searchParams.get(
      "order_id"
    );

  const [order, setOrder] =
    useState(null);

  const [splitCount, setSplitCount] =
    useState(1);

  const [paymentMethod, setPaymentMethod] =
    useState("CARD");

  const [loading, setLoading] =
    useState(true);

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

      return calculateBill(
        order
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

  async function completePayment() {

    if (!order)
      return;

    try {

      const createdPayments =
        [];

      for (
        const paymentData of
        splitData.payments
      ) {

        const {
          data: payment,
          error,
        } = await supabase

          .from("payments")

          .insert({

            tenant_id:
              TENANT_ID,

            order_id:
              order.id,

            payment_method:
              paymentMethod,

            payment_type:

              splitCount > 1

                ? "SPLIT"

                : "FULL",

            amount:
              paymentData.total,

            tax_amount:
              paymentData.taxAmount,

            service_amount:
              paymentData.serviceAmount,

            status:
              "COMPLETED",

          })

          .select()

          .single();

        if (error)
          throw error;

        createdPayments.push(
          payment
        );

        await postPaymentJournal(
          supabase,
          payment,
          order
        );

      }

      await supabase

        .from("orders")

        .update({

          status:
            "CLOSED",

          payment_status:
            "PAID",

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
        "Payment completed & journal posted"
      );

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
      subtitle="Enterprise billing & accounting settlement"
    >

      {loading ? (

        <div className="text-white/40">
          Loading payment...
        </div>

      ) : order ? (

        <div className="grid grid-cols-3 gap-6">

          <div className="col-span-2 rounded-[30px] border border-white/10 bg-white/[0.03] p-6">

            <div className="flex items-center justify-between mb-8">

              <div>

                <div className="text-xs uppercase tracking-[0.2em] text-violet-400 mb-2">
                  Table
                </div>

                <div className="text-5xl font-light">
                  {
                    order.table_number
                  }
                </div>

              </div>

              <div className="text-right">

                <div className="text-xs uppercase text-white/40 mb-2">
                  Items
                </div>

                <div className="text-4xl">
                  {
                    order.order_items
                      ?.length || 0
                  }
                </div>

              </div>

            </div>

            <div className="space-y-3 mb-8">

              {order.order_items?.map(
                item => (

                  <div
                    key={item.id}
                    className="rounded-2xl border border-white/10 bg-black/20 p-4 flex items-center justify-between"
                  >

                    <div>

                      <div className="text-lg">
                        {
                          item.item_name
                        }
                      </div>

                      <div className="text-xs uppercase text-white/40 mt-1">

                        COURSE {
                          item.course || 1
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

                    </div>

                  </div>

                )
              )}

            </div>

            <div className="grid grid-cols-2 gap-4">

              <div className="rounded-2xl border border-white/10 p-5">

                <div className="flex items-center gap-2 mb-4">

                  <Split className="w-5 h-5 text-orange-400" />

                  <div className="text-lg">
                    Split Bill
                  </div>

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
                  className="w-full h-12 rounded-2xl bg-white/5 border border-white/10 px-4"
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

              <div className="rounded-2xl border border-white/10 p-5">

                <div className="flex items-center gap-2 mb-4">

                  <CreditCard className="w-5 h-5 text-emerald-400" />

                  <div className="text-lg">
                    Payment Method
                  </div>

                </div>

                <select
                  value={
                    paymentMethod
                  }
                  onChange={e =>
                    setPaymentMethod(
                      e.target.value
                    )
                  }
                  className="w-full h-12 rounded-2xl bg-white/5 border border-white/10 px-4"
                >

                  <option value="CARD">
                    CARD
                  </option>

                  <option value="CASH">
                    CASH
                  </option>

                  <option value="TRANSFER">
                    TRANSFER
                  </option>

                </select>

              </div>

            </div>

          </div>

          <div className="rounded-[30px] border border-white/10 bg-white/[0.03] p-6">

            <div className="text-3xl mb-8">
              Bill Summary
            </div>

            <div className="space-y-4 mb-8">

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

            </div>

            <div className="rounded-2xl border border-white/10 bg-black/20 p-5 mb-6">

              <div className="text-xs uppercase tracking-[0.2em] text-white/40 mb-3">
                Split Payment
              </div>

              <div className="text-5xl font-light text-violet-400 mb-3">

                ฿{
                  splitData?.total?.toFixed(
                    2
                  )
                }

              </div>

              <div className="text-sm text-white/40">

                {
                  splitData?.splitCount
                } payment(s)

              </div>

            </div>

            <button
              onClick={
                completePayment
              }
              className="w-full h-16 rounded-[24px] bg-emerald-500 hover:bg-emerald-400 transition-all text-black text-xl flex items-center justify-center gap-3"
            >

              <CheckCircle2 className="w-5 h-5" />

              COMPLETE PAYMENT

            </button>

          </div>

        </div>

      ) : (

        <div className="text-white/40">
          Order not found
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
        className={`${
          big
            ? "text-xl"
            : "text-white/60"
        }`}
      >

        {label}

      </div>

      <div
        className={`${
          big
            ? "text-3xl text-violet-400"

            : "text-lg"
        }`}
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
