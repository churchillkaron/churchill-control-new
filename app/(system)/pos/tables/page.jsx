"use client";

import { useEffect, useState } from "react";

import { supabase } from "@/lib/shared/supabase/client";

import { closeTableSession } from "@/lib/pos/closeTableSession";

import { reopenTableSession } from "@/lib/pos/reopenTableSession";

export default function POSTablesPage() {

  const [
    tenantId,
    setTenantId,
  ] = useState(null);

  const [
    sessions,
    setSessions,
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

    const {
      data,
      error,
    } = await supabase
      .from("table_sessions")
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

    if (!error) {

      setSessions(
        data || []
      );
    }
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
          "tables-live"
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

  // ===== CLOSE =====
  async function closeTable(
    id
  ) {

    await closeTableSession(
      id
    );

    await refresh();
  }

  // ===== REOPEN =====
  async function reopenTable(
    id
  ) {

    await reopenTableSession(
      id
    );

    await refresh();
  }

  return (

    <div className="min-h-screen bg-black text-white overflow-hidden">

      {/* ===== HEADER ===== */}
      <div className="h-24 border-b border-white/5 flex items-center justify-between px-10">

        <div>

          <div className="text-xs tracking-[0.3em] uppercase text-violet-400 mb-2">
            POS
          </div>

          <div className="text-5xl font-semibold">
            Table Sessions
          </div>

        </div>

        <div className="px-5 h-12 rounded-2xl bg-violet-500/10 border border-violet-500/20 text-violet-400 text-xs uppercase tracking-[0.25em] flex items-center">
          {sessions.length} SESSIONS
        </div>

      </div>

      {/* ===== GRID ===== */}
      <div className="p-8 grid grid-cols-4 gap-6">

        {sessions.map((session) => (

          <div
            key={session.id}
            className="rounded-[30px] border border-white/10 bg-white/[0.03] overflow-hidden"
          >

            {/* ===== TOP ===== */}
            <div className="p-6 border-b border-white/5">

              <div className="flex items-start justify-between mb-5">

                <div>

                  <div className="text-xs uppercase tracking-[0.2em] text-violet-400 mb-2">
                    Table
                  </div>

                  <div className="text-5xl font-light">
                    {
                      session.table_number
                    }
                  </div>

                </div>

                <div className={`px-4 h-10 rounded-2xl flex items-center text-xs uppercase tracking-[0.2em] ${
                  session.status === "ACTIVE"
                    ? "bg-orange-500 text-black"
                    : "bg-emerald-500 text-black"
                }`}>
                  {
                    session.status
                  }
                </div>

              </div>

              <div className="space-y-3">

                <div className="flex items-center justify-between">

                  <div className="text-zinc-500 text-sm">
                    Revenue
                  </div>

                  <div className="text-white text-xl font-light">
                    ฿{
                      session.revenue || 0
                    }
                  </div>

                </div>

                <div className="flex items-center justify-between">

                  <div className="text-zinc-500 text-sm">
                    Orders
                  </div>

                  <div className="text-white">
                    {
                      session.orders || 0
                    }
                  </div>

                </div>

              </div>

            </div>

            {/* ===== ACTION ===== */}
            <div className="p-6">

              {session.status ===
                "ACTIVE" ? (

                <button
                  onClick={() =>
                    closeTable(
                      session.id
                    )
                  }
                  className="w-full h-14 rounded-2xl bg-red-500 hover:bg-red-400 transition-all text-white font-medium"
                >
                  CLOSE TABLE
                </button>

              ) : (

                <button
                  onClick={() =>
                    reopenTable(
                      session.id
                    )
                  }
                  className="w-full h-14 rounded-2xl bg-emerald-500 hover:bg-emerald-400 transition-all text-black font-medium"
                >
                  REOPEN TABLE
                </button>

              )}

            </div>

          </div>
        ))}

      </div>

    </div>
  );
}
