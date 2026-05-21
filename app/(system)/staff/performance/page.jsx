"use client";

export const dynamic = "force-dynamic";

import {
  useEffect,
  useState,
} from "react";

import { supabase } from "@/lib/shared/supabase/client";

import { loadStaffPerformance } from "@/lib/staff/loadStaffPerformance";

export default function StaffPerformancePage() {

  const [
    tenantId,
    setTenantId,
  ] = useState(null);

  const [
    staff,
    setStaff,
  ] = useState([]);

  // ===== TENANT =====
  useEffect(() => {

    async function loadTenant() {

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
      await loadStaffPerformance(
        tenantId
      );

    setStaff(
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
          "staff-performance"
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
      <div className="h-28 border-b border-white/5 flex items-center justify-between px-12">

        <div>

          <div className="text-xs tracking-[0.35em] uppercase text-cyan-400 mb-3">
            STAFF
          </div>

          <div className="text-6xl font-semibold tracking-tight">
            Performance Ranking
          </div>

        </div>

        <div className="px-6 h-14 rounded-3xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-xs uppercase tracking-[0.3em] flex items-center">
          LIVE STAFF
        </div>

      </div>

      {/* ===== STAFF GRID ===== */}
      <div className="p-10 grid grid-cols-3 gap-7">

        {staff.map(
          (
            member,
            index
          ) => (

            <div
              key={index}
              className="rounded-[40px] border border-white/10 bg-white/[0.03] overflow-hidden"
            >

              <div className="p-10">

                <div className="flex items-start justify-between mb-10">

                  <div>

                    <div className="text-xs uppercase tracking-[0.3em] text-cyan-400 mb-3">
                      Staff
                    </div>

                    <div className="text-4xl font-light">
                      {
                        member.name
                      }
                    </div>

                  </div>

                  <div className="w-16 h-16 rounded-3xl bg-cyan-500 text-black flex items-center justify-center text-2xl font-semibold">
                    #{index + 1}
                  </div>

                </div>

                <div className="space-y-6">

                  <div className="flex items-center justify-between">

                    <div className="text-zinc-500">
                      Orders
                    </div>

                    <div className="text-3xl font-light">
                      {
                        member.orders
                      }
                    </div>

                  </div>

                  <div className="flex items-center justify-between">

                    <div className="text-zinc-500">
                      Revenue
                    </div>

                    <div className="text-4xl font-light text-emerald-400">
                      ฿{
                        member.revenue
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
