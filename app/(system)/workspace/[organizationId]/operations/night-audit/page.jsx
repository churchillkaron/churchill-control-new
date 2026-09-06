"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";

import {
  HotelEmptyState,
  HotelError,
  HotelField,
  HotelMetric,
  HotelPrimaryAction,
  HotelSecondaryAction,
  HotelSection,
  HotelStatusPill,
  HotelSuccess,
  HotelWorkspaceShell,
  hotelInputClass,
  hotelWorkspaceHref,
} from "@/components/workspace/hotel/HotelWorkspaceUI";

async function api(url, options) {
  const response = await fetch(url, { cache: "no-store", credentials: "include", ...options });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.success === false) {
    const error = new Error(payload.error || "Request failed");
    error.details = payload.details;
    throw error;
  }
  return payload;
}

function cutoffLabel(minutes) {
  const value = Math.max(0, Number(minutes || 0));
  const hour = Math.floor(value / 60);
  const minute = value % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function resolutionHref(organizationId, blocker) {
  const route = blocker?.resolution?.route;
  if (!route) return null;
  const base = hotelWorkspaceHref(organizationId, route);
  if (!blocker.bookingId) return base;
  const query = new URLSearchParams({ bookingId: String(blocker.bookingId) });
  return `${base}?${query.toString()}`;
}

export default function NightAuditPage() {
  const params = useParams();
  const organizationId = String(params?.organizationId || "");
  const [properties, setProperties] = useState([]);
  const [propertyId, setPropertyId] = useState("");
  const [operationalDate, setOperationalDate] = useState(null);
  const [preflight, setPreflight] = useState(null);
  const [audit, setAudit] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    let active = true;
    api(`/api/hotel/properties/list?organizationId=${encodeURIComponent(organizationId)}`).then((payload) => {
      if (!active) return;
      const list = payload.properties || [];
      setProperties(list);
      setPropertyId((current) => current && list.some((item) => item.id === current) ? current : list[0]?.id || "");
    }).catch((reason) => active && setError(reason.message));
    return () => { active = false; };
  }, [organizationId]);

  const load = useCallback(async () => {
    if (!propertyId) { setLoading(false); return; }
    setLoading(true); setError(""); setSuccess("");
    try {
      const payload = await api(`/api/hotel/night-audit?organizationId=${encodeURIComponent(organizationId)}&propertyId=${encodeURIComponent(propertyId)}`);
      setOperationalDate(payload.operationalDate || null);
      setPreflight(payload.preflight || null);
      setAudit(payload.audit || null);
    } catch (reason) {
      if (reason.details) setPreflight(reason.details);
      setError(reason.message);
    } finally { setLoading(false); }
  }, [organizationId, propertyId]);

  useEffect(() => { load(); }, [load]);

  async function closeAudit() {
    if (!propertyId) return;
    setSaving(true); setError(""); setSuccess("");
    try {
      const payload = await api("/api/hotel/night-audit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ organizationId, propertyId, action: "CLOSE" }),
      });
      setAudit(payload.audit || null);
      setPreflight(payload.preflight || null);
      setOperationalDate(payload.operationalDate || null);
      setSuccess(`Business day ${payload.operationalDate?.businessDate || ""} closed from live operating evidence.`);
    } catch (reason) {
      if (reason.details) setPreflight(reason.details);
      setError(reason.message);
    } finally { setSaving(false); }
  }

  const counts = preflight?.counts || {};
  const blockers = preflight?.blockers || [];
  const warnings = preflight?.warnings || [];
  const closed = audit?.status === "CLOSED";
  const configured = operationalDate?.configured === true && operationalDate?.compatibilityFallback !== true;
  const unresolved = blockers.length;
  const propertyName = properties.find((property) => property.id === propertyId)?.name || "Choose property";
  const closeState = closed ? "CLOSED" : preflight?.ready ? "READY" : "BLOCKED";
  const closeSummary = useMemo(() => {
    if (closed) return "The day is closed and the exact preflight evidence is stored.";
    if (loading) return "Re-evaluating live hotel work.";
    if (!configured) return "Set the property's real timezone and day cutoff before a business day can close.";
    if (unresolved) return `${unresolved} human decision${unresolved === 1 ? "" : "s"} remain before the day can close.`;
    return "No hard operating exceptions remain. The day can be closed from current evidence.";
  }, [closed, loading, configured, unresolved]);

  return (
    <HotelWorkspaceShell
      organizationId={organizationId}
      active="night-audit"
      eyebrow="Property day control"
      title="Day Close"
      subtitle="No report ritual and no force-close. Avantiqo continuously turns the property day into exact human work, then closes only when every blocking guest, stay, folio and property-time decision is resolved."
      context={propertyName}
      actions={<HotelSecondaryAction onClick={load} disabled={loading}>{loading ? "Refreshing…" : "Refresh live work"}</HotelSecondaryAction>}
    >
      <HotelError>{error}</HotelError><HotelSuccess>{success}</HotelSuccess>

      <HotelSection eyebrow="Live operating day" title={operationalDate?.businessDate || "Operational day unavailable"} detail={configured ? `${operationalDate.timezone} · Property date ${operationalDate.propertyDate} · Day rolls at ${cutoffLabel(operationalDate.cutoffMinutes)}` : "Operational date is not certified until this property has a real IANA timezone and business-day cutoff."} action={<HotelStatusPill value={configured ? "CONFIGURED" : "BLOCKED"} tone={configured ? "good" : "critical"} />}>
        <div className="grid gap-3 p-4 sm:grid-cols-[minmax(220px,360px)_1fr] md:p-5">
          <HotelField label="Property"><select className={hotelInputClass} value={propertyId} onChange={(event) => setPropertyId(event.target.value)}><option value="">Choose property</option>{properties.map((property) => <option key={property.id} value={property.id}>{property.name}</option>)}</select></HotelField>
          <div className="self-end text-[8px] leading-4 text-[#817B73]">The business date is server-owned. Staff choose the property, never the date. If the property clock is wrong, fix the property clock instead of overriding the operating day.</div>
        </div>
      </HotelSection>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <HotelMetric label="Work remaining" value={unresolved} detail="Hard decisions before close" attention={unresolved > 0} />
        <HotelMetric label="Unresolved arrivals" value={counts.overdueArrivals || 0} detail="Guest arrival still undecided" attention={(counts.overdueArrivals || 0) > 0} />
        <HotelMetric label="Unresolved departures" value={counts.overdueDepartures || 0} detail="Guest still in house" attention={(counts.overdueDepartures || 0) > 0} />
        <HotelMetric label="Open departure folios" value={counts.openDepartureFolios || 0} detail="Physical departure, money still open" attention={(counts.openDepartureFolios || 0) > 0} />
        <HotelMetric label="Channel attention" value={counts.channelWarnings || 0} detail="Visible integration follow-up" attention={(counts.channelWarnings || 0) > 0} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
        <HotelSection eyebrow="Human work queue" title={loading ? "Checking the property…" : blockers.length ? "Resolve these before close" : "No blocking work remains"} detail="Each item is the real operating exception, not a report row. Open the exact workspace, resolve it, then refresh; Avantiqo recomputes the day from source truth.">
          {loading ? <HotelEmptyState>Building the live property handover…</HotelEmptyState> : blockers.length ? <div className="divide-y divide-black/[0.05]">{blockers.map((blocker, index) => {
            const href = resolutionHref(organizationId, blocker);
            return <div key={`${blocker.type}-${blocker.bookingId || blocker.folioId || index}`} className="grid gap-3 px-4 py-4 md:grid-cols-[150px_minmax(0,1fr)_auto] md:items-center md:px-5">
              <HotelStatusPill value={blocker.type} tone="critical" />
              <div className="min-w-0"><div className="text-[9px] font-semibold text-[#403C37]">{blocker.label}</div><div className="mt-1 text-[8px] leading-4 text-[#817B73]">{blocker.detail || "Resolve this operating exception before close."}</div></div>
              {href ? <HotelPrimaryAction href={href}>{blocker.resolution?.label || "Resolve"}</HotelPrimaryAction> : null}
            </div>;
          })}</div> : <div className="px-5 py-7"><div className="text-[10px] font-semibold text-emerald-800">The property day is operationally clean.</div><div className="mt-1 text-[8px] leading-4 text-[#817B73]">No unresolved arrivals, departures, checked-out open folios or property-day configuration blockers remain.</div></div>}
          {warnings.length ? <div className="border-t border-black/[0.05] bg-amber-50/50"><div className="px-4 pt-3 text-[7px] font-semibold uppercase tracking-[0.1em] text-amber-800 md:px-5">Visible follow-up — not a false hard block</div>{warnings.map((warning, index) => { const href = resolutionHref(organizationId, warning); return <div key={warning.jobId || index} className="grid gap-2 px-4 py-3 md:grid-cols-[1fr_auto] md:items-center md:px-5"><div><div className="text-[8px] font-semibold text-amber-900">{warning.label}</div><div className="mt-0.5 text-[7px] leading-4 text-amber-900/80">{warning.detail}</div></div>{href ? <HotelSecondaryAction href={href}>{warning.resolution?.label || "Review"}</HotelSecondaryAction> : null}</div>; })}</div> : null}
        </HotelSection>

        <HotelSection eyebrow="Governed close" title={closed ? "Day closed" : preflight?.ready ? "Ready to close" : "Close follows the work"} detail={audit?.closed_at ? `Closed ${new Date(audit.closed_at).toLocaleString()}` : closeSummary}>
          <div className="space-y-4 p-4 md:p-5">
            <HotelStatusPill value={closeState} tone={closed || preflight?.ready ? "good" : "critical"} />
            <div className="rounded-xl border border-black/[0.06] bg-[#FBFAF7] p-3 text-[8px] leading-4 text-[#817B73]">Avantiqo re-runs the server preflight at the instant of close. A stale green screen cannot close a property after the underlying guest or financial state has changed.</div>
            <HotelPrimaryAction disabled={saving || closed || !preflight?.ready || !propertyId} onClick={closeAudit}>{saving ? "Rechecking live work…" : closed ? "Closed" : "Close clean business day"}</HotelPrimaryAction>
            {!configured ? <HotelSecondaryAction href={hotelWorkspaceHref(organizationId, "operational-day")}>Configure property clock</HotelSecondaryAction> : null}
          </div>
        </HotelSection>
      </div>
    </HotelWorkspaceShell>
  );
}
