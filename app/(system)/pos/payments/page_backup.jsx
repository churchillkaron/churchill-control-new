"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";

import PageWrapper from "@/components/PageWrapper";
import { supabase } from "@/lib/shared/supabase/client";

export default function PaymentsPage() {

  const params = useSearchParams();
  const router = useRouter();

  const sessionId =
    params.get("session_id");

  const [session, setSession] = useState(null);
  const [orders, setOrders] = useState([]);
  const [processing, setProcessing] = useState(false);

  const [cashReceived, setCashReceived] =
    useState("");

  async function loadData() {

    if (!sessionId) {
      return;
    }

    // ===== SESSION =====
    const {
      data: sessionData,
    } = await supabase

      .from("table_sessions")

      .select("*")

      .eq(
        "id",
        sessionId
      )

      .single();

    setSession(
      sessionData
    );

    // ===== ORDERS =====
    const {
      data: orderData,
    } = await supabase

      .from("orders")

      .select(`
        *,
        order_items (
          id,
          item_name,
          quantity,
          price,
          course,
          status
        )
      `)

      .eq(
        "session_id",
        sessionId
      )

      .eq(
        "payment_status",
        "UNPAID"
      )

      .order(
        "created_at",
        {
          ascending: true,
        }
      );

    setOrders(
      orderData || []
    );
  }

  useEffect(() => {
    loadData();
  }, [sessionId]);

  // ===== TOTALS =====
  const subtotal =
    useMemo(() => {

      return orders.reduce(
        (
          sum,
          order
        ) =>

          sum +

          Number(
            order.total_amount || 0
          ),

        0
      );

    }, [orders]);

  const serviceCharge =
    subtotal * 0.05;

  const vat =
    subtotal * 0.07;

  const grandTotal =
    subtotal +
    serviceCharge +
    vat;

  const change =
    Math.max(
      0,
      Number(
        cashReceived || 0
      ) - grandTotal
    );

  // ===== FINALIZE =====
  async function finalizePayment(
    method
  ) {

    try {

      setProcessing(true);

      // ===== UPDATE ORDERS =====
      for (const order of orders) {

        await supabase

          .from("orders")

          .update({

            payment_status:
              "PAID",

            payment_method:
              method,

            paid_at:
              new Date().toISOString(),

            kitchen_status:
              "SERVED",

            status:
              "COMPLETED",

          })

          .eq(
            "id",
            order.id
          );
      }

      // ===== CLOSE SESSION =====
      await supabase

        .from("table_sessions")

        .update({

          status:
            "PAID",

          revenue:
            grandTotal,

          closed_at:
            new Date().toISOString(),

        })

        .eq(
          "id",
          sessionId
        );

      // ===== RELEASE TABLE =====
      await supabase

        .from("restaurant_tables")

        .update({

          status:
            "AVAILABLE",

        })

        .eq(
          "table_name",
          session.table_number
        );

      alert(
        "Payment completed"
      );

      router.push(
        "/pos/tables"
      );

    } catch (error) {

      console.error(
        error
      );

      alert(
        error.message
      );

    } finally {

      setProcessing(false);
    }
  }

  return (

    <PageWrapper
      title="Settlement"
      subtitle="Enterprise cashier engine"
    >

      <div className="grid grid-cols-3 gap-6">

        {/* LEFT */}
        <div className="col-span-2 rounded-[30px] border border-white/10 bg-white/[0.03] overflow-hidden">

          <div className="p-6 border-b border-white/5">

            <div className="flex items-center justify-between">

              <div>

                <div className="text-xs uppercase tracking-[0.2em] text-emerald-400 mb-2">
                  Table
                </div>

                <div className="text-5xl font-light">
                  {
                    session?.table_number
                  }
                </div>

              </div>

              <div className="text-right">

                <div className="text-xs uppercase tracking-[0.2em] text-zinc-500 mb-2">
                  Orders
                </div>

                <div className="text-4xl font-light">
                  {
                    orders.length
                  }
                </div>

              </div>

            </div>

          </div>

          {/* ORDERS */}
          <div className="p-6 space-y-4">

            {orders.map(
              order => (

                <div
                  key={order.id}
                  className="rounded-[24px] border border-white/10 bg-black/20 p-5"
                >

                  <div className="space-y-4">

                    {order.order_items?.map(
                      item => (

                        <div
                          key={item.id}
                          className="flex items-center justify-between"
                        >

                          <div>

                            <div className="text-lg">
                              {
                                item.item_name
                              }
                            </div>

                            <div className="text-xs uppercase text-zinc-500">
                              {
                                item.course || "MAIN"
                              }
                            </div>

                          </div>

                          <div className="text-right">

                            <div>
                              x
                              {
                                item.quantity
                              }
                            </div>

                            <div className="text-zinc-400 text-sm">
                              ฿
                              {
                                Number(
                                  item.price
                                ) *
                                Number(
                                  item.quantity
                                )
                              }
                            </div>

                          </div>

                        </div>
                      )
                    )}

                  </div>

                </div>
              )
            )}

          </div>

        </div>

        {/* RIGHT */}
        <div className="rounded-[30px] border border-white/10 bg-white/[0.03] overflow-hidden h-fit">

          <div className="p-6 border-b border-white/5">

            <div className="text-2xl font-light">
              Payment
            </div>

          </div>

          <div className="p-6 space-y-5">

            <div className="flex justify-between">
              <div className="text-zinc-500">
                Subtotal
              </div>

              <div>
                ฿{
                  subtotal.toFixed(2)
                }
              </div>
            </div>

            <div className="flex justify-between">
              <div className="text-zinc-500">
                Service 5%
              </div>

              <div>
                ฿{
                  serviceCharge.toFixed(2)
                }
              </div>
            </div>

            <div className="flex justify-between">
              <div className="text-zinc-500">
                VAT 7%
              </div>

              <div>
                ฿{
                  vat.toFixed(2)
                }
              </div>
            </div>

            <div className="border-t border-white/10 pt-5 flex justify-between text-2xl">
              <div>Total</div>

              <div>
                ฿{
                  grandTotal.toFixed(2)
                }
              </div>
            </div>

            {/* CASH */}
            <div className="space-y-2">

              <div className="text-xs uppercase tracking-[0.2em] text-zinc-500">
                Cash Received
              </div>

              <input
                value={cashReceived}
                onChange={e =>
                  setCashReceived(
                    e.target.value
                  )
                }
                className="w-full h-14 rounded-2xl bg-black/20 border border-white/10 px-5 outline-none"
                placeholder="0.00"
              />

            </div>

            {/* CHANGE */}
            <div className="rounded-2xl border border-white/10 p-5">

              <div className="text-xs uppercase tracking-[0.2em] text-zinc-500 mb-2">
                Change
              </div>

              <div className="text-3xl">
                ฿{
                  change.toFixed(2)
                }
              </div>

            </div>

            {/* ACTIONS */}
            <div className="space-y-3">

              <button
                disabled={processing}
                onClick={() =>
                  finalizePayment(
                    "CASH"
                  )
                }
                className="w-full h-14 rounded-2xl bg-emerald-500 hover:bg-emerald-400 transition-all text-black font-medium"
              >
                PAY CASH
              </button>

              <button
                disabled={processing}
                onClick={() =>
                  finalizePayment(
                    "CARD"
                  )
                }
                className="w-full h-14 rounded-2xl bg-violet-500 hover:bg-violet-400 transition-all text-white font-medium"
              >
                PAY CARD
              </button>

            </div>

          </div>

        </div>

      </div>

    </PageWrapper>
  );
}
