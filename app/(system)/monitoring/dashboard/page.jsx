"use client";

import { useEffect, useState } from "react";

export default function MonitoringDashboard() {
  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadMetrics();
  }, []);

  async function loadMetrics() {
    try {
      const res = await fetch("/api/monitoring/metrics");
      const data = await res.json();

      setMetrics(data);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="p-10 text-white">
        Loading Monitoring Dashboard...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white p-10">
      <h1 className="text-4xl font-bold mb-10">
        System Monitoring
      </h1>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="border border-zinc-800 rounded-xl p-6">
          <h2 className="text-zinc-400 mb-2">System Status</h2>

          <div className="text-3xl font-bold">
            {metrics?.status}
          </div>
        </div>

        <div className="border border-zinc-800 rounded-xl p-6">
          <h2 className="text-zinc-400 mb-2">Uptime</h2>

          <div className="text-3xl font-bold">
            {Math.floor(metrics?.uptime || 0)}s
          </div>
        </div>

        <div className="border border-zinc-800 rounded-xl p-6">
          <h2 className="text-zinc-400 mb-2">Heap Used</h2>

          <div className="text-3xl font-bold">
            {Math.round(
              (metrics?.memory?.heapUsed || 0) / 1024 / 1024
            )} MB
          </div>
        </div>
      </div>

      <div className="mt-10 border border-zinc-800 rounded-xl p-6">
        <h2 className="text-2xl font-bold mb-4">
          Services
        </h2>

        <pre className="text-sm overflow-auto">
          {JSON.stringify(metrics?.services, null, 2)}
        </pre>
      </div>
    </div>
  );
}
