"use client";

import { useEffect, useState } from "react";

import ReportFilterPanel from "@/components/workspace/reports/ReportFilterPanel";

function titleCase(value) {
  return String(value || "")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, character => character.toUpperCase());
}

function rowsFromValue(value) {
  if (Array.isArray(value)) {
    return value.map((row, index) => {
      if (row && typeof row === "object") {
        const label = row.label || row.name || row.account_name || row.account_code || row.title || `Row ${index + 1}`;
        const amount = row.amount ?? row.value ?? row.balance ?? row.total ?? row.net_amount;
        return { label, ...(amount !== undefined ? { amount: Number(amount) } : { value: JSON.stringify(row) }) };
      }
      return { label: `Row ${index + 1}`, value: row };
    });
  }

  if (value && typeof value === "object") {
    return Object.entries(value)
      .filter(([, entry]) => entry === null || typeof entry !== "object")
      .map(([key, entry]) => ({
        label: titleCase(key),
        ...(typeof entry === "number" ? { amount: entry } : { value: entry }),
      }));
  }

  return [{ label: "Value", ...(typeof value === "number" ? { amount: value } : { value }) }];
}

function normalizeReportDocument(json, action, filters) {
  const existing =
    json?.document ||
    json?.data?.document ||
    json?.report?.document ||
    null;

  if (existing?.sections) {
    return {
      ...existing,
      title: existing.title || action?.title || action?.label || "Financial Report",
      generated_at: existing.generated_at || new Date().toLocaleDateString(),
    };
  }

  const source = json?.data ?? json?.report ?? json?.result ?? json ?? {};
  const ignored = new Set(["success", "reportType", "context", "organization", "entity", "period", "currency"]);
  const entries = source && typeof source === "object" && !Array.isArray(source)
    ? Object.entries(source).filter(([key]) => !ignored.has(key))
    : [[action?.label || "Results", source]];
  const sections = entries.map(([key, value]) => ({
    title: titleCase(key),
    rows: rowsFromValue(value),
  })).filter(section => section.rows.length > 0);

  return {
    title: action?.title || action?.label || titleCase(action?.reportType || action?.report || action?.id) || "Financial Report",
    period: { name: filters.period_id || [filters.date_from, filters.date_to].filter(Boolean).join(" – ") || "Current Period" },
    currency: { code: filters.currency || "THB" },
    sections,
    generated_at: new Date().toLocaleDateString(),
  };
}

export default function ReportEngine({
  organizationId,
  entityId,
  periodId,
  initialPayload = null,
  onClose,

  onPreview,

}) {
  const [payload, setPayload] = useState(initialPayload);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

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
        organizationId: resolvedOrganizationId || "",
        entityId: resolvedEntityId || "",
        periodId: resolvedPeriodId || "",
        ...filters,
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


      const configuredMethod = payload.action?.method || "GET";
      const res = configuredApi
        ? await fetch(
            configuredMethod === "GET"
              ? `${configuredApi}${configuredApi.includes("?") ? "&" : "?"}${params.toString()}`
              : configuredApi,
            configuredMethod === "GET"
              ? { method: "GET", cache: "no-store" }
              : {
                  method: configuredMethod,
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    organization_id: resolvedOrganizationId,
                    entity_id: resolvedEntityId,
                    period_id: resolvedPeriodId,
                    module: payload.moduleKey,
                    workspace: payload.workspaceId,
                    row: payload.row,
                    ...filters,
                    action: normalizedAction,
                    type: reportType,
                  }),
                }
          )
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
        const document = normalizeReportDocument(json, normalizedAction, filters);
        setResult(document);


        console.log(
          "DISPATCHING REPORT PREVIEW",
          {
            documentType:
              "FinancialReport",

            document
          }
        );


        const previewPayload = {

          action: {
            ...payload.action,
            title: document.title,
          },

          documentType:
            "FinancialReport",

          payload: {

            document:
              document

          },

          organizationId: resolvedOrganizationId,

          entityId: resolvedEntityId,

          periodId: resolvedPeriodId,

        };

        if (onPreview) {
          onPreview(previewPayload);
        } else {
          window.dispatchEvent(
            new CustomEvent("workspace:preview", {
              detail: previewPayload,
            })
          );
        }
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
