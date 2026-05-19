"use client";

import {
  useEffect,
  useState,
} from "react";

import { supabase } from "@/lib/shared/supabase/client";

import { loadWaiterTables } from "@/lib/waiter/loadWaiterTables";

export default function WaiterLivePage() {

  const [
    tenantId,
    setTenantId,
  ] = useState(null);

  const [
    tables,
    setTables,
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
      await loadWaiterTables(
        tenantId
      );

    setTables(
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
          "waiter-live"
        )
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table:
              "table_sessions",
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

          <div className="text-xs tracking-[0.3em] uppercase text-cyan-400 mb-2">
            WAITER
          </div>

          <div className="text-5xl font-semibold">
            Live Tables
          </div>

        </div>

        <div className="px-5 h-12 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-xs uppercase tracking-[0.25em] flex items-center">
          {tables.length} ACTIVE
        </div>

      </div>

      {/* ===== GRID ===== */}
      <div className="p-8 grid grid-cols-4 gap-6">

        {tables.length === 0 ? (

          <div className="col-span-4 h-[60vh] flex items-center justify-center text-zinc-600 text-2xl">
            No active tables
          </div>

        ) : (

          tables.map((table) => (

            <div
              key={table.id}
              className="rounded-[36px] border border-cyan-500/20 bg-cyan-500/5 overflow-hidden"
            >

              <div className="p-8">

                <div className="flex items-start justify-between mb-8">

                  <div>

                    <div className="text-xs uppercase tracking-[0.25em] text-cyan-400 mb-2">
                      Table
                    </div>

                    <div className="text-6xl font-light">
                      {
                        table.table_number
                      }
                    </div>

                  </div>

                  <div className="w-16 h-16 rounded-2xl bg-cyan-500 text-black flex items-center justify-center text-2xl font-semibold">
                    {
                      table.orders || 0
                    }
                  </div>

                </div>

                <div className="space-y-5">

                  <div className="flex items-center justify-between">

                    <div className="text-zinc-500">
                      Revenue
                    </div>

                    <div className="text-3xl font-light">
                      ฿{
                        table.revenue || 0
                      }
                    </div>

                  </div>

                  <div className="flex items-center justify-between">

                    <div className="text-zinc-500">
                      Status
                    </div>

                    <div className="px-4 h-10 rounded-2xl bg-orange-500 text-black flex items-center text-xs uppercase tracking-[0.2em]">
                      {
                        table.status
                      }
                    </div>

                  </div>

                </div>

              </div>

            </div>
          ))

        )}

      </div>

    </div>
  );
}
