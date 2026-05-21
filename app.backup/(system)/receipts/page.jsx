"use client";

export const dynamic = "force-dynamic";

import {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  Receipt,
  Printer,
  CheckCircle2,
  AlertTriangle,
  DollarSign,
} from "lucide-react";

import PageWrapper from "@/components/PageWrapper";

import {
  getTenantId,
  loadOrders,
  createRealtimeChannel,
} from "@/lib/shared/loaders/loadOperationalData";

export default function ReceiptsPage() {

  const [tenantId, setTenantId] =
    useState(null);

  const [orders, setOrders] =
    useState([]);

  const [selectedOrder, setSelectedOrder] =
    useState(null);

  const [loading, setLoading] =
    useState(true);

  // ====================================
  // LOAD
  // ====================================

  async function loadReceipts(
    activeTenantId
  ) {

    const orderData =
      await loadOrders(
        activeTenantId
      );

    setOrders(
      orderData
    );

    setLoading(false);
  }

  // ====================================
  // BOOT
  // ====================================

  useEffect(() => {

    async function boot() {

      const currentTenant =
        await getTenantId();

      if (!currentTenant) {
        setLoading(false);
        return;
      }

      setTenantId(
        currentTenant
      );

      await loadReceipts(
        currentTenant
      );

      const realtime =
        createRealtimeChannel({

          name:
            "receipts-live",

          tables: [
            "orders",
            "payments",
          ],

          callback: () =>
            loadReceipts(
              currentTenant
            ),

        });

      return () => realtime;

    }

    boot();

  }, []);

  // ====================================
  // KPI
  // ====================================

  const metrics =
    useMemo(() => {

      const receipts =
        orders.filter(
          order =>

            order.payment_status ===
            "PAID"
        );

      const total =
        receipts.reduce(
          (sum, order) =>

            sum +

            Number(
              order.final_total ||

              order.total_amount ||

              0
            ),

          0
        );

      return {

        receipts,

        total,
      };

    }, [orders]);

  // ====================================
  // PRINT
  // ====================================

  function printReceipt() {

    window.print();
  }

  return (

    <PageWrapper
      title="Receipts"
      subtitle="Enterprise receipt operations"
    >

      {loading ? (

        <div className="text-white/40">
          Loading receipts...
        </div>

      ) : (

        <div className="grid grid-cols-3 gap-6">

          {/* LEFT */}
          <div className="col-span-2 rounded-[30px] border border-white/10 bg-white/[0.03] overflow-hidden">

            {/* KPI */}
            <div className="grid grid-cols-2 gap-5 p-6 border-b border-white/5">

              <div className="rounded-[24px] border border-emerald-500/20 bg-emerald-500/10 p-5">

                <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-emerald-300 mb-3">

                  <Receipt className="w-4 h-4" />

                  Receipts

                </div>

                <div className="text-4xl font-light text-emerald-400">
                  {
                    metrics.receipts.length
                  }
                </div>

              </div>

              <div className="rounded-[24px] border border-cyan-500/20 bg-cyan-500/10 p-5">

                <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-cyan-300 mb-3">

                  <DollarSign className="w-4 h-4" />

                  Total

                </div>

                <div className="text-4xl font-light text-cyan-400">
                  ฿{
                    metrics.total.toLocaleString()
                  }
                </div>

              </div>

            </div>

            {/* RECEIPTS */}
            <div className="divide-y divide-white/5">

              {metrics.receipts.map(order => {

                const paid =
                  order.payment_status ===
                  "PAID";

                return (

                  <button
                    key={order.id}
                    onClick={() =>
                      setSelectedOrder(
                        order
                      )
                    }
                    className={`w-full text-left px-6 py-5 transition-all ${
                      selectedOrder?.id ===
                      order.id

                        ? "bg-violet-500/10"

                        : "hover:bg-white/[0.02]"
                    }`}
                  >

                    <div className="flex items-center justify-between">

                      <div>

                        <div className="text-2xl">
                          Table {
                            order.table_number
                          }
                        </div>

                        <div className="flex items-center gap-3 mt-2">

                          {paid ? (

                            <div className="inline-flex items-center gap-2 px-3 h-8 rounded-xl bg-emerald-500 text-black text-xs uppercase tracking-[0.2em]">

                              <CheckCircle2 className="w-4 h-4" />

                              Paid

                            </div>

                          ) : (

                            <div className="inline-flex items-center gap-2 px-3 h-8 rounded-xl bg-red-500 text-black text-xs uppercase tracking-[0.2em]">

                              <AlertTriangle className="w-4 h-4" />

                              Pending

                            </div>

                          )}

                          <div className="text-xs uppercase text-white/40">

                            {
                              order.payment_method
                            }

                          </div>

                        </div>

                      </div>

                      <div className="text-right">

                        <div className="text-2xl text-emerald-400">
                          ฿{
                            Number(
                              order.final_total ||

                              order.total_amount ||

                              0
                            ).toFixed(2)
                          }
                        </div>

                        <div className="text-xs text-white/40 mt-2">

                          {
                            order.created_at
                              ?.split("T")[0]
                          }

                        </div>

                      </div>

                    </div>

                  </button>

                );

              })}

            </div>

          </div>

          {/* RECEIPT PREVIEW */}
          <div className="rounded-[30px] border border-white/10 bg-white/[0.03] overflow-hidden h-fit">

            <div className="p-6 border-b border-white/5 flex items-center justify-between">

              <div className="text-2xl font-light">
                Receipt
              </div>

              <button
                onClick={printReceipt}
                className="w-12 h-12 rounded-2xl bg-violet-500 hover:bg-violet-400 transition-all flex items-center justify-center"
              >

                <Printer className="w-5 h-5 text-white" />

              </button>

            </div>

            {selectedOrder ? (

              <div className="p-6 space-y-5">

                <div className="text-center border-b border-dashed border-white/10 pb-5">

                  <div className="text-3xl font-light mb-2">
                    AVANTIQO
                  </div>

                  <div className="text-xs uppercase tracking-[0.2em] text-white/40">
                    Restaurant Receipt
                  </div>

                </div>

                <div className="space-y-3">

                  <div className="flex justify-between">

                    <div className="text-white/40">
                      Table
                    </div>

                    <div>
                      {
                        selectedOrder.table_number
                      }
                    </div>

                  </div>

                  <div className="flex justify-between">

                    <div className="text-white/40">
                      Status
                    </div>

                    <div>
                      {
                        selectedOrder.payment_status
                      }
                    </div>

                  </div>

                  <div className="flex justify-between">

                    <div className="text-white/40">
                      Method
                    </div>

                    <div>
                      {
                        selectedOrder.payment_method
                      }
                    </div>

                  </div>

                  <div className="flex justify-between">

                    <div className="text-white/40">
                      Date
                    </div>

                    <div>
                      {
                        selectedOrder.created_at
                          ?.split("T")[0]
                      }
                    </div>

                  </div>

                </div>

                <div className="border-t border-dashed border-white/10 pt-5">

                  <div className="flex justify-between text-2xl">

                    <div>Total</div>

                    <div className="text-emerald-400">
                      ฿{
                        Number(
                          selectedOrder.final_total ||

                          selectedOrder.total_amount ||

                          0
                        ).toFixed(2)
                      }
                    </div>

                  </div>

                </div>

              </div>

            ) : (

              <div className="p-10 text-center text-white/40">
                Select receipt
              </div>

            )}

          </div>

        </div>

      )}

    </PageWrapper>

  );

}
