"use client";

import { useEffect, useMemo, useState } from "react";
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

  const [aiQuery, setAiQuery] = useState("");
  const [aiResponse, setAiResponse] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const name =
    runtime?.access?.staff?.name ||
    runtime?.activeOrganization?.name ||
    "User";

  const greeting = useMemo(() => getGreeting(name), [name]);

  const briefing = runtime?.briefing || null;
  const metrics = runtime?.metrics || {};
  const alerts = runtime?.alerts || [];
  const activity = runtime?.activity || [];

  async function askAI() {
    if (!aiQuery) return;

    setAiLoading(true);

    try {
      const res = await fetch("/api/workspace/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: aiQuery,
          organizationId: organization?.id,
        }),
      });

      const data = await res.json();
      setAiResponse(data);
    } catch (err) {
      setAiResponse({
        answer: "AI temporarily unavailable.",
      });
    } finally {
      setAiLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-black text-white p-10">
        Loading workspace...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white">
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 p-6">

        {/* LEFT - EXECUTIVE STATE */}
        <div className="space-y-6">

          {/* GREETING */}
          <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-6">
            <div className="text-2xl font-light">
              {greeting}
            </div>

            <div className="mt-3 text-white/50 text-sm">
              {briefing?.summary || "Waiting for live operational data..."}
            </div>
          </div>

          {/* LIVE STATUS */}
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

          {/* ALERTS */}
          <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-6">
            <div className="text-sm uppercase tracking-[0.2em] text-white/40 mb-4">
              Priority Signals
            </div>

            <div className="space-y-2 text-white/70 text-sm">
              {(alerts || []).length === 0 ? (
                <div className="text-white/40">No active alerts</div>
              ) : (
                alerts.map((a, i) => (
                  <div key={i}>• {a.message || a}</div>
                ))
              )}
            </div>
          </div>

          {/* ACTIVITY */}
          <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-6">
            <div className="text-sm uppercase tracking-[0.2em] text-white/40 mb-4">
              Live Activity
            </div>

            <div className="space-y-2 text-sm text-white/60">
              {(activity || []).slice(0, 8).map((a, i) => (
                <div key={i}>
                  {a.time} — {a.text}
                </div>
              ))}
            </div>
          </div>

        </div>

        {/* RIGHT - AI ENGINE */}
        <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-6 flex flex-col">

          <div className="text-sm uppercase tracking-[0.2em] text-white/40 mb-4">
            Company Intelligence
          </div>

          {/* AI OUTPUT */}
          <div className="flex-1 space-y-4 text-sm text-white/80 overflow-auto">
            {!aiResponse && (
              <div className="text-white/40">
                Ask anything about the company...
              </div>
            )}

            {aiResponse?.answer && (
              <div className="whitespace-pre-wrap">
                {aiResponse.answer}
              </div>
            )}
          </div>

          {/* INPUT */}
          <div className="mt-4 flex gap-2">
            <input
              value={aiQuery}
              onChange={(e) => setAiQuery(e.target.value)}
              placeholder="Ask about revenue, staff, inventory, risks..."
              className="flex-1 bg-black/40 border border-white/10 rounded-2xl px-4 py-3 text-sm outline-none"
            />

            <button
              onClick={askAI}
              disabled={aiLoading}
              className="px-4 py-3 rounded-2xl bg-white text-black text-sm"
            >
              {aiLoading ? "..." : "Ask"}
            </button>
          </div>

        </div>

      </div>
    </div>
  );
}
