"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/shared/supabase/client";
import { useOrganizationRuntime } from "@/lib/hooks/useOrganizationRuntime";

export const dynamic = "force-dynamic";

export default function AnalyticsLivePage() {
  const { organization } = useOrganizationRuntime();
  const organizationId = organization?.id || null;
  const [stats, setStats] = useState(null);

  async function refresh() {
    if (!organizationId) return;
    const response = await fetch("/api/analytics/revenue", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organizationId }),
    });
    const data = await response.json();
    if (response.ok && data.success) setStats(data);
  }

  useEffect(() => {
    refresh();
  }, [organizationId]);

  useEffect(() => {
    if (!organizationId) return;
    const channel = supabase
      .channel(`analytics-live-${organizationId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "orders",
          filter: `organization_id=eq.${organizationId}`,
        },
        refresh,
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [organizationId]);

  if (!stats) {
    return <div className="min-h-screen bg-black flex items-center justify-center text-zinc-500 text-2xl">Loading Analytics...</div>;
  }

  return (
    <div className="min-h-screen bg-black text-white overflow-hidden">
      <div className="h-28 border-b border-white/5 flex items-center justify-between px-12">
        <div>
          <div className="text-xs tracking-[0.35em] uppercase text-violet-400 mb-3">Analytics</div>
          <div className="text-6xl font-semibold tracking-tight">Live Intelligence</div>
        </div>
        <div className="px-6 h-14 rounded-3xl bg-violet-500/10 border border-violet-500/20 text-violet-400 text-xs uppercase tracking-[0.3em] flex items-center">Realtime Data</div>
      </div>
      <div className="p-10 grid grid-cols-4 gap-7">
        <Metric label="Revenue" value={stats.total_revenue} />
        <Metric label="Active Revenue" value={stats.active_revenue} />
        <Metric label="Avg Order" value={stats.average_order_value} />
        <Metric label="Paid Orders" value={stats.total_orders} />
      </div>
      <div className="px-10 pb-10">
        <div className="rounded-[40px] border border-white/10 bg-white/[0.03] p-10">
          <div className="text-xs uppercase tracking-[0.3em] text-zinc-500 mb-8">Hourly Revenue</div>
          <div className="grid grid-cols-6 gap-5">
            {(stats.hourly || []).map(({ hour, revenue }) => (
              <div key={hour} className="rounded-3xl border border-white/5 bg-black/40 p-6">
                <div className="text-zinc-500 text-sm mb-4">{hour}:00</div>
                <div className="text-3xl font-light text-emerald-400">{Number(revenue || 0).toLocaleString()}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value }) {
  return (
    <div className="rounded-[40px] border border-white/10 bg-white/[0.03] p-10">
      <div className="text-xs uppercase tracking-[0.3em] text-zinc-500 mb-6">{label}</div>
      <div className="text-5xl font-light">{Number(value || 0).toLocaleString()}</div>
    </div>
  );
}
