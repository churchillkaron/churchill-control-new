"use client";

import { useEffect, useMemo, useState } from "react";
import ReportWorkCenter from "@/components/workspace/reports/ReportWorkCenter";

function firstArray(value) {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== "object") return [];
  for (const key of ["rows", "entries", "lines", "items", "records", "data"]) {
    const candidate = value[key];
    if (Array.isArray(candidate)) return candidate;
    if (candidate && typeof candidate === "object") {
      const nested = firstArray(candidate);
      if (nested.length) return nested;
    }
  }
  return [];
}

function label(value) {
  return String(value || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, character => character.toUpperCase());
}

function display(value) {
  if (value === null || value === undefined || value === "") return "-";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") return new Intl.NumberFormat("en-GB", {
    maximumFractionDigits: 2,
  }).format(value);
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export default function FinanceReportRuntimeWorkCenter({
  capability,
  organizationId,
  entityId,
  periodId,
  workspaceId,
}) {
  const api = capability?.ui?.api || capability?.runtime?.listApi || null;
  const [loading, setLoading] = useState(Boolean(api));
  const [error, setError] = useState("");
  const [payload, setPayload] = useState(null);

  useEffect(() => {
    if (!api || !organizationId) return;
    let active = true;

    async function load() {
      try {
        setLoading(true);
        setError("");
        const url = new URL(api, window.location.origin);
        url.searchParams.set("organizationId", organizationId);
        if (entityId) url.searchParams.set("entityId", entityId);
        if (periodId) url.searchParams.set("periodId", periodId);

        const response = await fetch(url.toString(), {
          credentials: "include",
          cache: "no-store",
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok || result?.success === false) {
          throw new Error(result?.error || `Report load failed (${response.status})`);
        }
        if (active) setPayload(result);
      } catch (loadError) {
        if (active) {
          setPayload(null);
          setError(loadError.message || "Report load failed");
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    load();
    return () => {
      active = false;
    };
  }, [api, organizationId, entityId, periodId]);

  const rows = useMemo(() => firstArray(payload), [payload]);
  const columns = useMemo(() => {
    const row = rows[0] || {};
    return Object.keys(row)
      .filter(key => !key.endsWith("_id") && key !== "organization_id" && key !== "entity_id")
      .slice(0, 8);
  }, [rows]);

  if (!api) {
    return (
      <ReportWorkCenter
        capability={capability}
        organizationId={organizationId}
        entityId={entityId}
        periodId={periodId}
        workspaceId={workspaceId}
      />
    );
  }

  return (
    <section className="space-y-6">
      <header className="rounded-[30px] border border-white/10 bg-white/[0.035] p-6">
        <div className="text-[11px] uppercase tracking-[0.28em] text-[#D6A66A]">Finance Report</div>
        <h1 className="mt-3 text-4xl font-light tracking-[-0.05em] text-white">
          {capability?.name || "Finance Report"}
        </h1>
        <p className="mt-2 text-sm text-white/45">
          {capability?.description || "Review the selected entity and accounting period."}
        </p>
      </header>

      {loading ? (
        <div className="rounded-[28px] border border-white/10 bg-white/[0.025] p-8 text-sm text-white/45">
          Loading report…
        </div>
      ) : error ? (
        <div className="rounded-[28px] border border-red-400/25 bg-red-400/[0.06] p-8 text-sm text-red-200">
          {error}
        </div>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-[24px] border border-white/10 bg-white/[0.025] p-5">
              <div className="text-[10px] uppercase tracking-[0.24em] text-white/35">Rows</div>
              <div className="mt-3 text-3xl font-light text-white">{rows.length}</div>
            </div>
            <div className="rounded-[24px] border border-white/10 bg-white/[0.025] p-5">
              <div className="text-[10px] uppercase tracking-[0.24em] text-white/35">Total Debits</div>
              <div className="mt-3 text-3xl font-light text-white">{display(payload?.totalDebits)}</div>
            </div>
            <div className="rounded-[24px] border border-white/10 bg-white/[0.025] p-5">
              <div className="text-[10px] uppercase tracking-[0.24em] text-white/35">Total Credits</div>
              <div className="mt-3 text-3xl font-light text-white">{display(payload?.totalCredits)}</div>
            </div>
          </div>

          <div className="overflow-hidden rounded-[28px] border border-white/10 bg-white/[0.02]">
            {rows.length === 0 ? (
              <div className="p-8 text-sm text-white/45">No report rows exist for the selected context.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="border-b border-white/10 bg-white/[0.03] text-[10px] uppercase tracking-[0.2em] text-white/35">
                    <tr>{columns.map(column => <th key={column} className="px-5 py-4">{label(column)}</th>)}</tr>
                  </thead>
                  <tbody>
                    {rows.map((row, index) => (
                      <tr key={row.id || row.account_id || index} className="border-b border-white/[0.06] text-white/70 last:border-0">
                        {columns.map(column => <td key={column} className="px-5 py-4">{display(row[column])}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </section>
  );
}
