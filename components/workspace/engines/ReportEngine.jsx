"use client";

import { useEffect, useState } from "react";

export default function ReportEngine({
  organizationId,
  entityId,
  periodId,
}) {
  const [payload, setPayload] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    function handler(e) {
      setPayload(e.detail);
    }

    window.addEventListener("workspace:report", handler);
    window.addEventListener("workspace:reports", handler);

    return () => {
      window.removeEventListener("workspace:report", handler);
      window.removeEventListener("workspace:reports", handler);
    };
  }, []);

  async function generate() {
    if (!payload) return;

    setBusy(true);

    try {
      const res = await fetch("/api/workspace/report", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          organization_id: organizationId,
          entity_id: entityId,
          period_id: periodId,

          module: payload.moduleKey,
          workspace: payload.workspaceId,

          row: payload.row,
          action: payload.action,
        }),
      });

      const json = await res.json();

      if (!json.success) {
        alert(json.error || "Report failed.");
        return;
      }

      if (json.url) {
        window.open(json.url, "_blank");
      } else {
        alert("Report generated.");
      }

      setPayload(null);

    } catch (err) {
      alert(err.message);
    }

    setBusy(false);
  }

  if (!payload) return null;

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 backdrop-blur-xl">
      <div className="w-full max-w-xl rounded-3xl border border-white/10 bg-[#090909] p-8">

        <div className="text-[11px] uppercase tracking-[0.30em] text-amber-300/70">
          Report Engine
        </div>

        <h2 className="mt-3 text-3xl font-light">
          {payload.action?.label || "Generate Report"}
        </h2>

        <p className="mt-3 text-sm text-white/45">
          Workspace: {payload.workspaceId}
        </p>

        <div className="mt-8 flex justify-end gap-3">

          <button
            onClick={() => setPayload(null)}
            className="rounded-xl border border-white/10 px-5 py-3"
          >
            Cancel
          </button>

          <button
            disabled={busy}
            onClick={generate}
            className="rounded-xl bg-amber-500 px-5 py-3 text-black"
          >
            {busy ? "Generating..." : "Generate"}
          </button>

        </div>

      </div>
    </div>
  );
}
