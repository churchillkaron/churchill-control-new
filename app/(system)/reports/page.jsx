"use client";

import { useEffect, useState } from "react";

import { supabase } from "@/lib/shared/supabase/client";

import PageWrapper from "@/components/PageWrapper";

export default function ReportsPage() {

  const [
    tenantId,
    setTenantId,
  ] = useState(null);

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    report,
    setReport,
  ] = useState({
    totalRevenue: 0,
    totalSessions: 0,
    totalOrders: 0,
    avgSessionRevenue: 0,
    avgOrdersPerSession: 0,
    paidSessions: 0,
    activeSessions: 0,
  });

  // ===== LOAD =====
  async function loadReports() {

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
      );

    if (error) {

      console.error(
        error
      );

      return;
    }

    const sessions =
      data || [];

    const totalRevenue =
      sessions.reduce(
        (
          sum,
          session
        ) =>
          sum +
          Number(
            session.revenue || 0
          ),
        0
      );

    const totalOrders =
      sessions.reduce(
        (
          sum,
          session
        ) =>
          sum +
          Number(
            session.orders || 0
          ),
        0
      );

    const paidSessions =
      sessions.filter(
        (s) =>
          s.status ===
          "PAID"
      ).length;

    const activeSessions =
      sessions.filter(
        (s) =>
          s.status ===
          "ACTIVE"
      ).length;

    setReport({

      totalRevenue,

      totalSessions:
        sessions.length,

      totalOrders,

      avgSessionRevenue:
        sessions.length > 0
          ? Math.round(
              totalRevenue /
                sessions.length
            )
          : 0,

      avgOrdersPerSession:
        sessions.length > 0
          ? (
              totalOrders /
              sessions.length
            ).toFixed(1)
          : 0,

      paidSessions,

      activeSessions,
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

    loadReports();

  }, [tenantId]);

  return (
    <div className="min-h-screen bg-[#050507]">

      <PageWrapper
        title="Reports"
        subtitle="Operational reporting & financial overview"
      >

        {loading ? (

          <div className="text-white/40">
            Loading reports...
          </div>

        ) : (

          <div className="space-y-6">

            {/* TOP */}
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
                    report.totalRevenue
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
                    report.totalSessions
                  }
                </div>

              </div>

              <div className="rounded-[24px] border border-white/10 bg-[#111117] p-6">

                <div className="text-[11px] tracking-[0.25em] text-white/30">
                  TOTAL ORDERS
                </div>

                <div
                  className="mt-4 text-5xl"
                  style={{
                    fontWeight: 250,
                    letterSpacing: "-0.08em",
                  }}
                >
                  {
                    report.totalOrders
                  }
                </div>

              </div>

              <div className="rounded-[24px] border border-green-500/20 bg-green-500/10 p-6">

                <div className="text-[11px] tracking-[0.25em] text-green-300/60">
                  AVG SESSION
                </div>

                <div
                  className="mt-4 text-5xl text-green-400"
                  style={{
                    fontWeight: 250,
                    letterSpacing: "-0.08em",
                  }}
                >
                  ฿
                  {
                    report.avgSessionRevenue
                  }
                </div>

              </div>

            </div>

            {/* SECOND */}
            <div className="grid grid-cols-3 gap-4">

              <div className="rounded-[24px] border border-blue-500/20 bg-blue-500/10 p-6">

                <div className="text-[11px] tracking-[0.25em] text-blue-300/60">
                  AVG ORDERS / SESSION
                </div>

                <div
                  className="mt-4 text-6xl text-blue-400"
                  style={{
                    fontWeight: 250,
                    letterSpacing: "-0.08em",
                  }}
                >
                  {
                    report.avgOrdersPerSession
                  }
                </div>

              </div>

              <div className="rounded-[24px] border border-green-500/20 bg-green-500/10 p-6">

                <div className="text-[11px] tracking-[0.25em] text-green-300/60">
                  PAID SESSIONS
                </div>

                <div
                  className="mt-4 text-6xl text-green-400"
                  style={{
                    fontWeight: 250,
                    letterSpacing: "-0.08em",
                  }}
                >
                  {
                    report.paidSessions
                  }
                </div>

              </div>

              <div className="rounded-[24px] border border-orange-500/20 bg-orange-500/10 p-6">

                <div className="text-[11px] tracking-[0.25em] text-orange-300/60">
                  ACTIVE SESSIONS
                </div>

                <div
                  className="mt-4 text-6xl text-orange-400"
                  style={{
                    fontWeight: 250,
                    letterSpacing: "-0.08em",
                  }}
                >
                  {
                    report.activeSessions
                  }
                </div>

              </div>

            </div>

          </div>

        )}

      </PageWrapper>

    </div>
  );
}
