"use client";

export const dynamic = "force-dynamic";

import {
  useEffect,
  useState,
} from "react";

import { supabase } from "@/lib/shared/supabase/client";

export default function ProductionLogsPage() {

  const [
    organizationId,
    setOrganizationId,
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

    async function loadOrganization() {

      const {
        data: { user },
      } =
        await supabase.auth.getSession();

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
        data?.organization_id
      ) {

        setOrganizationId(
          data.organization_id
        );
      }
    }

    loadOrganization();

  }, []);

  // ===== LOAD =====
  async function loadLogs() {

    if (!organizationId) {
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
        "organization_id",
        organizationId
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
    organizationId,
  ]);

  // ===== REALTIME =====
  useEffect(() => {

    if (!organizationId) {
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
            service_unit:
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
    organizationId,
  ]);

  return (

    <div className="min-h-screen bg-[#F7F6F3] text-[#191919] overflow-hidden">

      {/* ===== HEADER ===== */}
      <div className="flex flex-col gap-4 border-b border-white/5 px-4 py-6 sm:px-6 lg:h-28 lg:flex-row lg:items-center lg:justify-between lg:px-12 lg:py-0">

        <div>

          <div className="text-xs tracking-[0.35em] uppercase text-cyan-400 mb-3">
            PRODUCTION
          </div>

          <div className="text-3xl font-semibold tracking-tight sm:text-4xl lg:text-6xl">
            Production Analytics
          </div>

        </div>

        <div className="flex h-10 w-fit items-center rounded-2xl border border-cyan-500/20 bg-cyan-500/5 px-4 text-[10px] uppercase tracking-[0.22em] text-cyan-400 lg:h-14 lg:rounded-3xl lg:px-6 lg:text-xs lg:tracking-[0.3em]">
          LIVE COSTING
        </div>

      </div>

      {/* ===== TOTALS ===== */}
      <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-3 sm:p-6 lg:gap-7 lg:p-10">

        <div className="rounded-[28px] border border-emerald-500/20 bg-emerald-500/5 p-5 lg:rounded-[40px] lg:p-10">

          <div className="text-xs uppercase tracking-[0.3em] text-emerald-400 mb-6">
            Sales
          </div>

          <div className="text-4xl font-light sm:text-3xl lg:text-7xl">
            ฿{totals.sales}
          </div>

        </div>

        <div className="rounded-[28px] border border-red-500/20 bg-red-500/5 p-5 lg:rounded-[40px] lg:p-10">

          <div className="text-xs uppercase tracking-[0.3em] text-red-400 mb-6">
            Production Cost
          </div>

          <div className="text-4xl font-light sm:text-3xl lg:text-7xl">
            ฿{totals.cost}
          </div>

        </div>

        <div className="rounded-[28px] border border-cyan-500/20 bg-cyan-500/5 p-5 lg:rounded-[40px] lg:p-10">

          <div className="text-xs uppercase tracking-[0.3em] text-cyan-400 mb-6">
            Profit
          </div>

          <div className="text-4xl font-light sm:text-3xl lg:text-7xl">
            ฿{totals.profit}
          </div>

        </div>

      </div>

      {/* ===== LOGS ===== */}
      <div className="px-4 pb-6 sm:px-6 lg:px-10 lg:pb-10">

        <div className="space-y-3 md:hidden">
          {logs.map((log) => (
            <div key={log.id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <div className="min-w-0 truncate text-sm font-semibold">{log.dish_id}</div>
              <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
                <div><div className="text-[9px] uppercase tracking-[0.12em] text-zinc-500">Qty</div><div className="mt-1">{log.quantity}</div></div>
                <div><div className="text-[9px] uppercase tracking-[0.12em] text-zinc-500">Sales</div><div className="mt-1 text-emerald-400">฿{log.sales_price}</div></div>
                <div><div className="text-[9px] uppercase tracking-[0.12em] text-zinc-500">Cost</div><div className="mt-1 text-red-400">฿{log.production_cost}</div></div>
                <div><div className="text-[9px] uppercase tracking-[0.12em] text-zinc-500">Profit</div><div className="mt-1 text-cyan-400">฿{log.profit}</div></div>
              </div>
            </div>
          ))}
        </div>

        <div className="hidden overflow-hidden rounded-[40px] border border-white/10 md:block">
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
