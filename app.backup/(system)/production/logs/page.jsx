"use client";

export const dynamic = "force-dynamic";

import {
  useEffect,
  useState,
} from "react";

import { supabase } from "@/lib/shared/supabase/client";

export default function ProductionLogsPage() {

  const [
    tenantId,
    setTenantId,
  ] = useState(null);

  const [
    logs,
    setLogs,
  ] = useState([]);

  const [
    totals,
    setTotals,
  ] = useState({

    sales: 0,

    cost: 0,

    profit: 0,
  });

  // ===== TENANT =====
  useEffect(() => {

    async function loadTenant() {

      const {
        data: { user },
      } =
        await supabase.auth.getUser();

      if (!user) {
        return;
      }

      const {
        data,
      } = await supabase
        .from("staff_accounts")
        .select("*")
        .eq(
          "auth_user_id",
          user.id
        )
        .single();

      if (
        data?.tenant_id
      ) {

        setTenantId(
          data.tenant_id
        );
      }
    }

    loadTenant();

  }, []);

  // ===== LOAD =====
  async function loadLogs() {

    if (!tenantId) {
      return;
    }

    const {
      data,
      error,
    } = await supabase
      .from(
        "production_logs"
      )
      .select("*")
      .eq(
        "tenant_id",
        tenantId
      )
      .order(
        "created_at",
        {
          ascending: false,
        }
      );

    if (
      error ||
      !data
    ) {

      console.error(
        error
      );

      return;
    }

    setLogs(data);

    let sales = 0;
    let cost = 0;
    let profit = 0;

    data.forEach(
      (row) => {

        sales += Number(
          row.sales_price || 0
        );

        cost += Number(
          row.production_cost || 0
        );

        profit += Number(
          row.profit || 0
        );
      }
    );

    setTotals({

      sales,

      cost,

      profit,
    });
  }

  useEffect(() => {

    loadLogs();

  }, [
    tenantId,
  ]);

  // ===== REALTIME =====
  useEffect(() => {

    if (!tenantId) {
      return;
    }

    const channel =
      supabase
        .channel(
          "production-logs"
        )
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table:
              "production_logs",
          },
          loadLogs
        )
        .subscribe();

    return () => {

      supabase.removeChannel(
        channel
      );
    };

  }, [
    tenantId,
  ]);

  return (

    <div className="min-h-screen bg-black text-white overflow-hidden">

      {/* ===== HEADER ===== */}
      <div className="h-28 border-b border-white/5 px-12 flex items-center justify-between">

        <div>

          <div className="text-xs tracking-[0.35em] uppercase text-cyan-400 mb-3">
            PRODUCTION
          </div>

          <div className="text-6xl font-semibold tracking-tight">
            Production Analytics
          </div>

        </div>

        <div className="px-6 h-14 rounded-3xl border border-cyan-500/20 bg-cyan-500/5 text-cyan-400 text-xs uppercase tracking-[0.3em] flex items-center">
          LIVE COSTING
        </div>

      </div>

      {/* ===== TOTALS ===== */}
      <div className="p-10 grid grid-cols-3 gap-7">

        <div className="rounded-[40px] border border-emerald-500/20 bg-emerald-500/5 p-10">

          <div className="text-xs uppercase tracking-[0.3em] text-emerald-400 mb-6">
            Sales
          </div>

          <div className="text-7xl font-light">
            ฿{totals.sales}
          </div>

        </div>

        <div className="rounded-[40px] border border-red-500/20 bg-red-500/5 p-10">

          <div className="text-xs uppercase tracking-[0.3em] text-red-400 mb-6">
            Production Cost
          </div>

          <div className="text-7xl font-light">
            ฿{totals.cost}
          </div>

        </div>

        <div className="rounded-[40px] border border-cyan-500/20 bg-cyan-500/5 p-10">

          <div className="text-xs uppercase tracking-[0.3em] text-cyan-400 mb-6">
            Profit
          </div>

          <div className="text-7xl font-light">
            ฿{totals.profit}
          </div>

        </div>

      </div>

      {/* ===== LOGS ===== */}
      <div className="px-10 pb-10">

        <div className="rounded-[40px] border border-white/10 overflow-hidden">

          <table className="w-full">

            <thead className="bg-white/5">

              <tr className="text-left">

                <th className="p-6 text-zinc-400 font-medium">
                  Dish
                </th>

                <th className="p-6 text-zinc-400 font-medium">
                  Qty
                </th>

                <th className="p-6 text-zinc-400 font-medium">
                  Sales
                </th>

                <th className="p-6 text-zinc-400 font-medium">
                  Cost
                </th>

                <th className="p-6 text-zinc-400 font-medium">
                  Profit
                </th>

              </tr>

            </thead>

            <tbody>

              {logs.map(
                (log) => (

                  <tr
                    key={log.id}
                    className="border-t border-white/5"
                  >

                    <td className="p-6">
                      {log.dish_id}
                    </td>

                    <td className="p-6">
                      {log.quantity}
                    </td>

                    <td className="p-6 text-emerald-400">
                      ฿{log.sales_price}
                    </td>

                    <td className="p-6 text-red-400">
                      ฿{log.production_cost}
                    </td>

                    <td className="p-6 text-cyan-400">
                      ฿{log.profit}
                    </td>

                  </tr>
                )
              )}

            </tbody>

          </table>

        </div>

      </div>

    </div>
  );
}
