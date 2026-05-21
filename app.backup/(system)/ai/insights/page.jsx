"use client";

export const dynamic = "force-dynamic";

import {
  useEffect,
  useState,
} from "react";

import { supabase } from "@/lib/shared/supabase/client";

import { loadAIInsights } from "@/lib/ai/loadAIInsights";

export default function AIInsightsPage() {

  const [
    tenantId,
    setTenantId,
  ] = useState(null);

  const [
    insights,
    setInsights,
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
      await loadAIInsights(
        tenantId
      );

    setInsights(
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
          "ai-insights"
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
              "kitchen_ticket_items",
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
      <div className="h-28 border-b border-white/5 flex items-center justify-between px-12">

        <div>

          <div className="text-xs tracking-[0.35em] uppercase text-amber-400 mb-3">
            OWNER AI
          </div>

          <div className="text-6xl font-semibold tracking-tight">
            AI Insights
          </div>

        </div>

        <div className="px-6 h-14 rounded-3xl bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs uppercase tracking-[0.3em] flex items-center">
          LIVE ANALYSIS
        </div>

      </div>

      {/* ===== GRID ===== */}
      <div className="p-10 grid grid-cols-3 gap-7">

        {insights.length === 0 ? (

          <div className="col-span-3 h-[60vh] flex items-center justify-center text-zinc-600 text-3xl">
            No AI alerts detected
          </div>

        ) : (

          insights.map(
            (
              insight,
              index
            ) => (

              <div
                key={index}
                className={`rounded-[40px] border overflow-hidden ${
                  insight.level === "HIGH"
                    ? "border-red-500/20 bg-red-500/5"
                    : insight.level === "WARNING"
                    ? "border-orange-500/20 bg-orange-500/5"
                    : "border-emerald-500/20 bg-emerald-500/5"
                }`}
              >

                <div className="p-10">

                  <div className={`text-xs uppercase tracking-[0.3em] mb-6 ${
                    insight.level === "HIGH"
                      ? "text-red-400"
                      : insight.level === "WARNING"
                      ? "text-orange-400"
                      : "text-emerald-400"
                  }`}>
                    {
                      insight.type
                    }
                  </div>

                  <div className="text-4xl font-light leading-tight">
                    {
                      insight.message
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
