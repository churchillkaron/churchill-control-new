"use client";

import { useEffect, useState } from "react";
import { useOrganizationRuntime } from "@/lib/hooks/useOrganizationRuntime";

export const dynamic = "force-dynamic";

export default function RevenueAnalyticsPage() {
  const { organization } = useOrganizationRuntime();
  const [analytics, setAnalytics] = useState(null);
  const [error, setError] = useState("");

  async function loadAnalytics() {
    if (!organization?.id) return;
    setError("");
    const response = await fetch("/api/analytics/revenue", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organizationId: organization.id }),
    });
    const data = await response.json();
    if (!response.ok || !data.success) {
      setError(data.error || "Unable to load analytics");
      return;
    }
    setAnalytics(data);
  }

  useEffect(() => {
    loadAnalytics();
  }, [organization?.id]);

  return (
    <div className="min-h-screen bg-black text-white p-10">
      <div className="text-xs tracking-[0.3em] uppercase text-violet-400 mb-3">Analytics</div>
      <h1 className="text-4xl font-bold mb-8">Revenue Analytics</h1>
      <button onClick={loadAnalytics} disabled={!organization?.id} className="bg-white text-black px-6 py-3 rounded-xl disabled:opacity-40">
        Refresh Analytics
      </button>
      {error && <div className="mt-6 text-red-400">{error}</div>}
      {analytics && (
        <div className="mt-10 grid gap-4 md:grid-cols-3">
          <Metric label="Revenue" value={analytics.total_revenue} />
          <Metric label="Paid Orders" value={analytics.total_orders} />
          <Metric label="Average Order" value={analytics.average_order_value} />
        </div>
      )}
    </div>
  );
}

function Metric({ label, value }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-6">
      <div className="text-xs uppercase tracking-[0.25em] text-zinc-500 mb-3">{label}</div>
      <div className="text-3xl font-light">{Number(value || 0).toLocaleString()}</div>
    </div>
  );
}
