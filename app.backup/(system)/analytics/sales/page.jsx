"use client";

export const dynamic = "force-dynamic";

import {
  useEffect,
  useState,
} from "react";

import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  Tooltip,
} from "recharts";

import { supabase } from "@/lib/shared/supabase/client";

import { loadHourlySales } from "@/lib/analytics/loadHourlySales";

export default function AnalyticsSalesPage() {

  const [
    tenantId,
    setTenantId,
  ] = useState(null);

  const [
    sales,
    setSales,
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
      await loadHourlySales(
        tenantId
      );

    setSales(
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
          "analytics-live"
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

          <div className="text-xs tracking-[0.3em] uppercase text-violet-400 mb-2">
            ANALYTICS
          </div>

          <div className="text-5xl font-semibold">
            Hourly Sales
          </div>

        </div>

      </div>

      {/* ===== CHART ===== */}
      <div className="p-8">

        <div className="rounded-[36px] border border-white/10 bg-white/[0.03] p-8 h-[700px]">

          <div className="text-sm uppercase tracking-[0.25em] text-violet-400 mb-8">
            Today Revenue Flow
          </div>

          <ResponsiveContainer
            width="100%"
            height="90%"
          >

            <AreaChart
              data={sales}
            >

              <defs>

                <linearGradient
                  id="sales"
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >

                  <stop
                    offset="0%"
                    stopColor="#8b5cf6"
                    stopOpacity={0.8}
                  />

                  <stop
                    offset="100%"
                    stopColor="#8b5cf6"
                    stopOpacity={0}
                  />

                </linearGradient>

              </defs>

              <XAxis
                dataKey="hour"
                stroke="#71717a"
              />

              <Tooltip />

              <Area
                type="monotone"
                dataKey="revenue"
                stroke="#8b5cf6"
                fillOpacity={1}
                fill="url(#sales)"
              />

            </AreaChart>

          </ResponsiveContainer>

        </div>

      </div>

    </div>
  );
}
