"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/shared/supabase/client";
import { useOrganizationRuntime } from "@/lib/hooks/useOrganizationRuntime";

export const dynamic = "force-dynamic";

export default function AnalyticsLivePage() {
  const { organization } = useOrganizationRuntime();
  const organizationId = organization?.id || null;
  const [stats, setStats] = useState(null);

  const refresh = useCallback(async () => {
    if (!organizationId) return;
    const response = await fetch("/api/analytics/revenue", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organizationId }),
    });
    const data = await response.json();
    if (response.ok && data.success) setStats(data);
  }, [organizationId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

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
  }, [organizationId, refresh]);

  if (!stats) {
    return <div className="min-h-screen bg-[#F7F6F3] flex items-center justify-center text-zinc-500 text-2xl">Loading Analytics...</div>;
  }

  return (
    <div className="min-h-screen bg-[#F7F6F3] text-[#191919] overflow-hidden">
      <div className="h-28 border-b border-black/[0.06] flex items-center justify-between px-12">
        <div>
          <div className="text-xs tracking-[0.35em] uppercase text-[#9B6F3F] mb-3">Analytics</div>
          <div className="text-6xl font-semibold tracking-tight">Live Intelligence</div>
        </div>
        <div className="px-6 h-14 rounded-3xl bg-[#FBF3E8] border border-[#D6A66A]/30 text-[#9B6F3F] text-xs uppercase tracking-[0.3em] flex items-center">Realtime Data</div>
      </div>
      <div className="p-10 grid grid-cols-4 gap-7">
        <Metric label="Revenue" value={stats.total_revenue} />
        <Metric label="Active Revenue" value={stats.active_revenue} />
        <Metric label="Avg Order" value={stats.average_order_value} />
        <Metric label="Paid Orders" value={stats.total_orders} />
      </div>
      <div className="px-10 pb-10">
        <div className="rounded-[40px] border border-black/[0.08] bg-[#FBF8F3] p-10">
          <div className="text-xs uppercase tracking-[0.3em] text-zinc-500 mb-8">Hourly Revenue</div>
          <div className="grid grid-cols-6 gap-5">
            {(stats.hourly || []).map(({ hour, revenue }) => (
              <div key={hour} className="rounded-3xl border border-black/[0.06] bg-[#F7F6F3]/40 p-6">
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
    <div className="rounded-[40px] border border-black/[0.08] bg-[#FBF8F3] p-10">
      <div className="text-xs uppercase tracking-[0.3em] text-zinc-500 mb-6">{label}</div>
      <div className="text-5xl font-light">{Number(value || 0).toLocaleString()}</div>
    </div>
  );
}
