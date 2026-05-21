"use client";

export const dynamic = "force-dynamic";

import {
  useEffect,
  useState,
} from "react";

import { supabase } from "@/lib/shared/supabase/client";

import { loadDailyPayrollPreview } from "@/lib/payroll/loadDailyPayrollPreview";

export default function PayrollLivePage() {

  const [
    tenantId,
    setTenantId,
  ] = useState(null);

  const [
    payroll,
    setPayroll,
  ] = useState([]);

  // ===== LOAD TENANT =====
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
  async function refresh() {

    if (!tenantId) {
      return;
    }

    const data =
      await loadDailyPayrollPreview(
        tenantId
      );

    setPayroll(
      data || []
    );
  }

  useEffect(() => {

    refresh();

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
          "payroll-live"
        )
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table:
              "orders",
          },
          refresh
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
      <div className="h-24 border-b border-white/5 flex items-center justify-between px-10">

        <div>

          <div className="text-xs tracking-[0.3em] uppercase text-emerald-400 mb-2">
            PAYROLL
          </div>

          <div className="text-5xl font-semibold">
            Live Payouts
          </div>

        </div>

      </div>

      {/* ===== GRID ===== */}
      <div className="p-8 grid grid-cols-3 gap-6">

        {payroll.map(
          (
            member,
            index
          ) => (

            <div
              key={index}
              className="rounded-[36px] border border-white/10 bg-white/[0.03] overflow-hidden"
            >

              <div className="p-8">

                <div className="flex items-start justify-between mb-8">

                  <div>

                    <div className="text-xs uppercase tracking-[0.25em] text-emerald-400 mb-2">
                      Staff
                    </div>

                    <div className="text-3xl font-medium">
                      {
                        member.staff_name
                      }
                    </div>

                  </div>

                  <div className="w-14 h-14 rounded-2xl bg-emerald-500 text-black flex items-center justify-center text-xl font-semibold">
                    #{index + 1}
                  </div>

                </div>

                <div className="space-y-5">

                  <div className="flex items-center justify-between">

                    <div className="text-zinc-500">
                      Orders
                    </div>

                    <div className="text-2xl font-light">
                      {
                        member.orders
                      }
                    </div>

                  </div>

                  <div className="flex items-center justify-between">

                    <div className="text-zinc-500">
                      Revenue
                    </div>

                    <div className="text-2xl font-light">
                      ฿{
                        member.revenue
                      }
                    </div>

                  </div>

                  <div className="flex items-center justify-between border-t border-white/5 pt-5">

                    <div className="text-zinc-400 uppercase tracking-[0.2em] text-xs">
                      Payout
                    </div>

                    <div className="text-4xl font-light text-emerald-400">
                      ฿{
                        member.payout
                      }
                    </div>

                  </div>

                </div>

              </div>

            </div>
          )
        )}

      </div>

    </div>
  );
}
