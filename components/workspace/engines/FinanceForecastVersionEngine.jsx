"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

const STATUS_OPTIONS = ["ALL", "DRAFT", "APPROVED", "SUPERSEDED"];
const KIND_OPTIONS = ["ALL", "SCENARIOS_VS_BUDGET", "SCENARIOS"];

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

function normalizedStatus(version) {
  return String(version?.status || "").trim().toUpperCase();
}

function actorLabel(actor) {
  return actor?.name || "Not recorded";
}

function statusLabel(status) {
  if (status === "APPROVED") return "ACTIVE APPROVED";
  return status || "UNKNOWN";
}

function statusClasses(status) {
  if (status === "APPROVED") {
    return "border-emerald-300/25 bg-emerald-300/10 text-emerald-200";
  }
  if (status === "DRAFT") {
    return "border-amber-300/25 bg-amber-300/10 text-amber-200";
  }
  return "border-white/[0.08] bg-white/[0.04] text-white/45";
}

function filterButtonClasses(active) {
  return active
    ? "border-amber-300/30 bg-amber-300/[0.12] text-amber-100"
    : "border-white/[0.08] bg-white/[0.025] text-white/45 hover:text-white/65";
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
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [kindFilter, setKindFilter] = useState("ALL");

  const load = useCallback(async () => {
    if (!organizationId || !entityId || !periodId) {
      setVersions([]);
      setCanManage(false);
      setError(
        "Select an organization, legal entity, and accounting period to view forecast versions."
      );
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

  useEffect(() => {
    setStatusFilter("ALL");
    setKindFilter("ALL");
  }, [organizationId, entityId, periodId]);

  const statusCounts = useMemo(() => {
    const counts = { ALL: versions.length, DRAFT: 0, APPROVED: 0, SUPERSEDED: 0 };
    for (const version of versions) {
      const status = normalizedStatus(version);
      if (Object.prototype.hasOwnProperty.call(counts, status)) counts[status] += 1;
    }
    return counts;
  }, [versions]);

  const kindCounts = useMemo(() => {
    const counts = { ALL: versions.length, SCENARIOS_VS_BUDGET: 0, SCENARIOS: 0 };
    for (const version of versions) {
      if (Object.prototype.hasOwnProperty.call(counts, version?.scenario_kind)) {
        counts[version.scenario_kind] += 1;
      }
    }
    return counts;
  }, [versions]);

  const versionNumberById = useMemo(
    () => new Map(versions.map(version => [version.id, version.version_number])),
    [versions]
  );

  const activeApproved = useMemo(
    () => versions.filter(version => normalizedStatus(version) === "APPROVED"),
    [versions]
  );

  const filteredVersions = useMemo(
    () =>
      versions.filter(version => {
        const statusMatches =
          statusFilter === "ALL" || normalizedStatus(version) === statusFilter;
        const kindMatches =
          kindFilter === "ALL" || version?.scenario_kind === kindFilter;
        return statusMatches && kindMatches;
      }),
    [kindFilter, statusFilter, versions]
  );

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
            title: `${kindLabel(version.scenario_kind)} - Version ${version.version_number}`,
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
      <div className="max-h-[90vh] w-full max-w-5xl overflow-y-auto rounded-[30px] border border-white/[0.08] bg-[#0b0b0b]/95 p-7 shadow-2xl shadow-black/80">
        <div className="flex items-start justify-between gap-5">
          <div>
            <div className="text-[11px] uppercase tracking-[0.30em] text-amber-300/65">
              Finance Forecasting
            </div>
            <h2 className="mt-3 text-3xl font-light tracking-[-0.04em] text-white">
              Forecast Versions
            </h2>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-white/45">
              Governed scenario snapshots for this legal entity and accounting period. Active approved versions are the immutable sources used by approved-forecast reporting; approving a newer version supersedes the prior approved version of the same scenario type.
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

        {!busy && !error && versions.length ? (
          <div className="mt-7">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <div className="text-[11px] uppercase tracking-[0.24em] text-white/35">
                  Active Approved Sources
                </div>
                <div className="mt-2 text-sm text-white/55">
                  {activeApproved.length
                    ? `${activeApproved.length} approved source${activeApproved.length === 1 ? "" : "s"} active for this period.`
                    : "No approved forecast source is active for this period."}
                </div>
              </div>
              <div className="text-xs text-white/35">
                {statusCounts.DRAFT} draft · {statusCounts.SUPERSEDED} superseded
              </div>
            </div>

            {activeApproved.length ? (
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {activeApproved.map(version => (
                  <div
                    key={`active-${version.id}`}
                    className="rounded-2xl border border-emerald-300/20 bg-emerald-300/[0.055] p-5"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="text-xs uppercase tracking-[0.18em] text-emerald-200/70">
                          {kindLabel(version.scenario_kind)}
                        </div>
                        <div className="mt-2 text-lg font-medium text-white">
                          Version {version.version_number}
                        </div>
                      </div>
                      <span className="rounded-full border border-emerald-300/25 bg-emerald-300/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-200">
                        Active
                      </span>
                    </div>
                    <div className="mt-4 grid gap-2 text-xs text-white/45 sm:grid-cols-2">
                      <div>Approved {dateLabel(version.approved_at)}</div>
                      <div>By {actorLabel(version.governance?.approved)}</div>
                      <div>Forecast ready: {version.forecast_ready ? "Yes" : "No"}</div>
                      <div>Source generated: {dateLabel(version.source_generated_at)}</div>
                    </div>
                    <button
                      onClick={() => preview(version)}
                      disabled={busy}
                      className="mt-4 rounded-xl border border-white/[0.08] bg-white/[0.035] px-4 py-2 text-sm text-white/70 disabled:opacity-50"
                    >
                      Preview Active Version
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-4 rounded-2xl border border-white/[0.08] bg-white/[0.025] p-5 text-sm text-white/45">
                Approved-forecast reports remain unavailable until a governed version is approved for the required scenario type.
              </div>
            )}
          </div>
        ) : null}

        <div className="mt-7 grid gap-4 lg:grid-cols-[1fr_auto] lg:items-end">
          <div>
            <div className="text-[11px] uppercase tracking-[0.22em] text-white/30">
              Lifecycle
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {STATUS_OPTIONS.map(status => (
                <button
                  key={status}
                  onClick={() => setStatusFilter(status)}
                  className={`rounded-xl border px-3 py-2 text-xs transition ${filterButtonClasses(statusFilter === status)}`}
                >
                  {status === "ALL" ? "All states" : status} ({statusCounts[status] || 0})
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="text-[11px] uppercase tracking-[0.22em] text-white/30">
              Scenario Type
            </div>
            <div className="mt-2 flex flex-wrap gap-2 lg:justify-end">
              {KIND_OPTIONS.map(kind => (
                <button
                  key={kind}
                  onClick={() => setKindFilter(kind)}
                  className={`rounded-xl border px-3 py-2 text-xs transition ${filterButtonClasses(kindFilter === kind)}`}
                >
                  {kind === "ALL" ? "All types" : kindLabel(kind)} ({kindCounts[kind] || 0})
                </button>
              ))}
            </div>
          </div>
        </div>

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

          {!busy && versions.length && !filteredVersions.length ? (
            <div className="rounded-2xl border border-white/[0.08] bg-white/[0.025] p-5 text-sm text-white/45">
              No forecast versions match the selected lifecycle and scenario-type filters.
            </div>
          ) : null}

          {filteredVersions.map(version => {
            const status = normalizedStatus(version);
            const supersededByVersionNumber = version.governance?.superseded_by_version_id
              ? versionNumberById.get(version.governance.superseded_by_version_id)
              : null;

            return (
              <div
                key={version.id}
                className={`rounded-2xl border p-5 ${
                  status === "APPROVED"
                    ? "border-emerald-300/20 bg-emerald-300/[0.035]"
                    : "border-white/[0.08] bg-white/[0.025]"
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="flex flex-wrap items-center gap-3">
                      <div className="text-base font-medium text-white">
                        Version {version.version_number} · {kindLabel(version.scenario_kind)}
                      </div>
                      <span
                        className={`rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] ${statusClasses(status)}`}
                      >
                        {statusLabel(status)}
                      </span>
                    </div>
                    <div className="mt-2 text-xs text-white/40">
                      Created {dateLabel(version.created_at)} by {actorLabel(version.governance?.created)}
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
                    {canManage && status === "DRAFT" ? (
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

                <div className="mt-4 grid gap-3 text-xs text-white/45 md:grid-cols-2 xl:grid-cols-4">
                  <div>Forecast ready: {version.forecast_ready ? "Yes" : "No"}</div>
                  <div>
                    Budget: {version.budget_available === null ? "N/A" : version.budget_available ? "Available" : "Not configured"}
                  </div>
                  <div>Currency: {version.currency_code || "Not set"}</div>
                  <div>Source generated: {dateLabel(version.source_generated_at)}</div>
                </div>

                {status === "APPROVED" ? (
                  <div className="mt-4 rounded-xl border border-emerald-300/15 bg-emerald-300/[0.045] px-4 py-3 text-xs text-emerald-100/70">
                    Approved {dateLabel(version.approved_at)} by {actorLabel(version.governance?.approved)}. This is the active approved version for its scenario type.
                  </div>
                ) : null}

                {status === "SUPERSEDED" ? (
                  <div className="mt-4 rounded-xl border border-white/[0.07] bg-white/[0.02] px-4 py-3 text-xs text-white/40">
                    Superseded {dateLabel(version.superseded_at)} by {actorLabel(version.governance?.superseded)}
                    {supersededByVersionNumber ? ` when Version ${supersededByVersionNumber} was approved.` : "."}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
