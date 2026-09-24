"use client";

import { useCallback, useEffect, useState } from "react";
import { ResponsiveContainer, AreaChart, Area, XAxis, Tooltip } from "recharts";
import { supabase } from "@/lib/shared/supabase/client";
import { useOrganizationRuntime } from "@/lib/hooks/useOrganizationRuntime";

export const dynamic = "force-dynamic";

export default function AnalyticsSalesPage() {
  const { organization } = useOrganizationRuntime();
  const organizationId = organization?.id || null;
  const [sales, setSales] = useState([]);

  const refresh = useCallback(async () => {
    if (!organizationId) return;
    const response = await fetch("/api/analytics/revenue", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organizationId }),
    });
    const data = await response.json();
    if (response.ok && data.success) setSales(data.hourly || []);
  }, [organizationId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!organizationId) return;
    const channel = supabase
      .channel(`analytics-sales-${organizationId}`)
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

  return (
    <div className="min-h-screen bg-[#F7F6F3] text-[#191919] overflow-hidden">
      <div className="h-24 border-b border-black/[0.06] flex items-center px-10">
        <div>
          <div className="text-xs tracking-[0.3em] uppercase text-amber-400 mb-2">Analytics</div>
          <div className="text-5xl font-semibold">Hourly Sales</div>
        </div>
      </div>
      <div className="p-8">
        <div className="rounded-[36px] border border-black/[0.08] bg-[#FBF8F3] p-8 h-[700px]">
          <div className="text-sm uppercase tracking-[0.25em] text-amber-400 mb-8">Today Revenue Flow</div>
          <ResponsiveContainer width="100%" height="90%">
            <AreaChart data={sales}>
              <XAxis dataKey="hour" stroke="#71717a" />
              <Tooltip />
              <Area type="monotone" dataKey="revenue" stroke="#D6A66A" fill="#D6A66A" fillOpacity={0.18} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
