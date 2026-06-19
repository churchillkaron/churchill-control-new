"use client";

import {
  useEffect,
  useState,
} from "react";

import { supabase }
from "@/lib/shared/supabase/client";

export default function PaymentApprovalsPage() {

  const [
    payments,
    setPayments,
  ] = useState([]);

  async function loadPayments() {

    const {
      data,
    } = await supabase

      .from("payment_transactions")

      .select("*")

      .in(
        "payment_status",
        [
          "VOID_PENDING",
          "REFUND_PENDING",
        ]
      );

    const {
      data: itemVoids,
    } = await supabase

      .from("order_items")

      .select("*")

      .eq(
        "status",
        "VOID_PENDING"
      );

    setPayments([
      ...(data || []),
      ...(itemVoids || []),
    ]);

  }

  async function approvePayment(
    payment
  ) {

    // =========================
    // ORDER ITEM VOID
    // =========================

    if (
      payment.item_name
    ) {

      await supabase

        .from("order_items")

        .update({

          status:
            "VOIDED",

          void_approved_by:
            "MANAGER",

          void_approved_at:
            new Date().toISOString(),

        })

        .eq(
          "id",
          payment.id
        );

      await createVoidReversal({
        orderItem:
          payment,
      });

      await recalculateOrderTotals(
        payment.order_id
      );

      await loadPayments();

      return;

    }

    const reversalAmount =
      Number(
        payment.amount_paid || 0
      ) * -1;

    const {
      data: reversal,
      error: reversalError,
    } = await supabase

      .from("payment_transactions")

      .insert({

        tenant_id:
          payment.tenant_id,

        order_id:
          payment.order_id,

        payment_type:
          "REVERSAL",

        amount_paid:
          reversalAmount,

        total_amount:
          payment.total_amount,

        change_amount:
          0,

        payment_status:
          "VOIDED",

        approved_by:
          "MANAGER",

        approved_at:
          new Date().toISOString(),

        reversal_payment_id:
          payment.id,

        notes:
          `Reversal for payment ${payment.id}`,

      })

      .select()

      .single();

    if (reversalError)
      throw reversalError;

    await supabase

      .from("payment_transactions")

      .update({

        payment_status:
          "VOIDED",

        approved_by:
          "MANAGER",

        approved_at:
          new Date().toISOString(),

      })

      .eq(
        "id",
        payment.id
      );

    await loadPayments();

  }

  async function rejectPayment(
    payment
  ) {

    await supabase

      .from("payment_transactions")

      .update({

        payment_status:
          "PAID",

      })

      .eq(
        "id",
        payment.id
      );

    await loadPayments();

  }

  useEffect(() => {

    loadPayments();

  }, []);

  return (

    <div className="min-h-screen bg-black p-10 text-white">

      <div className="mx-auto max-w-7xl">

        <div className="mb-10">

          <div className="text-6xl font-bold">

            Payment Approvals

          </div>

          <div className="mt-2 text-zinc-500">

            Enterprise Void & Refund Governance

          </div>

        </div>

        <div className="space-y-6">

          {payments.map(
            payment => (

              <div
                key={payment.id}
                className="rounded-3xl border border-zinc-800 bg-zinc-950 p-8"
              >

                <div className="flex items-center justify-between">

                  <div>

                    <div className="text-2xl font-bold">

                      {
                        payment.payment_type
                      }

                    </div>

                    <div className="mt-2 text-zinc-500">

                      {
                        payment.payment_status
                      }

                    </div>

                    <div className="mt-4 text-sm text-red-400">

                      {
                        payment.void_reason
                      }

                    </div>

                  </div>

                  <div className="text-right">

                    <div className="text-4xl font-bold">

                      ฿{
                        Number(
                          payment.amount_paid || 0
                        ).toLocaleString()
                      }

                    </div>

                    <div className="mt-6 flex gap-3">

                      <button
                        onClick={() =>
                          approvePayment(
                            payment
                          )
                        }
                        className="rounded-2xl bg-emerald-500 px-6 py-3 font-semibold text-black"
                      >

                        APPROVE

                      </button>

                      <button
                        onClick={() =>
                          rejectPayment(
                            payment
                          )
                        }
                        className="rounded-2xl bg-red-500 px-6 py-3 font-semibold text-white"
                      >

                        REJECT

                      </button>

                    </div>

                  </div>

                </div>

              </div>

            )
          )}

        </div>

      </div>

    </div>

  );

}
