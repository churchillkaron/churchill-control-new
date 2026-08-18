"use client";

export const dynamic = "force-dynamic";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { useOrganizationRuntime } from "@/lib/hooks/useOrganizationRuntime";

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function formatValue(value, unit = null) {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "object") {
    if (Number.isFinite(Number(value.quantity))) {
      return `${Number(value.quantity)}${value.unit || unit ? ` ${value.unit || unit}` : ""}`;
    }
    return JSON.stringify(value);
  }
  return `${String(value)}${unit ? ` ${unit}` : ""}`;
}

function StatusPill({ children, verified = false }) {
  return (
    <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold ${verified ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-200" : "border-white/10 bg-white/[0.04] text-white/50"}`}>
      {children}
    </span>
  );
}

function EvidenceItem({ title, item }) {
  if (!item?.external_url) {
    return (
      <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
        <div className="text-xs font-semibold text-white/70">{title}</div>
        <div className="mt-2 text-xs text-white/30">Not captured for this service.</div>
      </div>
    );
  }

  const isImage = String(item.mime_type || "").startsWith("image/");
  return (
    <a
      href={item.external_url}
      target="_blank"
      rel="noreferrer"
      className="block overflow-hidden rounded-2xl border border-white/10 bg-black/20 transition hover:border-[#9BCF53]/35"
    >
      {isImage ? (
        <img src={item.external_url} alt={title} className="h-36 w-full object-cover" />
      ) : null}
      <div className="p-4">
        <div className="text-xs font-semibold text-white/75">{title}</div>
        <div className="mt-1 truncate text-[11px] text-white/35">{item.file_name || "Open evidence"}</div>
      </div>
    </a>
  );
}

function PhotoGroup({ title, items = [] }) {
  if (!items.length) return null;
  return (
    <div>
      <div className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-white/35">{title}</div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {items.map((item, index) => (
          <EvidenceItem key={`${item.external_url || item.file_name || title}-${index}`} title={`${title} ${index + 1}`} item={item} />
        ))}
      </div>
    </div>
  );
}

export default function ProofOfServicePage() {
  const params = useParams();
  const { organization, loading: organizationLoading } = useOrganizationRuntime();
  const organizationId = params?.organizationId || organization?.id || "";

  const [occurrences, setOccurrences] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [reportLoading, setReportLoading] = useState(false);
  const [error, setError] = useState("");

  const loadOccurrences = useCallback(async () => {
    if (!organizationId) return;
    setLoading(true);
    setError("");

    try {
      const response = await fetch(
        `/api/service-management/occurrences?organizationId=${encodeURIComponent(organizationId)}&status=completed&limit=250`,
        { cache: "no-store" },
      );
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json.success) {
        throw new Error(json.error || "Completed service occurrences could not be loaded.");
      }

      const rows = [...(json.rows || [])].sort((left, right) => {
        const leftTime = new Date(left.completed_at || left.occurrence_at || 0).getTime();
        const rightTime = new Date(right.completed_at || right.occurrence_at || 0).getTime();
        return rightTime - leftTime;
      });
      setOccurrences(rows);
      setSelectedId((current) => current || rows[0]?.id || "");
    } catch (loadError) {
      setError(loadError.message || "Completed service occurrences could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    loadOccurrences();
  }, [loadOccurrences]);

  useEffect(() => {
    if (!organizationId || !selectedId) {
      setReport(null);
      return;
    }

    let active = true;
    setReportLoading(true);
    setError("");

    fetch(
      `/api/service-management/occurrences/${encodeURIComponent(selectedId)}/proof-of-service?organizationId=${encodeURIComponent(organizationId)}`,
      { cache: "no-store" },
    )
      .then(async (response) => {
        const json = await response.json().catch(() => ({}));
        if (!response.ok || !json.success) {
          throw new Error(json.error || "Proof of service could not be loaded.");
        }
        if (active) setReport(json.report || null);
      })
      .catch((loadError) => {
        if (active) {
          setReport(null);
          setError(loadError.message || "Proof of service could not be loaded.");
        }
      })
      .finally(() => {
        if (active) setReportLoading(false);
      });

    return () => {
      active = false;
    };
  }, [organizationId, selectedId]);

  const selectedOccurrence = useMemo(
    () => occurrences.find((row) => row.id === selectedId) || null,
    [occurrences, selectedId],
  );

  if (organizationLoading) {
    return <section className="mx-auto max-w-[1480px] px-5 py-10 text-white/45">Loading Proof of Service...</section>;
  }

  return (
    <section className="mx-auto max-w-[1480px] px-5 py-6 text-white">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#9BCF53]">Service Management</div>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">Proof of Service</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-white/45">
            Read-only customer service reports derived from completed service occurrences. Signatures, photos, protocol results and consumed materials remain linked to their authoritative execution records.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href={`/workspace/${encodeURIComponent(organizationId)}/operations/field-service`} className="rounded-xl border border-white/10 bg-white/[0.035] px-4 py-2 text-sm text-white/60">Field Service</Link>
          <button type="button" onClick={loadOccurrences} disabled={loading} className="rounded-xl border border-[#9BCF53]/30 bg-[#9BCF53]/10 px-4 py-2 text-sm text-[#D9F4B7] disabled:opacity-40">Refresh</button>
        </div>
      </div>

      {error ? <div className="mt-5 rounded-2xl border border-red-400/25 bg-red-500/10 p-4 text-sm text-red-200">{error}</div> : null}

      <div className="mt-6 grid gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
        <aside className="rounded-[26px] border border-white/10 bg-white/[0.025] p-4">
          <div className="flex items-center justify-between gap-3 px-1">
            <div>
              <div className="text-sm font-semibold">Completed Services</div>
              <div className="mt-1 text-xs text-white/30">{occurrences.length} available reports</div>
            </div>
          </div>

          <div className="mt-4 space-y-2">
            {loading ? <div className="rounded-2xl border border-white/10 p-4 text-sm text-white/35">Loading completed services...</div> : null}
            {!loading && occurrences.length === 0 ? <div className="rounded-2xl border border-white/10 p-4 text-sm text-white/35">No completed service occurrences are available yet.</div> : null}
            {!loading && occurrences.map((occurrence) => {
              const delivery = occurrence.attributes?.service_delivery || {};
              const completion = occurrence.attributes?.completion || {};
              const selected = occurrence.id === selectedId;
              return (
                <button
                  key={occurrence.id}
                  type="button"
                  onClick={() => setSelectedId(occurrence.id)}
                  className={`w-full rounded-2xl border p-4 text-left transition ${selected ? "border-[#9BCF53]/35 bg-[#9BCF53]/[0.08]" : "border-white/10 bg-black/15 hover:border-white/20"}`}
                >
                  <div className="text-sm font-semibold text-white/85">{delivery.customer_name || "Customer"}</div>
                  <div className="mt-1 text-xs text-white/50">{delivery.service_name || "Service"}</div>
                  <div className="mt-2 text-[11px] text-white/30">{formatDate(occurrence.completed_at || completion.completed_at || occurrence.occurrence_at)}</div>
                </button>
              );
            })}
          </div>
        </aside>

        <main className="min-w-0 rounded-[26px] border border-white/10 bg-white/[0.025] p-5 md:p-6">
          {!selectedOccurrence && !reportLoading ? <div className="py-16 text-center text-sm text-white/35">Select a completed service to view its proof-of-service report.</div> : null}
          {reportLoading ? <div className="py-16 text-center text-sm text-white/35">Building proof-of-service projection...</div> : null}

          {!reportLoading && report ? (
            <div>
              <div className="flex flex-wrap items-start justify-between gap-4 border-b border-white/10 pb-5">
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#9BCF53]">Completed Customer Service</div>
                  <h2 className="mt-2 text-2xl font-semibold">{report.service?.service_name || "Service"}</h2>
                  <div className="mt-2 text-sm text-white/45">{report.service?.customer_name || "Customer"}{report.service?.customer_location_name ? ` · ${report.service.customer_location_name}` : ""}</div>
                </div>
                <StatusPill verified>Completed</StatusPill>
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-2xl border border-white/10 bg-black/20 p-4"><div className="text-[10px] uppercase tracking-[0.14em] text-white/30">Scheduled</div><div className="mt-2 text-sm text-white/75">{formatDate(report.service?.scheduled_at)}</div></div>
                <div className="rounded-2xl border border-white/10 bg-black/20 p-4"><div className="text-[10px] uppercase tracking-[0.14em] text-white/30">Completed</div><div className="mt-2 text-sm text-white/75">{formatDate(report.service?.completed_at)}</div></div>
                <div className="rounded-2xl border border-white/10 bg-black/20 p-4"><div className="text-[10px] uppercase tracking-[0.14em] text-white/30">Outcome</div><div className="mt-2 text-sm capitalize text-white/75">{report.protocol?.outcome || "—"}</div></div>
                <div className="rounded-2xl border border-white/10 bg-black/20 p-4"><div className="text-[10px] uppercase tracking-[0.14em] text-white/30">Evidence Record</div><div className="mt-2 truncate text-sm text-white/75">{report.source?.completion_evidence_id || "—"}</div></div>
              </div>

              <div className="mt-6 grid gap-5 xl:grid-cols-2">
                <div className="rounded-[22px] border border-white/10 bg-black/15 p-5">
                  <div className="text-sm font-semibold">Service Protocol</div>
                  <div className="mt-1 text-xs text-white/30">{report.protocol?.name || report.protocol?.code || "Captured completion fields"}</div>
                  <div className="mt-4 divide-y divide-white/[0.06]">
                    {(report.protocol?.fields || []).map((field) => (
                      <div key={field.key || field.label} className="grid gap-1 py-3 sm:grid-cols-[180px_minmax(0,1fr)] sm:gap-4">
                        <div className="text-xs text-white/35">{field.label}</div>
                        <div className="break-words text-sm text-white/75">{formatValue(field.value, field.unit)}</div>
                      </div>
                    ))}
                    {(report.protocol?.fields || []).length === 0 ? <div className="py-4 text-sm text-white/30">No protocol fields were recorded.</div> : null}
                  </div>
                  {report.protocol?.follow_up_notes ? <div className="mt-4 rounded-2xl border border-amber-400/15 bg-amber-400/[0.06] p-4 text-sm text-amber-100/80"><div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-200/60">Follow-up Notes</div><div className="mt-2">{report.protocol.follow_up_notes}</div></div> : null}
                </div>

                <div className="rounded-[22px] border border-white/10 bg-black/15 p-5">
                  <div className="text-sm font-semibold">Materials Used</div>
                  <div className="mt-1 text-xs text-white/30">Canonical Inventory consumption references from service completion.</div>
                  <div className="mt-4 divide-y divide-white/[0.06]">
                    {(report.materials || []).map((material, index) => (
                      <div key={material.movement_id || `${material.field_key}-${index}`} className="flex items-center justify-between gap-4 py-3">
                        <div><div className="text-sm text-white/75">{material.material_name}</div><div className="mt-1 text-[11px] text-white/30">Movement {material.movement_id || "recorded"}</div></div>
                        <div className="text-sm font-semibold text-white/70">{material.quantity}{material.unit ? ` ${material.unit}` : ""}</div>
                      </div>
                    ))}
                    {(report.materials || []).length === 0 ? <div className="py-4 text-sm text-white/30">No consumed materials were recorded for this service.</div> : null}
                  </div>
                </div>
              </div>

              <div className="mt-6 rounded-[22px] border border-white/10 bg-black/15 p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div><div className="text-sm font-semibold">Completion Evidence</div><div className="mt-1 text-xs text-white/30">Evidence remains linked to the authoritative uploaded records.</div></div>
                  <div className="flex flex-wrap gap-2">
                    <StatusPill verified={report.verification?.completion_evidence_recorded}>Completion record</StatusPill>
                    <StatusPill verified={report.verification?.customer_signature_recorded}>Customer signature</StatusPill>
                    <StatusPill verified={report.verification?.technician_signature_recorded}>Technician signature</StatusPill>
                  </div>
                </div>

                <div className="mt-5 space-y-5">
                  <PhotoGroup title="Before Photos" items={report.evidence?.before_photos || []} />
                  <PhotoGroup title="After Photos" items={report.evidence?.after_photos || []} />
                  <div className="grid gap-3 sm:grid-cols-2">
                    <EvidenceItem title="Customer Signature" item={report.evidence?.customer_signature} />
                    <EvidenceItem title="Technician Signature" item={report.evidence?.technician_signature} />
                  </div>
                </div>
              </div>

              <div className="mt-6 rounded-[22px] border border-cyan-300/15 bg-cyan-300/[0.045] p-5">
                <div className="text-sm font-semibold text-cyan-100">Verification boundary</div>
                <div className="mt-2 text-sm leading-6 text-cyan-100/55">{report.verification?.gps_note}</div>
                <div className="mt-3 text-xs text-cyan-100/35">This report is a deterministic read-only projection. It does not create a second document store or duplicate Operations evidence.</div>
              </div>

              <div className="mt-5 grid gap-2 text-[11px] text-white/25 sm:grid-cols-3">
                <div>Occurrence: {report.source?.occurrence_id || "—"}</div>
                <div>Work order: {report.source?.work_order_id || "—"}</div>
                <div>Service plan: {report.source?.service_plan_id || "—"}</div>
              </div>
            </div>
          ) : null}
        </main>
      </div>
    </section>
  );
}
