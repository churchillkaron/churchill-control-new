"use client";

import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export default function ControlRoomPage() {
  const [data, setData] = useState({
    events: [],
    approvals: [],
    status: "loading",
    healthScore: 100,
    commandCenter: null,
  });

  useEffect(() => {
    const organizationId = localStorage.getItem("organizationId");
    if (!organizationId) return;

    // =========================
    // INITIAL LOAD
    // =========================
    async function load() {
      const res = await fetch(
        `/api/workspace/control-room?organizationId=${organizationId}`
      );
      const json = await res.json();
      setData(json);
    }

    load();

    // =========================
    // REAL-TIME EVENTS STREAM
    // =========================
    const channel = supabase
      .channel("control-room-stream")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "system_events",
          filter: `organization_id=eq.${organizationId}`,
        },
        (payload) => {
          setData(prev => ({
            ...prev,
            events: [payload.new, ...prev.events].slice(0, 50),
          }));
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "ai_approval_queue",
          filter: `organization_id=eq.${organizationId}`,
        },
        (payload) => {
          setData(prev => ({
            ...prev,
            approvals: [payload.new, ...prev.approvals].slice(0, 50),
          }));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  if (data.status === "loading") {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        Initializing Control Room...
      </div>
    );
  }

  const statusColor =
    data.healthScore > 80
      ? "text-green-400"
      : data.healthScore > 50
      ? "text-yellow-400"
      : "text-red-400";

  return (
    <div className="min-h-screen bg-black text-white p-6">

      {/* HEADER */}
      <div className="mb-6">
        <h1 className="text-2xl font-light">Control Room</h1>
        <div className="text-white/40 text-sm">
          Live Enterprise Intelligence System
        </div>

        <div className="mt-2 text-sm">
          Health Score:
          <span className={`ml-2 ${statusColor}`}>
            {data.healthScore}
          </span>
        </div>
      </div>

      {/* APPROVALS */}
      <div className="mb-8">
      {/* APPROVALS */}
      <div className="mb-8">
        <h2 className="text-lg font-light mb-3">Pending Approvals</h2>

        <div className="space-y-2">
          {data.approvals.length === 0 && (
            <div className="text-white/40 text-sm">
              No pending approvals
            </div>
          )}

          {data.approvals.map((a) => (
            <div
              key={a.id}
              className="p-3 rounded-xl border border-white/10 bg-white/5 flex items-center justify-between"
            >
              <div>
                <div className="text-sm">{a.type}</div>
                <div className="text-xs text-white/40">{a.priority}</div>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={async () => {
                    await fetch("/api/workspace/control-room/action", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        approvalId: a.id,
                        action: "approve",
                        organizationId: localStorage.getItem("organizationId"),
                      }),
                    });
                  }}
                  className="px-3 py-1 rounded-lg bg-green-500/20 text-green-400 text-xs"
                >
                  Approve
                </button>

                <button
                  onClick={async () => {
                    await fetch("/api/workspace/control-room/action", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        approvalId: a.id,
                        action: "reject",
                        organizationId: localStorage.getItem("organizationId"),
                      }),
                    });
                  }}
                  className="px-3 py-1 rounded-lg bg-red-500/20 text-red-400 text-xs"
                >
                  Reject
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

        <h2 className="text-lg font-light mb-3">Live System Events</h2>

        <div className="space-y-2">
          {data.events.slice(0, 15).map((e) => (
            <div
              key={e.id}
              className="p-3 rounded-xl border border-white/10 bg-white/5"
            >
              <div className="text-sm">{e.type}</div>
              <div className="text-xs text-white/40">
                {new Date(e.created_at).toLocaleTimeString()}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* COMMAND CENTER */}
      <div className="p-4 rounded-xl border border-violet-500/20 bg-violet-500/10">
        <h2 className="text-lg font-light mb-2">
          Command Intelligence
        </h2>

        <div className="text-sm text-white/80">
          {data.commandCenter?.message ||
            "Monitoring system behavior in real time..."}
        </div>
      </div>


    </div>
  );
}
