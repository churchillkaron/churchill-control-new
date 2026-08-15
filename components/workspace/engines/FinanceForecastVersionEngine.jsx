"use client";

import { useCallback, useEffect, useState } from "react";

function kindLabel(kind) {
  return kind === "SCENARIOS_VS_BUDGET"
    ? "Scenarios vs Budget"
    : "Forecast Scenarios";
}

function dateLabel(value) {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : date.toLocaleString();
}

export default function FinanceForecastVersionEngine({
  action,
  organizationId,
  entityId,
  periodId,
  onClose,
}) {
  const [versions, setVersions] = useState([]);
  const [canManage, setCanManage] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!organizationId || !entityId || !periodId) {
      setVersions([]);
      setCanManage(false);
      setError("Select an organization, legal entity, and accounting period to view forecast versions.");
      return;
    }

    try {
      setBusy(true);
      setError("");
      const params = new URLSearchParams({
        organizationId,
        entityId,
        periodId,
      });
      const response = await fetch(
        `${action?.api || "/api/finance/forecast/versions"}?${params.toString()}`,
        { method: "GET" }
      );
      const json = await response.json().catch(() => ({}));

      if (!response.ok || json?.success === false) {
        throw new Error(json?.error || "Forecast version loading failed");
      }

      setVersions(Array.isArray(json.versions) ? json.versions : []);
      setCanManage(json.can_manage === true);
    } catch (loadError) {
      setError(loadError.message || "Forecast version loading failed");
    } finally {
      setBusy(false);
    }
  }, [action?.api, organizationId, entityId, periodId]);

  useEffect(() => {
    load();
  }, [load]);

  function preview(version) {
    const document = version?.result_snapshot?.document;
    if (!document) {
      setError("This forecast version does not contain a previewable report document.");
      return;
    }

    window.dispatchEvent(
      new CustomEvent("workspace:preview", {
        detail: {
          action: {
            ...action,
            title: `${kindLabel(version.scenario_kind)} — Version ${version.version_number}`,
          },
          documentType: "FinancialReport",
          payload: { document },
          organizationId,
          entityId,
          periodId,
        },
      })
    );
  }

  async function approve(version) {
    try {
      setBusy(true);
      setError("");
      const response = await fetch(
        action?.api || "/api/finance/forecast/versions",
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            organizationId,
            versionId: version.id,
            action: "approve",
          }),
        }
      );
      const json = await response.json().catch(() => ({}));

      if (!response.ok || json?.success === false) {
        throw new Error(json?.error || "Forecast version approval failed");
      }

      await load();
    } catch (approvalError) {
      setError(approvalError.message || "Forecast version approval failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/75 px-5 backdrop-blur-xl">
      <div className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-[30px] border border-white/[0.08] bg-[#0b0b0b]/95 p-7 shadow-2xl shadow-black/80">
        <div className="flex items-start justify-between gap-5">
          <div>
            <div className="text-[11px] uppercase tracking-[0.30em] text-amber-300/65">
              Finance Forecasting
            </div>
            <h2 className="mt-3 text-3xl font-light tracking-[-0.04em] text-white">
              Forecast Versions
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-white/45">
              Draft scenario snapshots preserve the exact assumptions and generated results for this entity and accounting period. Approval supersedes the prior approved version of the same scenario type.
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-xl border border-white/[0.08] bg-white/[0.035] px-4 py-2 text-sm text-white/60"
          >
            Close
          </button>
        </div>

        {error ? (
          <div className="mt-5 rounded-xl border border-red-400/20 bg-red-400/10 p-4 text-sm text-red-200">
            {error}
          </div>
        ) : null}

        <div className="mt-7 space-y-3">
          {busy && !versions.length ? (
            <div className="rounded-2xl border border-white/[0.08] bg-white/[0.025] p-5 text-sm text-white/45">
              Loading forecast versions...
            </div>
          ) : null}

          {!busy && !error && !versions.length ? (
            <div className="rounded-2xl border border-white/[0.08] bg-white/[0.025] p-5 text-sm text-white/45">
              No saved forecast versions for the selected period.
            </div>
          ) : null}

          {versions.map(version => (
            <div
              key={version.id}
              className="rounded-2xl border border-white/[0.08] bg-white/[0.025] p-5"
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="text-base font-medium text-white">
                    Version {version.version_number} · {kindLabel(version.scenario_kind)}
                  </div>
                  <div className="mt-2 text-xs text-white/40">
                    Created {dateLabel(version.created_at)} · {version.currency_code || "Currency not set"}
                  </div>
                  <div className="mt-2 text-xs uppercase tracking-[0.18em] text-amber-200/70">
                    {version.status}
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => preview(version)}
                    disabled={busy}
                    className="rounded-xl border border-white/[0.08] bg-white/[0.035] px-4 py-2 text-sm text-white/70 disabled:opacity-50"
                  >
                    Preview
                  </button>
                  {canManage && version.status === "DRAFT" ? (
                    <button
                      onClick={() => approve(version)}
                      disabled={busy}
                      className="rounded-xl border border-amber-300/35 bg-gradient-to-b from-amber-200 to-amber-500 px-4 py-2 text-sm font-semibold text-black disabled:opacity-50"
                    >
                      Approve
                    </button>
                  ) : null}
                </div>
              </div>

              <div className="mt-4 grid gap-3 text-xs text-white/45 md:grid-cols-3">
                <div>Forecast ready: {version.forecast_ready ? "Yes" : "No"}</div>
                <div>
                  Budget: {version.budget_available === null ? "N/A" : version.budget_available ? "Available" : "Not configured"}
                </div>
                <div>
                  Approved: {version.approved_at ? dateLabel(version.approved_at) : "-"}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
