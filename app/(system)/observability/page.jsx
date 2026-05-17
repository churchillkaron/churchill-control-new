"use client";

import { useEffect, useState } from "react";

export default function ObservabilityPage() {

  const [
    data,
    setData,
  ] = useState(null);

  useEffect(() => {

    load();

  }, []);

  async function load() {

    const res =
      await fetch(
        "/api/observability/overview"
      );

    const json =
      await res.json();

    setData(json);
  }

  return (
    <div className="min-h-screen bg-black text-white p-10">

      <h1 className="text-4xl font-bold mb-10">
        Observability
      </h1>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

        <div className="border border-zinc-800 rounded-xl p-6">
          <div className="text-zinc-400 text-sm">
            Queue Jobs
          </div>

          <div className="text-4xl mt-2">
            {data?.queue_jobs || 0}
          </div>
        </div>

        <div className="border border-zinc-800 rounded-xl p-6">
          <div className="text-zinc-400 text-sm">
            Audit Logs
          </div>

          <div className="text-4xl mt-2">
            {data?.audit_logs || 0}
          </div>
        </div>

        <div className="border border-zinc-800 rounded-xl p-6">
          <div className="text-zinc-400 text-sm">
            Dead Letter Jobs
          </div>

          <div className="text-4xl mt-2">
            {data?.dead_letter_jobs || 0}
          </div>
        </div>

      </div>

    </div>
  );
}
