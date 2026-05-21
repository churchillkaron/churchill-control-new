"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";

import { supabase } from "@/lib/shared/supabase/client";

import PageWrapper from "@/components/PageWrapper";

export default function ControlFinalPage() {

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

  const [
    closing,
    setClosing,
  ] = useState(null);

  // ===== LOAD =====
  async function loadSessions() {

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
      .eq(
        "status",
        "ACTIVE"
      )
      .order(
        "started_at",
        {
          ascending: true,
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

    loadSessions();

  }, [tenantId]);

  // ===== REALTIME =====
  useEffect(() => {

    if (!tenantId) {
      return;
    }

    const channel =
      supabase
        .channel(
          "control-final-live"
        )

        .on(
          "postgres_changes",
          {
            event: "*",
            schema:
              "public",
            table:
              "table_sessions",
            filter: `tenant_id=eq.${tenantId}`,
          },
          () =>
            loadSessions()
        )

        .subscribe();

    return () => {
      supabase.removeChannel(
        channel
      );
    };

  }, [tenantId]);

  // ===== CLOSE SESSION =====
  async function closeSession(
    session
  ) {

    try {

      setClosing(
        session.id
      );

      // ===== COMPLETE ORDERS =====
      await supabase
        .from("orders")
        .update({
          status:
            "COMPLETED",

          kitchen_status:
            "COMPLETED",
        })
        .eq(
          "tenant_id",
          tenantId
        )
        .eq(
          "table_number",
          session.table_number
        );

      // ===== CLOSE SESSION =====
      await supabase
        .from("table_sessions")
        .update({
          status:
            "COMPLETED",

          closed_at:
            new Date(),
        })
        .eq(
          "id",
          session.id
        );

      await loadSessions();

    } catch (error) {

      console.error(
        error
      );

      alert(
        "Failed to close session"
      );

    } finally {

      setClosing(
        null
      );
    }
  }

  // ===== TOTAL =====
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

  return (
    <div className="min-h-screen bg-[#050507]">

      <PageWrapper
        title="Control Final"
        subtitle="Operational billing & closing"
      >

        {/* HEADER */}
        <div className="mb-6 grid grid-cols-3 gap-4">

          <div className="rounded-[24px] border border-white/10 bg-[#111117] p-5">

            <div className="text-[11px] tracking-[0.25em] text-white/30">
              ACTIVE TABLES
            </div>

            <div
              className="mt-3 text-5xl"
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

          <div className="rounded-[24px] border border-white/10 bg-[#111117] p-5">

            <div className="text-[11px] tracking-[0.25em] text-white/30">
              LIVE REVENUE
            </div>

            <div
              className="mt-3 text-5xl"
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

          <div className="rounded-[24px] border border-white/10 bg-[#111117] p-5">

            <div className="text-[11px] tracking-[0.25em] text-white/30">
              SYSTEM
            </div>

            <div
              className="mt-3 text-xl text-green-400"
              style={{
                fontWeight: 300,
              }}
            >
              OPERATIONAL
            </div>

          </div>

        </div>

        {/* TABLES */}
        {loading ? (

          <div className="text-white/40">
            Loading sessions...
          </div>

        ) : (

          <div className="grid grid-cols-3 gap-4">

            {sessions.map(
              (session) => {

                const duration =
                  Math.floor(
                    (
                      Date.now() -
                      new Date(
                        session.started_at
                      ).getTime()
                    ) / 60000
                  );

                return (

                  <div
                    key={session.id}
                    className="rounded-[24px] border border-white/10 bg-[#111117] p-5"
                  >

                    {/* HEADER */}
                    <div className="flex items-start justify-between">

                      <div>

                        <div className="text-[11px] tracking-[0.25em] text-white/30">
                          TABLE
                        </div>

                        <div
                          className="mt-2 text-4xl"
                          style={{
                            fontWeight: 250,
                            letterSpacing: "-0.06em",
                          }}
                        >
                          {
                            session.table_number
                          }
                        </div>

                      </div>

                      <div className="rounded-full bg-orange-500/10 px-3 py-1 text-[11px] tracking-[0.15em] text-orange-400">
                        ACTIVE
                      </div>

                    </div>

                    {/* METRICS */}
                    <div className="mt-5 grid grid-cols-3 gap-2">

                      <div className="rounded-[14px] border border-white/10 bg-black/20 p-3">

                        <div className="text-[10px] tracking-[0.18em] text-white/30">
                          TIME
                        </div>

                        <div
                          className="mt-2 text-lg"
                          style={{
                            fontWeight: 250,
                          }}
                        >
                          {
                            duration
                          }m
                        </div>

                      </div>

                      <div className="rounded-[14px] border border-white/10 bg-black/20 p-3">

                        <div className="text-[10px] tracking-[0.18em] text-white/30">
                          ORDERS
                        </div>

                        <div
                          className="mt-2 text-lg"
                          style={{
                            fontWeight: 250,
                          }}
                        >
                          {
                            session.orders
                          }
                        </div>

                      </div>

                      <div className="rounded-[14px] border border-white/10 bg-black/20 p-3">

                        <div className="text-[10px] tracking-[0.18em] text-white/30">
                          REVENUE
                        </div>

                        <div
                          className="mt-2 text-lg"
                          style={{
                            fontWeight: 250,
                          }}
                        >
                          ฿
                          {
                            session.revenue
                          }
                        </div>

                      </div>

                    </div>

                    {/* ACTION */}
                    <div className="mt-5">

                      <button
                        onClick={() =>
                          closeSession(
                            session
                          )
                        }
                        disabled={
                          closing ===
                          session.id
                        }
                        className="w-full rounded-[18px] bg-[#8B5CF6] px-5 py-4 text-sm text-white transition hover:bg-[#9D6BFF] disabled:opacity-40"
                      >
                        {closing ===
                        session.id
                          ? "CLOSING..."
                          : "CLOSE TABLE"}
                      </button>

                    </div>

                  </div>
                );
              }
            )}

          </div>

        )}

      </PageWrapper>

    </div>
  );
}
