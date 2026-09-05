"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";

import {
  HotelEmptyState, HotelError, HotelField, HotelMetric, HotelPrimaryAction, HotelSection,
  HotelStatusPill, HotelSuccess, HotelWorkspaceShell, hotelInputClass, hotelTextareaClass,
} from "@/components/workspace/hotel/HotelWorkspaceUI";

async function api(url, options) {
  const response = await fetch(url, { cache: "no-store", ...options });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.success === false) throw new Error(payload.error || "Request failed");
  return payload;
}

function money(value, currency = "THB") {
  return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(Number(value || 0));
}

export default function HotelRevenuePage() {
  const params = useParams();
  const organizationId = String(params?.organizationId || "");
  const [properties, setProperties] = useState([]);
  const [propertyId, setPropertyId] = useState("");
  const [forecast, setForecast] = useState(null);
  const [groups, setGroups] = useState([]);
  const [offers, setOffers] = useState([]);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [saving, setSaving] = useState(false);
  const [group, setGroup] = useState({ name: "", groupCode: "", arrivalDate: "", departureDate: "", roomBlock: "", notes: "" });
  const [offer, setOffer] = useState({ name: "", price: "", description: "" });

  useEffect(() => {
    let active = true;
    api(`/api/hotel/properties/list?organizationId=${encodeURIComponent(organizationId)}`).then((payload) => {
      if (!active) return; const list = payload.properties || []; setProperties(list); setPropertyId(list[0]?.id || "");
    }).catch((reason) => active && setError(reason.message));
    return () => { active = false; };
  }, [organizationId]);

  const load = useCallback(async () => {
    if (!propertyId) return;
    setError("");
    try {
      const query = `organizationId=${encodeURIComponent(organizationId)}&propertyId=${encodeURIComponent(propertyId)}`;
      const [forecastPayload, groupPayload, offerPayload] = await Promise.all([
        api(`/api/hotel/revenue-forecast?${query}&days=30`), api(`/api/hotel/groups?${query}`), api(`/api/hotel/upsells?${query}`),
      ]);
      setForecast(forecastPayload); setGroups(groupPayload.groups || []); setOffers(offerPayload.offers || []);
    } catch (reason) { setError(reason.message); }
  }, [organizationId, propertyId]);

  useEffect(() => { load(); }, [load]);

  async function createGroup() {
    setSaving(true); setError(""); setSuccess("");
    try {
      await api("/api/hotel/groups", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ organizationId, propertyId, ...group }) });
      setSuccess("Group block created and visible in revenue control."); setGroup({ name: "", groupCode: "", arrivalDate: "", departureDate: "", roomBlock: "", notes: "" }); await load();
    } catch (reason) { setError(reason.message); } finally { setSaving(false); }
  }

  async function createOffer() {
    setSaving(true); setError(""); setSuccess("");
    try {
      await api("/api/hotel/upsells", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ organizationId, propertyId, action: "CREATE", ...offer, currencyCode: forecast?.currencyCode || "THB" }) });
      setSuccess("Stay enhancement created and available to guest/stay workflows."); setOffer({ name: "", price: "", description: "" }); await load();
    } catch (reason) { setError(reason.message); } finally { setSaving(false); }
  }

  async function snapshot() {
    if (!forecast?.forecast?.length) return;
    setSaving(true); setError("");
    try {
      await api("/api/hotel/revenue-forecast", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ organizationId, propertyId, forecast: forecast.forecast }) });
      setSuccess("Current 30-day forecast snapshot saved for historical comparison.");
    } catch (reason) { setError(reason.message); } finally { setSaving(false); }
  }

  const totals = forecast?.totals || {};
  const currency = forecast?.currencyCode || "THB";
  return (
    <HotelWorkspaceShell organizationId={organizationId} active="revenue" eyebrow="Property revenue" title="Revenue & Demand" subtitle="Forward occupancy, ADR and RevPAR beside group blocks and stay enhancements — one property-level commercial view." context={properties.find((p) => p.id === propertyId)?.name || "Choose property"}>
      <HotelError>{error}</HotelError><HotelSuccess>{success}</HotelSuccess>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <HotelMetric label="30-day occupancy" value={`${Number(totals.occupancyPercent || 0).toFixed(1)}%`} detail={`${totals.soldRoomNights || 0} sold room nights`} />
        <HotelMetric label="ADR" value={money(totals.adr, currency)} detail="Average daily room rate" />
        <HotelMetric label="RevPAR" value={money(totals.revpar, currency)} detail="Revenue per available room" />
        <HotelMetric label="Room revenue" value={money(totals.roomRevenue, currency)} detail="Current reservation-based 30-day forecast" />
      </div>

      <HotelSection eyebrow="Property" title="Revenue scope"><div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-end md:p-5"><div className="w-full sm:max-w-sm"><HotelField label="Property"><select className={hotelInputClass} value={propertyId} onChange={(e) => setPropertyId(e.target.value)}><option value="">Choose property</option>{properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></HotelField></div><HotelPrimaryAction disabled={saving || !forecast?.forecast?.length} onClick={snapshot}>Save forecast snapshot</HotelPrimaryAction></div></HotelSection>

      <HotelSection eyebrow="30-day outlook" title="Occupancy, ADR & RevPAR" detail="Calculated from available physical rooms and active reservations. Group blocks remain separate demand until converted into bookings.">
        {!forecast?.forecast?.length ? <HotelEmptyState>No forecast data.</HotelEmptyState> : <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-left text-[8px]"><thead className="bg-[#FAF9F6] text-[7px] uppercase tracking-[0.08em] text-[#918B83]"><tr><th className="px-4 py-2.5">Stay date</th><th className="px-3">Sold / available</th><th className="px-3">Occupancy</th><th className="px-3">ADR</th><th className="px-3">RevPAR</th><th className="px-3">Room revenue</th></tr></thead><tbody className="divide-y divide-black/[0.05]">{forecast.forecast.map((row) => <tr key={row.stayDate}><td className="px-4 py-2.5 font-medium">{row.stayDate}</td><td className="px-3">{row.roomsSold} / {row.roomsAvailable}</td><td className="px-3"><span className={row.occupancyPercent >= 90 ? "font-semibold text-[#9A533D]" : "font-semibold"}>{row.occupancyPercent.toFixed(1)}%</span></td><td className="px-3">{money(row.adr, currency)}</td><td className="px-3">{money(row.revpar, currency)}</td><td className="px-3 font-semibold">{money(row.roomRevenue, currency)}</td></tr>)}</tbody></table></div>}
      </HotelSection>

      <div className="grid gap-4 xl:grid-cols-2">
        <HotelSection eyebrow="Group demand" title="Group reservations & room blocks" detail="Track prospective and confirmed group demand before it silently consumes inventory.">
          <div className="grid gap-3 p-4 sm:grid-cols-2 md:p-5"><HotelField label="Group name"><input className={hotelInputClass} value={group.name} onChange={(e) => setGroup({ ...group, name: e.target.value })} /></HotelField><HotelField label="Code"><input className={hotelInputClass} value={group.groupCode} onChange={(e) => setGroup({ ...group, groupCode: e.target.value })} /></HotelField><HotelField label="Arrival"><input type="date" className={hotelInputClass} value={group.arrivalDate} onChange={(e) => setGroup({ ...group, arrivalDate: e.target.value })} /></HotelField><HotelField label="Departure"><input type="date" className={hotelInputClass} value={group.departureDate} onChange={(e) => setGroup({ ...group, departureDate: e.target.value })} /></HotelField><HotelField label="Room block"><input inputMode="numeric" className={hotelInputClass} value={group.roomBlock} onChange={(e) => setGroup({ ...group, roomBlock: e.target.value })} /></HotelField><div className="sm:col-span-2"><HotelField label="Notes"><textarea className={hotelTextareaClass} value={group.notes} onChange={(e) => setGroup({ ...group, notes: e.target.value })} /></HotelField></div><div className="sm:col-span-2"><HotelPrimaryAction disabled={saving || !group.name} onClick={createGroup}>Create group block</HotelPrimaryAction></div></div>
          {groups.length ? <div className="divide-y divide-black/[0.05] border-t border-black/[0.05]">{groups.map((item) => <div key={item.id} className="flex items-center justify-between gap-3 px-4 py-2.5 md:px-5"><div><div className="text-[8px] font-semibold">{item.name}</div><div className="text-[7px] text-[#918B83]">{item.arrival_date || "TBD"} → {item.departure_date || "TBD"} · {item.room_block} rooms</div></div><HotelStatusPill value={item.status} /></div>)}</div> : null}
        </HotelSection>

        <HotelSection eyebrow="Incremental revenue" title="Stay enhancements" detail="Create controlled offers once; front desk and digital journeys can reuse them.">
          <div className="grid gap-3 p-4 sm:grid-cols-2 md:p-5"><HotelField label="Offer name"><input className={hotelInputClass} value={offer.name} onChange={(e) => setOffer({ ...offer, name: e.target.value })} placeholder="Airport transfer" /></HotelField><HotelField label={`Price · ${currency}`}><input inputMode="decimal" className={hotelInputClass} value={offer.price} onChange={(e) => setOffer({ ...offer, price: e.target.value })} /></HotelField><div className="sm:col-span-2"><HotelField label="Description"><textarea className={hotelTextareaClass} value={offer.description} onChange={(e) => setOffer({ ...offer, description: e.target.value })} /></HotelField></div><div className="sm:col-span-2"><HotelPrimaryAction disabled={saving || !offer.name || offer.price === ""} onClick={createOffer}>Create stay enhancement</HotelPrimaryAction></div></div>
          {offers.length ? <div className="divide-y divide-black/[0.05] border-t border-black/[0.05]">{offers.map((item) => <div key={item.id} className="flex items-center justify-between gap-3 px-4 py-2.5 md:px-5"><div><div className="text-[8px] font-semibold">{item.name}</div><div className="text-[7px] text-[#918B83]">{money(item.price, item.currency_code)}</div></div><HotelStatusPill value={item.active ? "ACTIVE" : "INACTIVE"} tone={item.active ? "good" : "neutral"} /></div>)}</div> : null}
        </HotelSection>
      </div>
    </HotelWorkspaceShell>
  );
}
