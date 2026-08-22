"use client";

import { useMemo } from "react";
import AutonomousWatchAlertBridge from "@/components/operator/AutonomousWatchAlertBridge";
import HomeAvantiqoIntelligence from "@/components/operator/HomeAvantiqoIntelligence";
import { useOrganizationRuntime } from "@/lib/hooks/useOrganizationRuntime";

function getGreeting(name) {
  const hour = new Date().getHours();

  let greeting = "Good Evening";
  if (hour >= 5 && hour < 12) greeting = "Good Morning";
  else if (hour >= 12 && hour < 18) greeting = "Good Afternoon";

  return `${greeting}, ${name || "User"}`;
}

export default function OrganizationWorkspacePage() {
  const {
    runtime,
    organization,
    loading,
  } = useOrganizationRuntime();

  const name =
    runtime?.access?.staff?.name ||
    runtime?.activeOrganization?.name ||
    "User";

  const greeting = useMemo(() => getGreeting(name), [name]);

  const briefing = runtime?.briefing || null;
  const metrics = runtime?.metrics || {};
  const alerts = runtime?.alerts || [];
  const activity = runtime?.activity || [];
  const organizationId = organization?.id || null;

  if (loading) {
    return (
      <div className="min-h-screen bg-black text-white p-10">
        Loading workspace...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white">
      <AutonomousWatchAlertBridge organizationId={organizationId} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 p-6">
        <div className="space-y-6">
          <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-6">
            <div className="text-2xl font-light">
              {greeting}
            </div>

            <div className="mt-3 text-white/50 text-sm">
              {briefing?.summary || "Waiting for live operational data..."}
            </div>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-6">
            <div className="text-sm uppercase tracking-[0.2em] text-white/40 mb-4">
              Live Business State
            </div>

            <div className="space-y-2 text-sm text-white/70">
              <div>Revenue: {metrics.revenue?.value ?? "—"}</div>
              <div>Orders: {metrics.orders?.value ?? "—"}</div>
              <div>Service Charge: {metrics.serviceCharge?.value ?? "—"}</div>
              <div>Inventory Alerts: {metrics.inventoryAlerts?.value ?? "—"}</div>
              <div>Pending Approvals: {metrics.approvals?.value ?? "—"}</div>
            </div>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-6">
            <div className="text-sm uppercase tracking-[0.2em] text-white/40 mb-4">
              Priority Signals
            </div>

            <div className="space-y-2 text-white/70 text-sm">
              {(alerts || []).length === 0 ? (
                <div className="text-white/40">No active alerts</div>
              ) : (
                alerts.map((alert, index) => (
                  <div key={index}>• {alert.message || alert}</div>
                ))
              )}
            </div>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-6">
            <div className="text-sm uppercase tracking-[0.2em] text-white/40 mb-4">
              Live Activity
            </div>

            <div className="space-y-2 text-sm text-white/60">
              {(activity || []).slice(0, 8).map((item, index) => (
                <div key={index}>
                  {item.time} — {item.text}
                </div>
              ))}
            </div>
          </div>
        </div>

        <HomeAvantiqoIntelligence organizationId={organizationId} />
      </div>
    </div>
  );
}
