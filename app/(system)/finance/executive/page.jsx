"use client";

export const dynamic = "force-dynamic";

import {
  useEffect,
  useState,
} from "react";

import PageWrapper from "@/components/PageWrapper";

import { supabase }
from "@/lib/shared/supabase/client";

export default function ExecutiveFinancePage() {

  const [
    tenantId,
    setTenantId,
  ] = useState(null);

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    data,
    setData,
  ] = useState(null);

  useEffect(() => {

    async function loadTenant() {

      const {
        data: { session },
      } =
        await supabase.auth.getSession();

      const user =
        session?.user;

      if (!user) return;

      const {
        data,
      } = await supabase
        .from("staff_accounts")
        .select("tenant_id")
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

  useEffect(() => {

    if (
      tenantId
    ) {

      loadExecutive();

    }

  }, [tenantId]);

  async function loadExecutive() {

    try {

      setLoading(true);

      const res =
        await fetch(
          `/api/finance/overview?tenantId=${tenantId}`
        );

      const json =
        await res.json();

      setData(json);

    } catch (error) {

      console.error(error);

    } finally {

      setLoading(false);

    }

  }

  if (loading) {

    return (

      <PageWrapper
        title="Executive Finance"
        subtitle="Loading financial intelligence"
      >

        <div className="p-10 text-zinc-400">
          Loading...
        </div>

      </PageWrapper>

    );

  }

  const metrics =
    data?.metrics || {};

  const financials =
    data?.financials || {};

  return (

    <PageWrapper
      title="Executive Finance"
      subtitle="Enterprise financial command center"
    >

      <div className="p-6 text-white space-y-6">

        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">

          <Card
            title="Revenue"
            value={`฿${Number(
              metrics.revenue || 0
            ).toLocaleString()}`}
          />

          <Card
            title="Cost"
            value={`฿${Number(
              metrics.cost || 0
            ).toLocaleString()}`}
          />

          <Card
            title="Payroll"
            value={`฿${Number(
              metrics.payroll || 0
            ).toLocaleString()}`}
          />

          <Card
            title="Net Margin"
            value={`${financials.netMargin || 0}%`}
          />

          <Card
            title="Gross Margin"
            value={`${financials.grossMargin || 0}%`}
          />

          <Card
            title="Pending AP"
            value={
              metrics.pendingInvoices || 0
            }
          />

        </div>

        <div className="rounded-3xl border border-zinc-800 bg-zinc-950 p-8">

          <div className="flex items-center justify-between">

            <div>

              <div className="text-sm text-zinc-500 mb-3">
                Financial State
              </div>

              <div className="text-6xl font-light">

                {
                  financials.state
                }

              </div>

            </div>

            <div className="text-8xl font-light text-cyan-400">

              {
                financials.score
              }

            </div>

          </div>

        </div>

        <div className="rounded-3xl border border-zinc-800 bg-zinc-950 p-8">

          <div className="text-2xl font-semibold mb-6">
            Financial Alerts
          </div>

          {financials.alerts?.length === 0 ? (

            <div className="text-zinc-500">
              No alerts detected
            </div>

          ) : (

            <div className="space-y-4">

              {financials.alerts?.map(
                (
                  alert,
                  index
                ) => (

                  <div
                    key={index}
                    className="rounded-2xl border border-red-500/20 bg-red-500/10 p-5"
                  >

                    <div className="font-semibold text-red-300 mb-2">

                      {
                        alert.type
                      }

                    </div>

                    <div className="text-zinc-300">

                      {
                        alert.message
                      }

                    </div>

                  </div>

                )
              )}

            </div>

          )}

        </div>

      </div>

    </PageWrapper>

  );

}

function Card({
  title,
  value,
}) {

  return (

    <div className="rounded-3xl border border-zinc-800 bg-zinc-950 p-5">

      <div className="text-sm text-zinc-500 mb-2">

        {title}

      </div>

      <div className="text-3xl font-light">

        {value}

      </div>

    </div>

  );

}
