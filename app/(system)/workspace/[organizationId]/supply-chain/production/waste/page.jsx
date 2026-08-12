"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

export default function WastePage() {
  const params = useParams();
  const organizationId = params.organizationId;
  const [logs, setLogs] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  async function loadWasteLogs() {
    if (!organizationId) return;

    setLoading(true);
    setError("");

    try {
      const response = await fetch(
        `/api/production/yield?organizationId=${encodeURIComponent(organizationId)}`,
        { cache: "no-store" },
      );
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Unable to load yield logs");
      }

      setLogs(data.logs || []);
    } catch (loadError) {
      setLogs([]);
      setError(loadError.message || "Unable to load yield logs");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadWasteLogs();
  }, [organizationId]);

  return (
    <div className="min-h-screen bg-black text-white p-10">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-start justify-between gap-6 mb-10">
          <div>
            <h1 className="text-6xl font-bold mb-3">Yield & Waste</h1>
            <div className="text-zinc-500">Manufacturing Loss Intelligence</div>
          </div>
          <button
            type="button"
            onClick={loadWasteLogs}
            disabled={loading || !organizationId}
            className="rounded-2xl border border-white/10 px-5 py-3 text-sm text-white/70 disabled:opacity-40"
          >
            {loading ? "Loading..." : "Refresh"}
          </button>
        </div>

        {error && (
          <div className="mb-6 rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-red-300">
            {error}
          </div>
        )}

        {!loading && !error && logs.length === 0 && (
          <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-8 text-zinc-500">
            No yield or waste records for this organization yet.
          </div>
        )}

        <div className="space-y-4">
          {logs.map((log) => (
            <div key={log.id} className="border border-zinc-800 rounded-3xl p-6">
              <div className="grid grid-cols-5 gap-4">
                <Metric label="Raw" value={log.raw_quantity} />
                <Metric label="Usable" value={log.usable_quantity} />
                <Metric label="Waste" value={log.waste_quantity} className="text-red-400" />
                <Metric label="Yield %" value={`${log.yield_percent ?? 0}%`} className="text-green-400" />
                <Metric label="Waste %" value={`${log.waste_percent ?? 0}%`} className="text-yellow-400" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value, className = "" }) {
  return (
    <div>
      <div className="text-zinc-500 text-sm">{label}</div>
      <div className={`text-2xl mt-2 ${className}`}>{value ?? 0}</div>
    </div>
  );
}
