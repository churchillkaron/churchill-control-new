"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/shared/supabase/client";

export default function AuditPage() {

  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchLogs();
  }, []);

  async function fetchLogs() {

    setLoading(true);

    const { data, error } =
      await supabase
        .from("approval_logs")
        .select("*")
        .order("created_at", {
          ascending: false,
        });

    if (error) {

      console.error(error);

    }

    setLogs(data || []);

    setLoading(false);

  }

  // ---------------------------------
  // UI
  // ---------------------------------

  if (loading) {

    return (
      <div className="min-h-screen bg-black text-white p-10">
        Loading audit timeline...
      </div>
    );

  }

  return (

    <div className="min-h-screen bg-black text-white p-10">

      {/* HEADER */}
      <div className="mb-10">

        <h1 className="text-4xl font-bold">
          Governance Audit Timeline
        </h1>

        <div className="text-white/50 mt-2">
          Immutable approval and accounting history
        </div>

      </div>

      {/* EMPTY */}
      {logs.length === 0 && (

        <div className="bg-white/5 border border-white/10 rounded-2xl p-6 text-white/40">
          No governance events found
        </div>

      )}

      {/* TIMELINE */}
      <div className="space-y-4">

        {logs.map((log) => (

          <div
            key={log.id}
            className="bg-white/5 border border-white/10 rounded-2xl p-6"
          >

            {/* TOP */}
            <div className="flex justify-between items-start mb-4">

              <div>

                <div className="text-xl font-semibold">

                  {log.entity_type}
                  {" "}
                  #{log.entity_id}

                </div>

                <div className="text-white/40 text-sm mt-1">

                  {new Date(
                    log.created_at
                  ).toLocaleString()}

                </div>

              </div>

              <div className="text-sm px-3 py-1 rounded-full bg-blue-600/20 text-blue-300 border border-blue-500/20">

                {log.role}

              </div>

            </div>

            {/* STATUS */}
            <div className="mb-4">

              <div className="text-white/70">

                <span className="text-yellow-400">
                  {log.from_status}
                </span>

                {" → "}

                <span className="text-green-400">
                  {log.to_status}
                </span>

              </div>

            </div>

            {/* ACTOR */}
            <div className="mb-2 text-white/60">

              <span className="font-semibold text-white/80">
                Actor:
              </span>

              {" "}

              {log.acted_by || "System"}

            </div>

            {/* NOTES */}
            <div className="text-white/50">

              <span className="font-semibold text-white/70">
                Notes:
              </span>

              {" "}

              {log.notes || "No notes"}

            </div>

          </div>

        ))}

      </div>

    </div>

  );

}