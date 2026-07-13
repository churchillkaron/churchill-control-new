"use client";

import { useEffect, useState } from "react";

import ReportFilterPanel from "@/components/workspace/reports/ReportFilterPanel";

import PreviewEngine from "@/components/workspace/engines/PreviewEngine";

export default function ReportEngine({
  organizationId,
  entityId,
  periodId,
  initialPayload = null,
  onClose,
}) {
  const [payload, setPayload] = useState(initialPayload);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  const [previewOpen, setPreviewOpen] =
    useState(false);

  const [error, setError] = useState("");

  const [filters, setFilters] = useState({
    date_from:"",
    date_to:"",
    period_id: periodId || "",
    currency:"THB",
  });

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
    setError("");
    setResult(null);

    try {

      const reportType =
        payload.action?.reportType ||
        payload.action?.report ||
        payload.action?.id ||
        null;


      const normalizedAction = {
        ...payload.action,

        reportType,

        type:
          reportType ||
          payload.action?.type ||
          null,
      };


      const resolvedOrganizationId =
        organizationId ||
        payload.organizationId ||
        null;


      const resolvedEntityId =
        entityId ||
        payload.entityId ||
        null;


      const resolvedPeriodId =
        periodId ||
        payload.periodId ||
        null;


      const configuredApi =
        payload.action?.api ||
        payload.action?.endpoint;


      const params = new URLSearchParams({
        organizationId: organizationId || "",
        entityId: entityId || "",
        periodId: periodId || "",
      });
      console.log(
        "REPORT REQUEST CONTEXT",
        {
          organizationId,
          payloadOrganizationId:
            payload.organizationId,
          resolvedOrganizationId,
          entityId,
          periodId,
          action:
            normalizedAction,
        }
      );


      const res = configuredApi
        ? await fetch(configuredApi, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({

              organization_id:
                resolvedOrganizationId,

              entity_id:
                resolvedEntityId,

              period_id:
                resolvedPeriodId,

              module:
                payload.moduleKey,

              workspace:
                payload.workspaceId,

              row:
                payload.row,

              ...filters,

              action:
                normalizedAction,

              type:
                reportType,

            }),
          })
        : await fetch("/api/workspace/report", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              organization_id: organizationId,
              entity_id: entityId,
              period_id: periodId,
              module: payload.moduleKey,
              workspace: payload.workspaceId,
              row: payload.row,
              action: normalizedAction,
              type: reportType,
            }),
          });

      const json = await res.json();


      console.log(
        "REPORT RESPONSE",
        json
      );


      if (!res.ok || json.success === false) {
        throw new Error(json.error || "Report failed.");
      }

      if (json.url) {
        window.open(json.url, "_blank");
      } else {
        setResult(json);

        setPreviewOpen(true);
      }

    } catch (err) {
      setError(err.message || "Report failed.");
    }

    setBusy(false);
  }

  if (!payload) return null;

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 backdrop-blur-xl">
      <div className="w-full max-w-xl rounded-[28px] border border-white/[0.08] bg-gradient-to-b from-white/[0.045] to-white/[0.018] p-7 shadow-2xl shadow-black/70 backdrop-blur-3xl">

        <div className="text-[11px] uppercase tracking-[0.30em] text-amber-300/65">
          Report Engine
        </div>

        <h2 className="mt-3 text-3xl font-light">
          {payload.action?.title || payload.action?.label || "Generate Report"}
        </h2>

        <p className="mt-3 text-sm text-white/45">
          Workspace: {payload.workspaceId}
        </p>

        <div className="mt-6">
          <ReportFilterPanel
            filters={filters}
            setFilters={setFilters}
            onGenerate={generate}
            busy={busy}
          />
        </div>


        {error ? (
          <div className="mt-5 rounded-xl border border-red-400/20 bg-red-400/10 p-4 text-sm text-red-200">{error}</div>
        ) : null}

        {previewOpen && result?.document ? (

          <PreviewEngine

            action={
              payload.action
            }

            documentType="FinancialReport"

            payload={{
              document:
                result.document
            }}

            organizationId={
              organizationId
            }

            entityId={
              entityId
            }

            onClose={() =>
              setPreviewOpen(false)
            }

          />

        ) : null}

        <div className="mt-8 flex justify-end gap-3">

          <button
            onClick={() => {
              setPayload(null);
              onClose?.();
            }}
            className="rounded-xl border border-white/[0.08] bg-white/[0.035] px-5 py-3 text-white/58 backdrop-blur-2xl"
          >
            Cancel
          </button>

          <button
            disabled={busy}
            onClick={generate}
            className="rounded-xl border border-amber-300/35 bg-gradient-to-b from-amber-200 to-amber-500 px-5 py-3 text-black shadow-[0_0_34px_rgba(245,158,11,0.22)]"
          >
            {busy ? "Generating..." : result ? "Refresh Report" : "Generate"}
          </button>

        </div>

      </div>
    </div>
  );
}
