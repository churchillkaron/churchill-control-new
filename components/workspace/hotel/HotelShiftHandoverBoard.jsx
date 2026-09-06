"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, RefreshCw } from "lucide-react";

import {
  HotelEmptyState,
  HotelError,
  HotelMetric,
  HotelPrimaryAction,
  HotelSecondaryAction,
  HotelSection,
  HotelStatusPill,
  hotelInputClass,
  hotelWorkspaceHref,
} from "@/components/workspace/hotel/HotelWorkspaceUI";

async function hotelApi(url, options = {}) {
  const response = await fetch(url, { cache: "no-store", credentials: "include", ...options });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.success === false) throw new Error(payload.error || "Hotel handover operation failed");
  return payload;
}

function resolutionHref(organizationId, item) {
  const base = hotelWorkspaceHref(organizationId, item.route);
  const query = new URLSearchParams();
  if (item.bookingId) query.set("bookingId", String(item.bookingId));
  if (item.propertyId) query.set("propertyId", String(item.propertyId));
  return query.size ? `${base}?${query.toString()}` : base;
}

function severityTone(value) {
  if (value === "CRITICAL") return "border-red-200 bg-red-50 text-red-800";
  if (value === "ACTION") return "border-amber-200 bg-amber-50 text-amber-800";
  return "border-black/[0.08] bg-[#F7F6F3] text-[#716B63]";
}

export default function HotelShiftHandoverBoard({ organizationId }) {
  const [properties, setProperties] = useState([]);
  const [propertyId, setPropertyId] = useState("");
  const [handover, setHandover] = useState(null);
  const [staff, setStaff] = useState([]);
  const [currentStaffAccountId, setCurrentStaffAccountId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState("");
  const [error, setError] = useState("");
  const [draftNotes, setDraftNotes] = useState({});
  const [area, setArea] = useState("ALL");

  const loadProperties = useCallback(async () => {
    if (!organizationId) return [];
    const payload = await hotelApi(`/api/hotel/properties/list?organizationId=${encodeURIComponent(organizationId)}`);
    return payload.properties || [];
  }, [organizationId]);

  const loadHandover = useCallback(async (selectedPropertyId = propertyId) => {
    if (!organizationId || !selectedPropertyId) {
      setHandover(null); setLoading(false); return;
    }
    setLoading(true); setError("");
    try {
      const query = new URLSearchParams({ organizationId: String(organizationId), propertyId: String(selectedPropertyId) });
      const payload = await hotelApi(`/api/hotel/shift-handover?${query.toString()}`);
      setHandover(payload.handover || null);
      setStaff(payload.staff || []);
      setCurrentStaffAccountId(payload.currentStaffAccountId || null);
      setDraftNotes(Object.fromEntries((payload.handover?.exceptions || []).map((item) => [item.sourceKey, item.context?.note || ""])));
    } catch (reason) { setError(reason?.message || "Unable to build shift handover"); }
    finally { setLoading(false); }
  }, [organizationId, propertyId]);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true); setError("");
      try {
        const rows = await loadProperties();
        if (!active) return;
        setProperties(rows);
        const first = rows[0]?.id || "";
        setPropertyId(first);
        if (first) await loadHandover(first);
        else setLoading(false);
      } catch (reason) {
        if (active) { setError(reason?.message || "Unable to load Hotel properties"); setLoading(false); }
      }
    })();
    return () => { active = false; };
  }, [loadProperties]);

  async function updateContext(item, action, extra = {}) {
    setBusyKey(item.sourceKey); setError("");
    try {
      const payload = await hotelApi("/api/hotel/shift-handover", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ organizationId, propertyId, sourceKey: item.sourceKey, action, ...extra }),
      });
      setHandover(payload.handover || null);
    } catch (reason) { setError(reason?.message || "Unable to update handover context"); }
    finally { setBusyKey(""); }
  }

  const exceptions = handover?.exceptions || [];
  const areas = useMemo(() => ["ALL", ...new Set(exceptions.map((item) => item.area))], [exceptions]);
  const visible = area === "ALL" ? exceptions : exceptions.filter((item) => item.area === area);
  const summary = handover?.summary || {};
  const day = handover?.operationalDate || {};

  return <div className="space-y-4">
    <HotelError>{error}</HotelError>

    <HotelSection eyebrow="Property handover" title="What the next shift cannot miss" detail="Avantiqo rebuilds this list from live Hotel truth every time. Acknowledging, assigning or adding context never resolves an item; it leaves only when the underlying booking, payment, room, housekeeping, channel or governance condition is actually fixed.">
      <div className="grid gap-3 md:grid-cols-[minmax(240px,380px)_1fr_auto] md:items-end">
        <label><span className="text-[7px] font-semibold uppercase tracking-[0.1em] text-[#8D877F]">Property</span><select className={`${hotelInputClass} mt-1.5`} value={propertyId} onChange={async (event) => { const next = event.target.value; setPropertyId(next); await loadHandover(next); }}>{properties.map((property) => <option key={property.id} value={property.id}>{property.name || "Hotel property"}</option>)}</select></label>
        <div className="text-[8px] leading-4 text-[#817B73]">{day.configured ? <>Property day <strong className="text-[#403C37]">{day.businessDate}</strong> · {day.timezone} · cutoff +{day.cutoffMinutes} minutes</> : <>Property clock is <strong className="text-red-800">not governed</strong>. Date-sensitive work remains visible as a critical exception.</>}</div>
        <HotelSecondaryAction onClick={() => loadHandover()} disabled={loading || !propertyId}><RefreshCw size={9} className={loading ? "animate-spin" : ""} />Refresh truth</HotelSecondaryAction>
      </div>
    </HotelSection>

    <div className="grid gap-3 sm:grid-cols-4">
      <HotelMetric label="Live work" value={summary.total || 0} detail="Still true in source records" attention={(summary.total || 0) > 0} />
      <HotelMetric label="Critical" value={summary.critical || 0} detail="Cannot safely drift into next shift" attention={(summary.critical || 0) > 0} />
      <HotelMetric label="Needs owner" value={summary.unowned || 0} detail="No accountable staff member yet" attention={(summary.unowned || 0) > 0} />
      <HotelMetric label="Acknowledged" value={summary.acknowledged || 0} detail="Seen, but not necessarily fixed" />
    </div>

    <HotelSection eyebrow="Live exception queue" title="Work that survives the shift" detail="Use the note only for facts Avantiqo cannot know—for example a guest promise, phone call outcome or manager instruction. Do not copy the system status into the note.">
      <div className="mb-3 flex flex-wrap gap-1.5">{areas.map((value) => <button key={value} type="button" onClick={() => setArea(value)} className={area === value ? "rounded-lg bg-[#25231F] px-2.5 py-1.5 text-[8px] font-semibold text-white" : "rounded-lg border border-black/[0.07] bg-white px-2.5 py-1.5 text-[8px] font-semibold text-[#716B63]"}>{value.replaceAll("_", " ")}</button>)}</div>
      {loading ? <HotelEmptyState>Re-reading live Hotel work…</HotelEmptyState> : visible.length ? <div className="divide-y divide-black/[0.055]">{visible.map((item) => {
        const context = item.context || {};
        const busy = busyKey === item.sourceKey;
        const assigned = context.assigned_staff_account_id || "";
        const acknowledged = Boolean(context.acknowledged_at);
        return <div key={item.sourceKey} className="px-4 py-4 md:px-5">
          <div className="grid gap-3 xl:grid-cols-[minmax(260px,1.15fr)_minmax(320px,1.5fr)_190px_150px_auto] xl:items-start">
            <div><div className="flex flex-wrap items-center gap-1.5"><span className={`rounded-full border px-2 py-1 text-[7px] font-semibold uppercase tracking-[0.08em] ${severityTone(item.severity)}`}>{item.severity}</span><HotelStatusPill value={item.area} /></div><div className="mt-2 text-[10px] font-semibold text-[#403C37]">{item.title}</div><div className="mt-1 text-[7px] text-[#9A948C]">{item.code} · property day {item.businessDate || "not governed"}</div></div>
            <div className="text-[8px] leading-4 text-[#817B73]">{item.detail}</div>
            <label><span className="text-[7px] font-semibold uppercase tracking-[0.1em] text-[#8D877F]">Owner</span><select className={`${hotelInputClass} mt-1.5`} value={assigned} disabled={busy} onChange={(event) => updateContext(item, "ASSIGN", { assignedStaffAccountId: event.target.value })}><option value="">Needs owner</option>{staff.map((person) => <option key={person.id} value={person.id}>{person.name || person.email || "Staff"}</option>)}</select></label>
            <div><div className="text-[7px] font-semibold uppercase tracking-[0.1em] text-[#8D877F]">Seen by shift</div><div className="mt-1.5">{acknowledged ? <HotelSecondaryAction disabled={busy} onClick={() => updateContext(item, "CLEAR_ACKNOWLEDGEMENT")}><Check size={9} />Acknowledged</HotelSecondaryAction> : <HotelSecondaryAction disabled={busy || !currentStaffAccountId} onClick={() => updateContext(item, "ACKNOWLEDGE")}>Acknowledge</HotelSecondaryAction>}</div></div>
            <HotelPrimaryAction href={resolutionHref(organizationId, item)}>Go fix it</HotelPrimaryAction>
          </div>
          <div className="mt-3 grid gap-2 md:grid-cols-[1fr_auto] md:items-end"><label><span className="text-[7px] font-semibold uppercase tracking-[0.1em] text-[#8D877F]">Human context only</span><textarea className={`${hotelInputClass} mt-1.5 min-h-16 resize-y`} maxLength={2000} placeholder="Only add what the system cannot know…" value={draftNotes[item.sourceKey] ?? context.note ?? ""} onChange={(event) => setDraftNotes((current) => ({ ...current, [item.sourceKey]: event.target.value }))} /></label><HotelSecondaryAction disabled={busy || (draftNotes[item.sourceKey] ?? "") === (context.note || "")} onClick={() => updateContext(item, "NOTE", { note: draftNotes[item.sourceKey] || "" })}>{busy ? "Saving…" : "Save context"}</HotelSecondaryAction></div>
        </div>;
      })}</div> : <HotelEmptyState>No unresolved Hotel work is crossing this shift. Source truth is clear.</HotelEmptyState>}
    </HotelSection>
  </div>;
}
