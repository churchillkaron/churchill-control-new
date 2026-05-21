"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";

import { supabase } from "@/lib/shared/supabase/client";

import PageWrapper from "@/components/PageWrapper";

export default function HistoryPage() {

  const [
    tenantId,
    setTenantId,
  ] = useState(null);

  const [
    sessions,
    setSessions,
  ] = useState([]);

  const [
    loading,
    setLoading,
  ] = useState(true);

  // ===== LOAD =====
  async function loadHistory() {

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
      )
      .order(
        "closed_at",
        {
          ascending: false,
        }
      );

    if (error) {

      console.error(
        error
      );

      return;
    }

    setSessions(
      data || []
    );

    setLoading(false);
  }

  // ===== INIT =====
  useEffect(() => {

    async function init() {

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

    loadHistory();

  }, [tenantId]);

  // ===== TOTALS =====
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

  return (
    <div className="min-h-screen bg-[#050507]">

      <PageWrapper
        title="History"
        subtitle="Operational service history"
      >

        {loading ? (

          <div className="text-white/40">
            Loading history...
          </div>

        ) : (

          <div className="space-y-6">

            {/* METRICS */}
            <div className="grid grid-cols-3 gap-4">

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
                    sessions.length
                  }
                </div>

              </div>

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
                    totalRevenue
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
                    totalOrders
                  }
                </div>

              </div>

            </div>

            {/* HISTORY TABLE */}
            <div className="overflow-hidden rounded-[24px] border border-white/10 bg-[#111117]">

              <div className="grid grid-cols-6 border-b border-white/10 px-6 py-4 text-[11px] tracking-[0.25em] text-white/30">

                <div>
                  TABLE
                </div>

                <div>
                  STATUS
                </div>

                <div>
                  ORDERS
                </div>

                <div>
                  REVENUE
                </div>

                <div>
                  STARTED
                </div>

                <div>
                  CLOSED
                </div>

              </div>

              <div className="divide-y divide-white/5">

                {sessions.map(
                  (session) => (

                    <div
                      key={session.id}
                      className="grid grid-cols-6 items-center px-6 py-5 transition hover:bg-white/[0.02]"
                    >

                      <div
                        className="text-2xl"
                        style={{
                          fontWeight: 250,
                          letterSpacing: "-0.05em",
                        }}
                      >
                        {
                          session.table_number
                        }
                      </div>

                      <div>

                        <div className="inline-flex rounded-full border border-blue-500/20 bg-blue-500/10 px-3 py-1 text-[11px] tracking-[0.15em] text-blue-400">
                          {
                            session.status
                          }
                        </div>

                      </div>

                      <div className="text-white/60">
                        {
                          session.orders
                        }
                      </div>

                      <div
                        className="text-lg"
                        style={{
                          fontWeight: 250,
                        }}
                      >
                        ฿
                        {
                          session.revenue
                        }
                      </div>

                      <div className="text-sm text-white/40">

                        {session.started_at
                          ? new Date(
                              session.started_at
                            ).toLocaleString()
                          : "-"}

                      </div>

                      <div className="text-sm text-white/40">

                        {session.closed_at
                          ? new Date(
                              session.closed_at
                            ).toLocaleString()
                          : "-"}

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
