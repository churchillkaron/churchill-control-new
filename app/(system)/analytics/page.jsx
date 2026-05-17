"use client";

import { useEffect, useState } from "react";

import { supabase } from "@/lib/shared/supabase/client";

import PageWrapper from "@/components/PageWrapper";

export default function AnalyticsPage() {

  const [
    tenantId,
    setTenantId,
  ] = useState(null);

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    analytics,
    setAnalytics,
  ] = useState({
    revenue: 0,
    sessions: 0,
    avgRevenue: 0,
    avgOrders: 0,
    bestTable: null,
    worstTable: null,
    topRevenue: [],
  });

  // ===== LOAD =====
  async function loadAnalytics() {

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
      .in(
        "status",
        [
          "COMPLETED",
          "CLOSED",
        ]
      );

    if (error) {

      console.error(
        error
      );

      return;
    }

    const sessions =
      data || [];

    const revenue =
      sessions.reduce(
        (
          sum,
          s
        ) =>
          sum +
          Number(
            s.revenue || 0
          ),
        0
      );

    const totalOrders =
      sessions.reduce(
        (
          sum,
          s
        ) =>
          sum +
          Number(
            s.orders || 0
          ),
        0
      );

    const avgRevenue =
      sessions.length > 0
        ? Math.round(
            revenue /
              sessions.length
          )
        : 0;

    const avgOrders =
      sessions.length > 0
        ? (
            totalOrders /
            sessions.length
          ).toFixed(1)
        : 0;

    const sortedRevenue =
      [...sessions].sort(
        (a, b) =>
          Number(
            b.revenue || 0
          ) -
          Number(
            a.revenue || 0
          )
      );

    const tableTotals =
      {};

    sessions.forEach(
      (session) => {

        const table =
          session.table_number;

        if (
          !tableTotals[
            table
          ]
        ) {

          tableTotals[
            table
          ] = 0;
        }

        tableTotals[
          table
        ] += Number(
          session.revenue || 0
        );
      }
    );

    const topRevenue =
      Object.entries(
        tableTotals
      )
        .sort(
          (a, b) =>
            b[1] - a[1]
        )
        .slice(0, 5);

    setAnalytics({

      revenue,

      sessions:
        sessions.length,

      avgRevenue,

      avgOrders,

      bestTable:
        sortedRevenue[0] ||
        null,

      worstTable:
        sortedRevenue[
          sortedRevenue.length -
            1
        ] || null,

      topRevenue,
    });

    setLoading(false);
  }

  // ===== INIT =====
  useEffect(() => {

    async function init() {

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
        .from(
          "staff_accounts"
        )
        .select(
          "tenant_id"
        )
        .eq(
          "auth_user_id",
          user.id
        )
        .single();

      if (
        !data?.tenant_id
      ) {
        return;
      }

      setTenantId(
        data.tenant_id
      );
    }

    init();

  }, []);

  // ===== LOAD =====
  useEffect(() => {

    if (!tenantId) {
      return;
    }

    loadAnalytics();

  }, [tenantId]);

  return (
    <div className="min-h-screen bg-[#050507]">

      <PageWrapper
        title="Analytics"
        subtitle="Operational intelligence & performance"
      >

        {loading ? (

          <div className="text-white/40">
            Loading analytics...
          </div>

        ) : (

          <div className="space-y-6">

            {/* TOP METRICS */}
            <div className="grid grid-cols-4 gap-4">

              <div className="rounded-[24px] border border-white/10 bg-[#111117] p-6">

                <div className="text-[11px] tracking-[0.25em] text-white/30">
                  TOTAL REVENUE
                </div>

                <div
                  className="mt-4 text-5xl"
                  style={{
                    fontWeight: 250,
                    letterSpacing: "-0.08em",
                  }}
                >
                  ฿
                  {
                    analytics.revenue
                  }
                </div>

              </div>

              <div className="rounded-[24px] border border-white/10 bg-[#111117] p-6">

                <div className="text-[11px] tracking-[0.25em] text-white/30">
                  TOTAL SESSIONS
                </div>

                <div
                  className="mt-4 text-5xl"
                  style={{
                    fontWeight: 250,
                    letterSpacing: "-0.08em",
                  }}
                >
                  {
                    analytics.sessions
                  }
                </div>

              </div>

              <div className="rounded-[24px] border border-white/10 bg-[#111117] p-6">

                <div className="text-[11px] tracking-[0.25em] text-white/30">
                  AVG SESSION
                </div>

                <div
                  className="mt-4 text-5xl"
                  style={{
                    fontWeight: 250,
                    letterSpacing: "-0.08em",
                  }}
                >
                  ฿
                  {
                    analytics.avgRevenue
                  }
                </div>

              </div>

              <div className="rounded-[24px] border border-white/10 bg-[#111117] p-6">

                <div className="text-[11px] tracking-[0.25em] text-white/30">
                  AVG ORDERS
                </div>

                <div
                  className="mt-4 text-5xl"
                  style={{
                    fontWeight: 250,
                    letterSpacing: "-0.08em",
                  }}
                >
                  {
                    analytics.avgOrders
                  }
                </div>

              </div>

            </div>

            {/* PERFORMANCE */}
            <div className="grid grid-cols-2 gap-4">

              {/* BEST */}
              <div className="rounded-[24px] border border-green-500/20 bg-green-500/10 p-6">

                <div className="text-[11px] tracking-[0.25em] text-green-300/60">
                  BEST SESSION
                </div>

                {analytics.bestTable && (

                  <div className="mt-5">

                    <div
                      className="text-5xl text-green-400"
                      style={{
                        fontWeight: 250,
                        letterSpacing: "-0.08em",
                      }}
                    >
                      {
                        analytics.bestTable.table_number
                      }
                    </div>

                    <div className="mt-3 text-lg text-white/70">
                      ฿
                      {
                        analytics.bestTable.revenue
                      }
                    </div>

                  </div>
                )}

              </div>

              {/* WORST */}
              <div className="rounded-[24px] border border-red-500/20 bg-red-500/10 p-6">

                <div className="text-[11px] tracking-[0.25em] text-red-300/60">
                  LOWEST SESSION
                </div>

                {analytics.worstTable && (

                  <div className="mt-5">

                    <div
                      className="text-5xl text-red-400"
                      style={{
                        fontWeight: 250,
                        letterSpacing: "-0.08em",
                      }}
                    >
                      {
                        analytics.worstTable.table_number
                      }
                    </div>

                    <div className="mt-3 text-lg text-white/70">
                      ฿
                      {
                        analytics.worstTable.revenue
                      }
                    </div>

                  </div>
                )}

              </div>

            </div>

            {/* TOP TABLES */}
            <div className="rounded-[24px] border border-white/10 bg-[#111117] overflow-hidden">

              <div className="border-b border-white/10 px-6 py-5">

                <div className="text-[11px] tracking-[0.25em] text-white/30">
                  TOP REVENUE TABLES
                </div>

              </div>

              <div className="divide-y divide-white/5">

                {analytics.topRevenue.map(
                  (
                    table,
                    index
                  ) => (

                    <div
                      key={table[0]}
                      className="flex items-center justify-between px-6 py-5"
                    >

                      <div className="flex items-center gap-5">

                        <div className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-black/20 text-sm text-white/50">
                          #
                          {
                            index + 1
                          }
                        </div>

                        <div>

                          <div
                            className="text-2xl"
                            style={{
                              fontWeight: 250,
                              letterSpacing: "-0.05em",
                            }}
                          >
                            {
                              table[0]
                            }
                          </div>

                        </div>

                      </div>

                      <div
                        className="text-2xl"
                        style={{
                          fontWeight: 250,
                        }}
                      >
                        ฿
                        {
                          table[1]
                        }
                      </div>

                    </div>
                  )
                )}

              </div>

            </div>

          </div>

        )}

      </PageWrapper>

    </div>
  );
}
