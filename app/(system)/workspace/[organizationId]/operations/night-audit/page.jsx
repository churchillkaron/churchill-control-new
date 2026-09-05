"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";

import {
  HotelEmptyState, HotelError, HotelField, HotelMetric, HotelPrimaryAction, HotelSection,
  HotelStatusPill, HotelSuccess, HotelWorkspaceShell, hotelInputClass,
} from "@/components/workspace/hotel/HotelWorkspaceUI";

async function api(url, options) {
  const response = await fetch(url, { cache: "no-store", ...options });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.success === false) {
    const error = new Error(payload.error || "Request failed");
    error.details = payload.details;
    throw error;
  }
  return payload;
}

function todayIso() { return new Date().toISOString().slice(0, 10); }

export default function NightAuditPage() {
  const params = useParams();
  const organizationId = String(params?.organizationId || "");
  const [properties, setProperties] = useState([]);
  const [propertyId, setPropertyId] = useState("");
  const [businessDate, setBusinessDate] = useState(todayIso());
  const [preflight, setPreflight] = useState(null);
  const [audit, setAudit] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    let active = true;
    api(`/api/hotel/properties/list?organizationId=${encodeURIComponent(organizationId)}`).then((payload) => {
      if (!active) return; const list = payload.properties || []; setProperties(list); setPropertyId(list[0]?.id || "");
    }).catch((reason) => active && setError(reason.message));
    return () => { active = false; };
  }, [organizationId]);

  const load = useCallback(async () => {
    if (!propertyId) { setLoading(false); return; }
    setLoading(true); setError("");
    try {
      const payload = await api(`/api/hotel/night-audit?organizationId=${encodeURIComponent(organizationId)}&propertyId=${encodeURIComponent(propertyId)}&businessDate=${businessDate}`);
      setPreflight(payload.preflight); setAudit(payload.audit);
    } catch (reason) { setError(reason.message); } finally { setLoading(false); }
  }, [organizationId, propertyId, businessDate]);

  useEffect(() => { load(); }, [load]);

  async function closeAudit() {
    setSaving(true); setError(""); setSuccess("");
    try {
      const payload = await api("/api/hotel/night-audit", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ organizationId, propertyId, businessDate, action: "CLOSE" }) });
      setAudit(payload.audit); setPreflight(payload.preflight); setSuccess(`Business date ${businessDate} closed with governed preflight evidence.`);
    } catch (reason) {
      if (reason.details) setPreflight(reason.details);
      setError(reason.message);
    } finally { setSaving(false); }
  }

  const counts = preflight?.counts || {};
  const closed = audit?.status === "CLOSED";
  return (
    <HotelWorkspaceShell organizationId={organizationId} active="night-audit" eyebrow="End of day control" title="Night Audit" subtitle="Close the hotel business date only after arrivals, departures and checked-out folios are operationally resolved. No silent override path." context={properties.find((p) => p.id === propertyId)?.name || "Choose property"}>
      <HotelError>{error}</HotelError><HotelSuccess>{success}</HotelSuccess>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <HotelMetric label="Unresolved arrivals" value={counts.overdueArrivals || 0} detail="Reserved at or before business date" attention={(counts.overdueArrivals || 0) > 0} />
        <HotelMetric label="Unresolved departures" value={counts.overdueDepartures || 0} detail="Still checked in at or before departure" attention={(counts.overdueDepartures || 0) > 0} />
        <HotelMetric label="Open departure folios" value={counts.openDepartureFolios || 0} detail="Checked-out stays that still need folio closure" attention={(counts.openDepartureFolios || 0) > 0} />
        <HotelMetric label="Channel warnings" value={counts.channelWarnings || 0} detail="Visible but do not incorrectly block business-date close" attention={(counts.channelWarnings || 0) > 0} />
      </div>

      <HotelSection eyebrow="01 · Scope" title="Business date">
        <div className="grid gap-3 p-4 sm:grid-cols-2 md:max-w-2xl md:p-5">
          <HotelField label="Property"><select className={hotelInputClass} value={propertyId} onChange={(e) => setPropertyId(e.target.value)}><option value="">Choose property</option>{properties.map((property) => <option key={property.id} value={property.id}>{property.name}</option>)}</select></HotelField>
          <HotelField label="Business date"><input type="date" className={hotelInputClass} value={businessDate} onChange={(e) => setBusinessDate(e.target.value)} /></HotelField>
        </div>
      </HotelSection>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
        <HotelSection eyebrow="02 · Preflight" title={preflight?.ready ? "Ready to close" : "Operating exceptions must be resolved"} detail="Avantiqo recomputes this evidence on the server at the moment of close.">
          {loading ? <HotelEmptyState>Running governed preflight…</HotelEmptyState> : preflight?.blockers?.length ? <div className="divide-y divide-black/[0.05]">{preflight.blockers.map((blocker, index) => <div key={`${blocker.type}-${blocker.bookingId || blocker.folioId || index}`} className="grid gap-2 px-4 py-3 md:grid-cols-[150px_1fr] md:px-5"><HotelStatusPill value={blocker.type} tone="critical" /><div className="text-[8px] leading-4 text-[#69635D]">{blocker.label}</div></div>)}</div> : <div className="px-5 py-7"><div className="text-[10px] font-semibold text-emerald-800">All hard controls passed.</div><div className="mt-1 text-[8px] leading-4 text-[#817B73]">No unresolved arrival, departure or checked-out open-folio blockers were found for this business date.</div></div>}
          {preflight?.warnings?.length ? <div className="border-t border-black/[0.05] bg-amber-50/50 px-4 py-3 md:px-5"><div className="text-[7px] font-semibold uppercase tracking-[0.1em] text-amber-800">Warnings</div>{preflight.warnings.map((warning) => <div key={warning.jobId} className="mt-1 text-[8px] leading-4 text-amber-900">{warning.label}</div>)}</div> : null}
        </HotelSection>

        <HotelSection eyebrow="03 · Governed close" title={closed ? "Business date closed" : "Close only when clean"} detail={closed && audit?.closed_at ? `Closed ${new Date(audit.closed_at).toLocaleString()}` : "There is deliberately no force-close button on this workspace."}>
          <div className="space-y-3 p-4 md:p-5"><HotelStatusPill value={closed ? "CLOSED" : preflight?.ready ? "READY" : "BLOCKED"} tone={closed || preflight?.ready ? "good" : "critical"} /><p className="text-[8px] leading-4 text-[#817B73]">Closing stores the exact preflight summary as audit evidence. If operating state changes, the server checks again before accepting the close.</p><HotelPrimaryAction disabled={saving || closed || !preflight?.ready || !propertyId} onClick={closeAudit}>{saving ? "Checking…" : closed ? "Closed" : "Close business date"}</HotelPrimaryAction></div>
        </HotelSection>
      </div>
    </HotelWorkspaceShell>
  );
}
