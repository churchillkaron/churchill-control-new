"use client";

import { useEffect, useState } from "react";

import {
  HotelField,
  HotelPrimaryAction,
  HotelSection,
  HotelStatusPill,
  hotelInputClass,
} from "@/components/workspace/hotel/HotelWorkspaceUI";

function minutesToTime(value) {
  const minutes = Number.isFinite(Number(value)) ? Number(value) : 0;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
}

function timeToMinutes(value) {
  const match = String(value || "").match(/^(\d{2}):(\d{2})$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 12 || minutes > 59) return null;
  return hours * 60 + minutes;
}

export default function HotelOperationalDaySetup({ organizationId, properties = [], onSaved }) {
  const [drafts, setDrafts] = useState({});
  const [savingId, setSavingId] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    setDrafts(Object.fromEntries(properties.map((property) => [property.id, {
      timeZone: property.time_zone || "",
      cutoff: minutesToTime(property.business_day_cutoff_minutes),
    }])));
  }, [properties]);

  async function save(property) {
    const draft = drafts[property.id] || {};
    const cutoffMinutes = timeToMinutes(draft.cutoff);
    if (!draft.timeZone?.trim()) { setError("Enter the property's IANA timezone, for example Asia/Bangkok."); return; }
    if (cutoffMinutes === null) { setError("Business-day cutoff must be between 00:00 and 12:00."); return; }
    setSavingId(property.id); setError("");
    try {
      const response = await fetch("/api/hotel/properties/operational-day", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ organizationId, propertyId: property.id, timeZone: draft.timeZone.trim(), cutoffMinutes }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload.success === false) throw new Error(payload.error || "Unable to save operational day");
      if (typeof onSaved === "function") await onSaved();
    } catch (reason) {
      setError(reason?.message || "Unable to save operational day");
    } finally {
      setSavingId("");
    }
  }

  return (
    <HotelSection eyebrow="Operational day" title="Property-local business date" detail="Each property owns its timezone and the after-midnight cutoff that decides when the Hotel business date rolls forward. Avantiqo never guesses this boundary.">
      {properties.length ? <div className="divide-y divide-black/[0.055]">{properties.map((property) => {
        const draft = drafts[property.id] || { timeZone: "", cutoff: "00:00" };
        const configured = Boolean(property.time_zone && property.operational_day_configured_at);
        return <div key={property.id} className="grid gap-3 px-4 py-4 md:grid-cols-[minmax(150px,0.8fr)_minmax(220px,1.2fr)_150px_90px_auto] md:items-end md:px-5">
          <div><div className="text-[7px] font-semibold uppercase tracking-[0.1em] text-[#969087]">Property</div><div className="mt-1 text-[9px] font-semibold text-[#403C37]">{property.name}</div></div>
          <HotelField label="IANA timezone" hint="Examples: Asia/Bangkok, Europe/London, America/New_York"><input className={hotelInputClass} value={draft.timeZone} onChange={(event) => setDrafts((current) => ({ ...current, [property.id]: { ...draft, timeZone: event.target.value } }))} placeholder="Asia/Bangkok" /></HotelField>
          <HotelField label="Business-day cutoff" hint="00:00–12:00 local time"><input type="time" min="00:00" max="12:00" step="60" className={hotelInputClass} value={draft.cutoff} onChange={(event) => setDrafts((current) => ({ ...current, [property.id]: { ...draft, cutoff: event.target.value } }))} /></HotelField>
          <div className="pb-[2px]"><HotelStatusPill value={configured ? "CONFIGURED" : "REVIEW_REQUIRED"} tone={configured ? "good" : "warning"} /></div>
          <HotelPrimaryAction disabled={Boolean(savingId)} onClick={() => save(property)}>{savingId === property.id ? "Saving…" : configured ? "Update" : "Configure"}</HotelPrimaryAction>
        </div>;
      })}</div> : <div className="px-5 py-6 text-[9px] text-[#918B83]">Create a property before configuring its operational day.</div>}
      {error ? <div className="border-t border-black/[0.05] px-4 py-3 text-[8px] text-red-800 md:px-5">{error}</div> : null}
    </HotelSection>
  );
}
