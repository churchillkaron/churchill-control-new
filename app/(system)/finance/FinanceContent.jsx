"use client";

import { useEffect, useState } from "react";

import { supabase } from "@/lib/shared/supabase/client";

import PageWrapper from "@/components/PageWrapper";

export default function FinanceContent() {

  const [
    tenantId,
    setTenantId,
  ] = useState(null);

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    finance,
    setFinance,
  ] = useState({
    grossRevenue: 0,
    paidRevenue: 0,
    unpaidRevenue: 0,
    activeRevenue: 0,
    serviceCharge: 0,
    vatCollected: 0,
    completedSessions: 0,
  });

  async function loadFinance() {

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

    const grossRevenue =
      sessions.reduce(
        (
          sum,
          session
        ) =>
          sum +
          Number(
            session.final_total ||
            session.revenue ||
            0
          ),
        0
      );

    const paidRevenue =
      sessions
        .filter(
          (s) =>
            s.status ===
            "PAID"
        )
        .reduce(
          (
            sum,
            session
          ) =>
            sum +
            Number(
              session.final_total ||
              session.revenue ||
              0
            ),
          0
        );

    const activeRevenue =
      sessions
        .filter(
          (s) =>
            s.status ===
            "ACTIVE"
        )
        .reduce(
          (
            sum,
            session
          ) =>
            sum +
            Number(
              session.final_total ||
              session.revenue ||
              0
            ),
          0
        );

    const unpaidRevenue =
      grossRevenue -
      paidRevenue;

    const serviceCharge =
      sessions.reduce(
        (
          sum,
          session
        ) =>
          sum +
          Number(
            session.service_charge_amount ||
            0
          ),
        0
      );

    const vatCollected =
      sessions.reduce(
        (
          sum,
          session
        ) =>
          sum +
          Number(
            session.vat_amount ||
            0
          ),
        0
      );

    const completedSessions =
      sessions.filter(
        (s) =>
          s.status ===
            "PAID" ||
          s.status ===
            "COMPLETED"
      ).length;

    setFinance({

      grossRevenue,

      paidRevenue,

      unpaidRevenue,

      activeRevenue,

      serviceCharge,

      vatCollected,

      completedSessions,
    });

    setLoading(false);
  }

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

  useEffect(() => {

    if (!tenantId) {
      return;
    }

    loadFinance();

  }, [tenantId]);

  return (
    <div className="min-h-screen bg-[#050507]">

      <PageWrapper
        title="Finance"
        subtitle="Operational financial control"
      >

        {loading ? (

          <div className="text-white/40">
            Loading finance...
          </div>

        ) : (

          <div className="space-y-6">

            <div className="grid grid-cols-4 gap-4">

              <div className="rounded-[24px] border border-green-500/20 bg-green-500/10 p-6">

                <div className="text-[11px] tracking-[0.25em] text-green-300/60">
                  GROSS REVENUE
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
                    Math.round(
                      finance.grossRevenue
                    )
                  }
                </div>

              </div>

              <div className="rounded-[24px] border border-blue-500/20 bg-blue-500/10 p-6">

                <div className="text-[11px] tracking-[0.25em] text-blue-300/60">
                  PAID REVENUE
                </div>

                <div
                  className="mt-4 text-5xl text-blue-400"
                  style={{
                    fontWeight: 250,
                    letterSpacing: "-0.08em",
                  }}
                >
                  ฿
                  {
                    Math.round(
                      finance.paidRevenue
                    )
                  }
                </div>

              </div>

              <div className="rounded-[24px] border border-orange-500/20 bg-orange-500/10 p-6">

                <div className="text-[11px] tracking-[0.25em] text-orange-300/60">
                  ACTIVE REVENUE
                </div>

                <div
                  className="mt-4 text-5xl text-orange-400"
                  style={{
                    fontWeight: 250,
                    letterSpacing: "-0.08em",
                  }}
                >
                  ฿
                  {
                    Math.round(
                      finance.activeRevenue
                    )
                  }
                </div>

              </div>

              <div className="rounded-[24px] border border-red-500/20 bg-red-500/10 p-6">

                <div className="text-[11px] tracking-[0.25em] text-red-300/60">
                  UNPAID
                </div>

                <div
                  className="mt-4 text-5xl text-red-400"
                  style={{
                    fontWeight: 250,
                    letterSpacing: "-0.08em",
                  }}
                >
                  ฿
                  {
                    Math.round(
                      finance.unpaidRevenue
                    )
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
