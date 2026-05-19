"use client";

import {
  useEffect,
  useState,
} from "react";

import { supabase } from "@/lib/shared/supabase/client";

import { loadKitchenPerformance } from "@/lib/production/loadKitchenPerformance";

export default function ProductionPerformancePage() {

  const [
    tenantId,
    setTenantId,
  ] = useState(null);

  const [
    stations,
    setStations,
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
      await loadKitchenPerformance(
        tenantId
      );

    setStations(
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
          "production-performance"
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

  return (

    <div className="min-h-screen bg-black text-white overflow-hidden">

      {/* ===== HEADER ===== */}
      <div className="h-24 border-b border-white/5 flex items-center justify-between px-10">

        <div>

          <div className="text-xs tracking-[0.3em] uppercase text-orange-400 mb-2">
            PRODUCTION
          </div>

          <div className="text-5xl font-semibold">
            Kitchen Performance
          </div>

        </div>

      </div>

      {/* ===== GRID ===== */}
      <div className="p-8 grid grid-cols-3 gap-6">

        {stations.map(
          (
            station,
            index
          ) => (

            <div
              key={index}
              className="rounded-[36px] border border-white/10 bg-white/[0.03] overflow-hidden"
            >

              <div className="p-8">

                <div className="flex items-start justify-between mb-8">

                  <div>

                    <div className="text-xs uppercase tracking-[0.25em] text-orange-400 mb-2">
                      Station
                    </div>

                    <div className="text-4xl font-medium">
                      {
                        station.station
                      }
                    </div>

                  </div>

                  <div className="w-16 h-16 rounded-2xl bg-orange-500 text-black flex items-center justify-center text-2xl font-semibold">
                    {
                      station.total
                    }
                  </div>

                </div>

                <div className="space-y-5">

                  <div className="flex items-center justify-between">

                    <div className="text-zinc-500">
                      Ready
                    </div>

                    <div className="text-2xl font-light text-emerald-400">
                      {
                        station.ready
                      }
                    </div>

                  </div>

                  <div className="flex items-center justify-between">

                    <div className="text-zinc-500">
                      Preparing
                    </div>

                    <div className="text-2xl font-light text-orange-400">
                      {
                        station.preparing
                      }
                    </div>

                  </div>

                  <div className="flex items-center justify-between">

                    <div className="text-zinc-500">
                      Pending
                    </div>

                    <div className="text-2xl font-light text-red-400">
                      {
                        station.pending
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
