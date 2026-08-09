"use client";

export const dynamic = "force-dynamic";

import { useCallback, useEffect, useState } from "react";

import { useOrganizationRuntime } from "@/lib/hooks/useOrganizationRuntime";
import { loadPaidOrders } from "@/lib/pos/loadPaidOrders";

export default function POSHistoryPage() {

  const { organization } =
    useOrganizationRuntime();

  const organizationId =
    organization?.id || null;

  const [
    orders,
    setOrders,
  ] = useState([]);

  const [
    loading,
    setLoading,
  ] = useState(true);

  // ===== LOAD =====
  const refreshHistory =
    useCallback(async () => {

      if (!organizationId) {
        setOrders([]);
        setLoading(false);
        return;
      }

      setLoading(true);

      try {
        const data =
          await loadPaidOrders(
            organizationId
          );

        setOrders(
          data || []
        );
      } finally {
        setLoading(false);
      }

    }, [organizationId]);

  useEffect(() => {

    refreshHistory();

  }, [refreshHistory]);

  return (

    <div className="min-h-screen bg-black text-white overflow-hidden">

      {/* ===== HEADER ===== */}
      <div className="h-24 border-b border-white/5 flex items-center justify-between px-10">

        <div>

          <div className="text-[11px] uppercase tracking-[0.3em] text-emerald-400 mb-2">
            POS
          </div>

          <div className="text-5xl font-semibold tracking-tight">
            Payment History
          </div>

        </div>

        <div className="px-5 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs uppercase tracking-[0.25em] flex items-center">
          {orders.length} PAID
        </div>

      </div>

      {/* ===== BODY ===== */}
      <div className="p-8 overflow-auto h-[calc(100vh-96px)]">

        {loading ? (

          <div className="h-full flex items-center justify-center text-zinc-500 text-xl">
            Loading history...
          </div>

        ) : orders.length === 0 ? (

          <div className="h-full flex items-center justify-center text-zinc-600 text-xl">
            No paid orders
          </div>

        ) : (

          <div className="grid grid-cols-4 gap-6">

            {orders.map((order) => (

              <div
                key={order.id}
                className="rounded-[32px] border border-white/10 bg-white/[0.03] backdrop-blur-2xl overflow-hidden"
              >

                {/* ===== TOP ===== */}
                <div className="p-6 border-b border-white/5">

                  <div className="flex items-start justify-between mb-5">

                    <div>

                      <div className="text-[11px] uppercase tracking-[0.25em] text-emerald-400 mb-2">
                        Table
                      </div>

                      <div className="text-4xl font-light">
                        {
                          order.context?.reference ||
                          order.table_reference ||
                          "—"
                        }
                      </div>

                    </div>

                    <div className="px-4 h-10 rounded-2xl bg-emerald-500 text-black text-xs uppercase tracking-[0.2em] flex items-center">
                      PAID
                    </div>

                  </div>

                  <div className="space-y-3">

                    <div className="flex items-center justify-between">

                      <div className="text-zinc-500 text-sm">
                        Staff
                      </div>

                      <div className="text-white text-sm">
                        {
                          order.staff_name
                        }
                      </div>

                    </div>

                    <div className="flex items-center justify-between">

                      <div className="text-zinc-500 text-sm">
                        Total
                      </div>

                      <div className="text-2xl font-light text-white">
                        ฿{
                          order.total_amount
                        }
                      </div>

                    </div>

                    <div className="flex items-center justify-between">

                      <div className="text-zinc-500 text-sm">
                        Paid At
                      </div>

                      <div className="text-xs text-zinc-400">
                        {
                          new Date(
                            order.paid_at
                          ).toLocaleString()
                        }
                      </div>

                    </div>

                  </div>

                </div>

              </div>
            ))}

          </div>

        )}

      </div>

    </div>
  );
}
