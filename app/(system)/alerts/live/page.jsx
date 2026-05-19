"use client";

import {
  useEffect,
  useState,
} from "react";

import { supabase } from "@/lib/shared/supabase/client";

import { loadCriticalAlerts } from "@/lib/alerts/loadCriticalAlerts";

export default function AlertsLivePage() {

  const [
    tenantId,
    setTenantId,
  ] = useState(null);

  const [
    alerts,
    setAlerts,
  ] = useState([]);

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
  async function refresh() {

    if (!tenantId) {
      return;
    }

    const data =
      await loadCriticalAlerts(
        tenantId
      );

    setAlerts(
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
          "alerts-live"
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
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table:
              "kitchen_ticket_items",
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

  function getStyles(
    level
  ) {

    if (
      level === "CRITICAL"
    ) {

      return "border-red-500/20 bg-red-500/5 text-red-400";
    }

    if (
      level === "WARNING"
    ) {

      return "border-orange-500/20 bg-orange-500/5 text-orange-400";
    }

    return "border-emerald-500/20 bg-emerald-500/5 text-emerald-400";
  }

  return (

    <div className="min-h-screen bg-black text-white overflow-hidden">

      {/* ===== HEADER ===== */}
      <div className="h-28 border-b border-white/5 flex items-center justify-between px-12">

        <div>

          <div className="text-xs tracking-[0.35em] uppercase text-red-400 mb-3">
            ALERTS
          </div>

          <div className="text-6xl font-semibold tracking-tight">
            Critical Monitoring
          </div>

        </div>

        <div className="px-6 h-14 rounded-3xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs uppercase tracking-[0.3em] flex items-center">
          LIVE ALERTS
        </div>

      </div>

      {/* ===== ALERT GRID ===== */}
      <div className="p-10 grid grid-cols-3 gap-7">

        {alerts.length === 0 ? (

          <div className="col-span-3 h-[60vh] flex items-center justify-center text-zinc-600 text-3xl">
            No active alerts
          </div>

        ) : (

          alerts.map(
            (
              alert,
              index
            ) => (

              <div
                key={index}
                className={`rounded-[40px] border overflow-hidden ${getStyles(alert.level)}`}
              >

                <div className="p-10">

                  <div className="flex items-center justify-between mb-8">

                    <div className="text-xs uppercase tracking-[0.3em]">
                      {
                        alert.level
                      }
                    </div>

                    <div className="w-14 h-14 rounded-2xl bg-black/30 flex items-center justify-center text-lg">
                      !
                    </div>

                  </div>

                  <div className="text-4xl font-light mb-5">
                    {
                      alert.title
                    }
                  </div>

                  <div className="text-zinc-400 text-lg leading-relaxed">
                    {
                      alert.message
                    }
                  </div>

                </div>

              </div>
            )
          )

        )}

      </div>

    </div>
  );
}
