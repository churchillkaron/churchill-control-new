"use client";

export const dynamic = "force-dynamic";

import {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  Receipt,
  DollarSign,
  Wallet,
  CreditCard,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";

import PageWrapper from "@/components/PageWrapper";

import {
  getTenantId,
  loadOrders,
  createRealtimeChannel,
} from "@/lib/shared/loaders/loadOperationalData";

export default function BillingPage() {

  const [tenantId, setTenantId] =
    useState(null);

  const [orders, setOrders] =
    useState([]);

  const [loading, setLoading] =
    useState(true);

  // ====================================
  // LOAD
  // ====================================

  async function loadBilling(
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

      await loadBilling(
        currentTenant
      );

      const realtime =
        createRealtimeChannel({

          name:
            "billing-live",

          tables: [
            "orders",
            "payments",
          ],

          callback: () =>
            loadBilling(
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

      const billingOrders =
        orders.filter(
          order =>

            order.status ===
            "BILLING"
        );

      const unpaid =
        orders.filter(
          order =>

            order.payment_status !==
            "PAID"
        );

      const paid =
        orders.filter(
          order =>

            order.payment_status ===
            "PAID"
        );

      const unpaidTotal =
        unpaid.reduce(
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

        billingOrders,

        unpaid,

        paid,

        unpaidTotal,
      };

    }, [orders]);

  return (

    <PageWrapper
      title="Billing"
      subtitle="Enterprise billing operations"
    >

      {loading ? (

        <div className="text-white/40">
          Loading billing...
        </div>

      ) : (

        <div className="space-y-6">

          {/* KPI */}
          <div className="grid grid-cols-4 gap-5">

            <div className="rounded-[28px] border border-orange-500/20 bg-orange-500/10 p-6">

              <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-orange-300 mb-4">

                <Receipt className="w-4 h-4" />

                Billing

              </div>

              <div className="text-4xl font-light text-orange-400">
                {
                  metrics.billingOrders.length
                }
              </div>

            </div>

            <div className="rounded-[28px] border border-red-500/20 bg-red-500/10 p-6">

              <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-red-300 mb-4">

                <AlertTriangle className="w-4 h-4" />

                Unpaid

              </div>

              <div className="text-4xl font-light text-red-400">
                {
                  metrics.unpaid.length
                }
              </div>

            </div>

            <div className="rounded-[28px] border border-emerald-500/20 bg-emerald-500/10 p-6">

              <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-emerald-300 mb-4">

                <CheckCircle2 className="w-4 h-4" />

                Paid

              </div>

              <div className="text-4xl font-light text-emerald-400">
                {
                  metrics.paid.length
                }
              </div>

            </div>

            <div className="rounded-[28px] border border-cyan-500/20 bg-cyan-500/10 p-6">

              <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-cyan-300 mb-4">

                <DollarSign className="w-4 h-4" />

                Outstanding

              </div>

              <div className="text-4xl font-light text-cyan-400">
                ฿{
                  metrics.unpaidTotal.toLocaleString()
                }
              </div>

            </div>

          </div>

          {/* BILLING TABLE */}
          <div className="rounded-[30px] border border-white/10 bg-white/[0.03] overflow-hidden">

            <div className="grid grid-cols-7 gap-4 px-6 py-5 border-b border-white/5 text-xs uppercase tracking-[0.2em] text-white/40">

              <div>Table</div>
              <div>Status</div>
              <div>Payment</div>
              <div>Method</div>
              <div>Total</div>
              <div>Created</div>
              <div>Billing</div>

            </div>

            <div className="divide-y divide-white/5">

              {orders.map(order => {

                const paid =
                  order.payment_status ===
                  "PAID";

                return (

                  <div
                    key={order.id}
                    className="grid grid-cols-7 gap-4 px-6 py-5 items-center"
                  >

                    <div className="text-xl">
                      {
                        order.table_number
                      }
                    </div>

                    <div>

                      <div className={`inline-flex items-center gap-2 px-4 h-10 rounded-2xl text-xs uppercase tracking-[0.2em] ${
                        order.status ===
                        "BILLING"

                          ? "bg-orange-500 text-black"

                          : "bg-white/5 text-white"
                      }`}>

                        {
                          order.status
                        }

                      </div>

                    </div>

                    <div>

                      {paid ? (

                        <div className="inline-flex items-center gap-2 px-4 h-10 rounded-2xl bg-emerald-500 text-black text-xs uppercase tracking-[0.2em]">

                          <CheckCircle2 className="w-4 h-4" />

                          Paid

                        </div>

                      ) : (

                        <div className="inline-flex items-center gap-2 px-4 h-10 rounded-2xl bg-red-500 text-black text-xs uppercase tracking-[0.2em]">

                          <AlertTriangle className="w-4 h-4" />

                          Pending

                        </div>

                      )}

                    </div>

                    <div>

                      <div className="inline-flex items-center gap-2 px-4 h-10 rounded-2xl bg-white/5 text-xs uppercase tracking-[0.2em]">

                        {order.payment_method ===
                        "CARD" ? (

                          <CreditCard className="w-4 h-4" />

                        ) : (

                          <Wallet className="w-4 h-4" />

                        )}

                        {
                          order.payment_method ||

                          "-"
                        }

                      </div>

                    </div>

                    <div className="text-lg text-emerald-400">
                      ฿{
                        Number(
                          order.final_total ||

                          order.total_amount ||

                          0
                        ).toFixed(2)
                      }
                    </div>

                    <div className="text-sm text-white/60">

                      {
                        order.created_at
                          ?.split("T")[0]
                      }

                    </div>

                    <div>

                      <div className="inline-flex items-center gap-2 px-4 h-10 rounded-2xl bg-violet-500 text-white text-xs uppercase tracking-[0.2em]">

                        ACTIVE

                      </div>

                    </div>

                  </div>

                );

              })}

            </div>

          </div>

        </div>

      )}

    </PageWrapper>

  );

}
