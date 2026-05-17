"use client";

import { useEffect, useState } from "react";

import { supabase } from "@/lib/shared/supabase/client";

import PageWrapper from "@/components/PageWrapper";

export default function ManagementPage() {

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
  async function loadManagement() {

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
      )
      .limit(20);

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

    loadManagement();

  }, [tenantId]);

  // ===== METRICS =====
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

  const activeTables =
    sessions.filter(
      (s) =>
        s.status ===
        "ACTIVE"
    ).length;

  const completedTables =
    sessions.filter(
      (s) =>
        s.status ===
          "COMPLETED" ||
        s.status ===
          "PAID"
    ).length;

  return (
    <div className="min-h-screen bg-[#050507]">

      <PageWrapper
        title="Management"
        subtitle="Operational management overview"
      >

        {loading ? (

          <div className="text-white/40">
            Loading management...
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
                    totalRevenue
                  }
                </div>

              </div>

              <div className="rounded-[24px] border border-orange-500/20 bg-orange-500/10 p-6">

                <div className="text-[11px] tracking-[0.25em] text-orange-300/60">
                  ACTIVE TABLES
                </div>

                <div
                  className="mt-4 text-5xl text-orange-400"
                  style={{
                    fontWeight: 250,
                    letterSpacing: "-0.08em",
                  }}
                >
                  {
                    activeTables
                  }
                </div>

              </div>

              <div className="rounded-[24px] border border-green-500/20 bg-green-500/10 p-6">

                <div className="text-[11px] tracking-[0.25em] text-green-300/60">
                  COMPLETED
                </div>

                <div
                  className="mt-4 text-5xl text-green-400"
                  style={{
                    fontWeight: 250,
                    letterSpacing: "-0.08em",
                  }}
                >
                  {
                    completedTables
                  }
                </div>

              </div>

              <div className="rounded-[24px] border border-white/10 bg-[#111117] p-6">

                <div className="text-[11px] tracking-[0.25em] text-white/30">
                  SYSTEM STATUS
                </div>

                <div
                  className="mt-5 text-xl text-green-400"
                  style={{
                    fontWeight: 300,
                  }}
                >
                  OPERATIONAL
                </div>

              </div>

            </div>

            {/* TABLE */}
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

                        <div
                          className={`inline-flex rounded-full px-3 py-1 text-[11px] tracking-[0.15em] ${
                            session.status ===
                            "ACTIVE"
                              ? "border border-orange-500/20 bg-orange-500/10 text-orange-400"
                              : session.status ===
                                "PAID"
                              ? "border border-green-500/20 bg-green-500/10 text-green-400"
                              : "border border-blue-500/20 bg-blue-500/10 text-blue-400"
                          }`}
                        >
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
