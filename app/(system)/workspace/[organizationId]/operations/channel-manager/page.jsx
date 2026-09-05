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
} from "@/components/workspace/hotel/HotelWorkspaceUI";

function isoDate(date) {
  const value = new Date(date);
  value.setMinutes(value.getMinutes() - value.getTimezoneOffset());
  return value.toISOString().slice(0, 10);
}

function addDays(date, days) {
  const value = new Date(`${date}T12:00:00`);
  value.setDate(value.getDate() + days);
  return isoDate(value);
}

function dateRange(from, to) {
  if (!from || !to || from > to) return [];
  const rows = [];
  let cursor = from;
  while (cursor <= to && rows.length < 370) {
    rows.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return rows;
}

function money(value, currency = "THB") {
  const amount = Number(value || 0);
  return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);
}

function when(value) {
  return value ? new Date(value).toLocaleString() : "No evidence";
}

async function api(url, options) {
  const response = await fetch(url, { cache: "no-store", ...options });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.success === false) throw new Error(payload.error || "Request failed");
  return payload;
}

function EvidenceCheck({ label, ready }) {
  return <span className={`rounded-md border px-1.5 py-1 text-[7px] font-medium ${ready ? "border-emerald-800/15 bg-emerald-50 text-emerald-800" : "border-amber-900/10 bg-amber-50 text-amber-800"}`}>{label} · {ready ? "verified" : "pending"}</span>;
}

export default function HotelChannelManagerPage() {
  const params = useParams();
  const organizationId = String(params?.organizationId || "");
  const today = isoDate(new Date());
  const [properties, setProperties] = useState([]);
  const [propertyId, setPropertyId] = useState("");
  const [providers, setProviders] = useState([]);
  const [ratePlans, setRatePlans] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [calendar, setCalendar] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [planName, setPlanName] = useState("Standard Flexible");
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(addDays(today, 6));
  const [ratePlanId, setRatePlanId] = useState("");
  const [roomType, setRoomType] = useState("");
  const [rateAmount, setRateAmount] = useState("");
  const [inventory, setInventory] = useState("");
  const [minStay, setMinStay] = useState("1");
  const [maxStay, setMaxStay] = useState("");
  const [stopSell, setStopSell] = useState(false);
  const [closedToArrival, setClosedToArrival] = useState(false);
  const [closedToDeparture, setClosedToDeparture] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    api(`/api/hotel/properties/list?organizationId=${encodeURIComponent(organizationId)}`)
      .then((payload) => {
        if (!active) return;
        const next = payload.properties || [];
        setProperties(next);
        setPropertyId((current) => current || next[0]?.id || "");
      })
      .catch((reason) => active && setError(reason.message))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [organizationId]);

  const loadProperty = useCallback(async () => {
    if (!propertyId) return;
    setLoading(true);
    setError("");
    try {
      const query = `organizationId=${encodeURIComponent(organizationId)}&propertyId=${encodeURIComponent(propertyId)}&from=${from}&to=${to}`;
      const [channelPayload, ratePayload] = await Promise.all([api(`/api/hotel/channels?${query}`), api(`/api/hotel/rates?${query}`)]);
      setProviders(channelPayload.providers || []);
      setRatePlans(ratePayload.ratePlans || []);
      setRooms(ratePayload.rooms || []);
      setCalendar(ratePayload.calendar || []);
      setRatePlanId((current) => current || ratePayload.ratePlans?.[0]?.id || "");
      const firstRoomType = [...new Set((ratePayload.rooms || []).map((room) => room.room_type).filter(Boolean))][0] || "";
      setRoomType((current) => current || firstRoomType);
      if (!rateAmount && firstRoomType) {
        const base = (ratePayload.rooms || []).find((room) => room.room_type === firstRoomType)?.base_rate;
        if (base !== undefined && base !== null) setRateAmount(String(base));
      }
    } catch (reason) {
      setError(reason.message);
    } finally {
      setLoading(false);
    }
  }, [organizationId, propertyId, from, to, rateAmount]);

  useEffect(() => { loadProperty(); }, [loadProperty]);

  const roomTypes = useMemo(() => [...new Set(rooms.map((room) => room.room_type).filter(Boolean))].sort(), [rooms]);
  const liveChannels = providers.filter((provider) => provider.readiness?.live).length;
  const setupPending = providers.filter((provider) => provider.connection && !provider.readiness?.live).length;
  const transmissionExceptions = providers.filter((provider) => ["TRANSMISSION_FAILED"].includes(provider.readiness?.code)).length;
  const closedDates = calendar.filter((row) => row.stop_sell).length;
  const selectedProperty = properties.find((property) => property.id === propertyId);
  const selectedPlan = ratePlans.find((plan) => plan.id === ratePlanId);

  async function createRatePlan() {
    if (!propertyId || !planName.trim()) return;
    setSaving(true); setError(""); setSuccess("");
    try {
      const payload = await api("/api/hotel/rate-plans", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ organizationId, propertyId, name: planName, currencyCode: "THB" }) });
      setSuccess(`${payload.ratePlan.name} is ready for pricing and distribution.`);
      setRatePlanId(payload.ratePlan.id);
      await loadProperty();
    } catch (reason) { setError(reason.message); } finally { setSaving(false); }
  }

  async function saveRates() {
    const dates = dateRange(from, to);
    if (!ratePlanId || !roomType || !dates.length) return setError("Choose a rate plan, room type and valid date range.");
    setSaving(true); setError(""); setSuccess("");
    try {
      const payload = await api("/api/hotel/rates", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ organizationId, propertyId, ratePlanId, roomType, entries: dates.map((stayDate) => ({ stayDate, rateAmount: Number(rateAmount || 0), inventory: inventory === "" ? null : Number(inventory), minStay: Number(minStay || 1), maxStay: maxStay === "" ? null : Number(maxStay), stopSell, closedToArrival, closedToDeparture })) }),
      });
      const dateLabel = `${dates.length} day${dates.length === 1 ? "" : "s"}`;
      setSuccess(payload.distributionQueued
        ? `${dateLabel} saved. ${payload.destinationCount} certified mapping${payload.destinationCount === 1 ? "" : "s"} entered the internal delivery queue; OTA transmission is not claimed until provider ACK evidence appears.`
        : `${dateLabel} saved in Avantiqo. No OTA delivery was queued because certified connectivity, enablement, or room/rate-plan mapping is still incomplete.`);
      await loadProperty();
    } catch (reason) { setError(reason.message); } finally { setSaving(false); }
  }

  async function beginChannelSetup(providerId) {
    if (!propertyId) return;
    setSaving(true); setError(""); setSuccess("");
    try {
      const payload = await api("/api/hotel/channels", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ organizationId, propertyId, provider: providerId }) });
      setSuccess(`${payload.connection.display_name} setup record is ready. ${payload.onboarding}. Live status remains blocked until credentials, mapping, certification, ARI acknowledgement and reservation reconciliation have evidence.`);
      await loadProperty();
    } catch (reason) { setError(reason.message); } finally { setSaving(false); }
  }

  return (
    <HotelWorkspaceShell organizationId={organizationId} active="channels" eyebrow="Distribution control" title="Channel Manager" subtitle="One governed rate and inventory source, with proof-based OTA transmission and reservation reconciliation. A configured record is never presented as a live channel." context={selectedProperty?.name || "Choose property"} actions={<HotelSecondaryAction href={`/workspace/${organizationId}/operations/hotel-setup`}>Hotel setup</HotelSecondaryAction>}>
      <HotelError>{error}</HotelError>
      <HotelSuccess>{success}</HotelSuccess>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <HotelMetric label="Certified live" value={liveChannels} detail={`${setupPending} configured channel${setupPending === 1 ? "" : "s"} still gated`} />
        <HotelMetric label="Room types" value={roomTypes.length} detail={`${rooms.length} physical rooms in selected property`} />
        <HotelMetric label="Transmission exceptions" value={transmissionExceptions} detail="Rejected or failed OTA delivery evidence" attention={transmissionExceptions > 0} />
        <HotelMetric label="Stop-sell days" value={closedDates} detail={`${from} to ${to}`} attention={closedDates > 0} />
      </div>

      <HotelSection eyebrow="01 · Property" title="One commercial source of truth" detail="All channel pricing begins with the selected property. Hotels.com is governed through Expedia Group connectivity where supported.">
        <div className="grid gap-3 p-4 md:grid-cols-[minmax(220px,360px)_1fr] md:p-5">
          <HotelField label="Property"><select className={hotelInputClass} value={propertyId} onChange={(event) => { setPropertyId(event.target.value); setRatePlanId(""); setRoomType(""); }}><option value="">Choose property</option>{properties.map((property) => <option key={property.id} value={property.id}>{property.name}</option>)}</select></HotelField>
          <div className="rounded-xl border border-black/[0.06] bg-[#FBFAF7] px-3 py-2.5 text-[8px] leading-4 text-[#817B73]">Avantiqo remains the master rate/inventory record. OTA portals are endpoints. <strong className="text-[#4A453F]">Certified live</strong> requires credentials, exact mapping, official provider certification, an acknowledged ARI transmission, and a reconciled reservation-ingest proof. Raw provider credentials are never returned to this workspace.</div>
        </div>
      </HotelSection>

      <HotelSection eyebrow="02 · Channels" title="Proof-based distribution readiness" detail="Every provider uses the same evidence chain. Setup state and real external connectivity are intentionally separate.">
        {!propertyId ? <HotelEmptyState>Create or choose a hotel property first.</HotelEmptyState> : <div className="divide-y divide-black/[0.05]">{providers.map((provider) => {
          const connection = provider.connection;
          const readiness = provider.readiness || {};
          const checks = readiness.checks || {};
          const evidence = provider.evidence || {};
          const status = readiness.label || "Not connected";
          const latestTransmission = evidence.latestTransmission;
          const latestReservation = evidence.latestReservationEvent;
          const latestReconciliation = evidence.latestReconciliation;
          return <div key={provider.id} className="space-y-3 px-4 py-4 md:px-5">
            <div className="grid gap-3 md:grid-cols-[minmax(180px,0.8fr)_minmax(280px,1.4fr)_150px_auto] md:items-start">
              <div><div className="text-[10px] font-semibold text-[#39342F]">{provider.name}</div><div className="mt-0.5 text-[7px] text-[#989188]">{provider.network}</div></div>
              <div className="text-[8px] leading-4 text-[#817B73]">{readiness.blockers?.[0] || "All required proof is present."}<div className="mt-1 text-[7px] text-[#A09A92]">Mapping rows {evidence.mappingCount || 0} · ARI {latestTransmission ? `${latestTransmission.status} ${when(latestTransmission.acknowledged_at || latestTransmission.created_at)}` : "no transmission evidence"} · Reservation {latestReservation ? `${latestReservation.status} ${when(latestReservation.received_at)}` : "no ingest evidence"}{latestReconciliation ? ` · Reconciliation ${latestReconciliation.status}` : ""}</div></div>
              <HotelStatusPill value={status} tone={readiness.live ? "good" : !connection ? "neutral" : readiness.code === "TRANSMISSION_FAILED" ? "critical" : "warning"} />
              <HotelSecondaryAction disabled={saving || !propertyId} onClick={() => beginChannelSetup(provider.id)}>{connection ? "Review setup" : "Create setup"}</HotelSecondaryAction>
            </div>
            {connection ? <div className="flex flex-wrap gap-1.5"><EvidenceCheck label="Credentials" ready={checks.credentials} /><EvidenceCheck label="Property + room mapping" ready={checks.mapping} /><EvidenceCheck label="Provider certification" ready={checks.certification} /><EvidenceCheck label="ARI ACK" ready={checks.transmissionAcknowledged} /><EvidenceCheck label="Reservation ingest" ready={checks.reservationIngested} /><EvidenceCheck label="Booking reconciliation" ready={checks.reservationReconciled} /></div> : null}
          </div>;
        })}</div>}
      </HotelSection>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(310px,0.5fr)]">
        <HotelSection eyebrow="03 · Rates & inventory" title="Change once, queue only certified destinations" detail="Canonical values are saved first. Eligibility for the internal delivery queue requires an active, credentialed, certified, enabled and mapped channel; provider delivery still requires external ACK evidence.">
          <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4 md:p-5">
            <HotelField label="From"><input type="date" className={hotelInputClass} value={from} onChange={(e) => setFrom(e.target.value)} /></HotelField>
            <HotelField label="To"><input type="date" className={hotelInputClass} value={to} onChange={(e) => setTo(e.target.value)} /></HotelField>
            <HotelField label="Rate plan"><select className={hotelInputClass} value={ratePlanId} onChange={(e) => setRatePlanId(e.target.value)}><option value="">Choose plan</option>{ratePlans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name}</option>)}</select></HotelField>
            <HotelField label="Room type"><select className={hotelInputClass} value={roomType} onChange={(e) => { const next = e.target.value; setRoomType(next); const base = rooms.find((room) => room.room_type === next)?.base_rate; if (base !== undefined) setRateAmount(String(base)); }}><option value="">Choose type</option>{roomTypes.map((type) => <option key={type} value={type}>{type}</option>)}</select></HotelField>
            <HotelField label={`Nightly rate${selectedPlan ? ` · ${selectedPlan.currency_code}` : ""}`}><input inputMode="decimal" className={hotelInputClass} value={rateAmount} onChange={(e) => setRateAmount(e.target.value)} placeholder="4500" /></HotelField>
            <HotelField label="Inventory"><input inputMode="numeric" className={hotelInputClass} value={inventory} onChange={(e) => setInventory(e.target.value)} placeholder="Leave blank = derived" /></HotelField>
            <HotelField label="Minimum stay"><input inputMode="numeric" className={hotelInputClass} value={minStay} onChange={(e) => setMinStay(e.target.value)} /></HotelField>
            <HotelField label="Maximum stay"><input inputMode="numeric" className={hotelInputClass} value={maxStay} onChange={(e) => setMaxStay(e.target.value)} placeholder="No maximum" /></HotelField>
          </div>
          <div className="flex flex-wrap gap-2 border-t border-black/[0.05] px-4 py-3 md:px-5">
            {[["Stop sell", stopSell, setStopSell], ["Closed to arrival", closedToArrival, setClosedToArrival], ["Closed to departure", closedToDeparture, setClosedToDeparture]].map(([label, checked, setter]) => <label key={label} className="flex items-center gap-2 rounded-lg border border-black/[0.07] bg-[#FBFAF7] px-2.5 py-2 text-[8px] font-medium text-[#69635D]"><input type="checkbox" checked={checked} onChange={(e) => setter(e.target.checked)} /> {label}</label>)}
            <div className="ml-auto"><HotelPrimaryAction disabled={saving || !propertyId || !ratePlanId || !roomType} onClick={saveRates}>{saving ? "Saving…" : `Apply ${dateRange(from, to).length || ""} days`}</HotelPrimaryAction></div>
          </div>
        </HotelSection>

        <HotelSection eyebrow="Rate plans" title="Commercial products" detail="Create the sellable plan once, then price it by room type and date.">
          <div className="space-y-3 p-4 md:p-5">
            <HotelField label="New plan name"><input className={hotelInputClass} value={planName} onChange={(e) => setPlanName(e.target.value)} placeholder="Standard Flexible" /></HotelField>
            <HotelPrimaryAction disabled={saving || !propertyId || !planName.trim()} onClick={createRatePlan}>Create / update plan</HotelPrimaryAction>
            <div className="space-y-1.5 pt-1">{ratePlans.map((plan) => <div key={plan.id} className="flex items-center justify-between rounded-lg border border-black/[0.06] px-2.5 py-2"><div><div className="text-[8px] font-semibold text-[#4B4640]">{plan.name}</div><div className="text-[7px] text-[#A09A92]">{plan.code} · {plan.currency_code}</div></div><HotelStatusPill value={plan.active ? "ACTIVE" : "INACTIVE"} tone={plan.active ? "good" : "neutral"} /></div>)}{!ratePlans.length && !loading ? <div className="text-[8px] text-[#989188]">No rate plans yet.</div> : null}</div>
          </div>
        </HotelSection>
      </div>

      <HotelSection eyebrow="04 · Published control" title="Current governed values" detail={`${calendar.length} date/room/rate records loaded for the selected window.`}>
        {!calendar.length ? <HotelEmptyState>No explicit rate-calendar overrides in this date range yet.</HotelEmptyState> : <div className="overflow-x-auto"><table className="w-full min-w-[780px] border-collapse text-left text-[8px]"><thead className="bg-[#FAF9F6] text-[7px] uppercase tracking-[0.08em] text-[#918B83]"><tr><th className="px-4 py-2.5">Date</th><th className="px-3">Room type</th><th className="px-3">Rate</th><th className="px-3">Inventory</th><th className="px-3">Min stay</th><th className="px-3">Restrictions</th></tr></thead><tbody className="divide-y divide-black/[0.05]">{calendar.slice(0, 200).map((row) => <tr key={row.id}><td className="px-4 py-2.5 font-medium text-[#4A453F]">{row.stay_date}</td><td className="px-3">{row.room_type}</td><td className="px-3 font-semibold">{money(row.rate_amount, selectedPlan?.currency_code || "THB")}</td><td className="px-3">{row.inventory ?? "Derived"}</td><td className="px-3">{row.min_stay}</td><td className="px-3"><div className="flex flex-wrap gap-1">{row.stop_sell ? <HotelStatusPill value="STOP SELL" tone="critical" /> : null}{row.closed_to_arrival ? <HotelStatusPill value="CTA" tone="warning" /> : null}{row.closed_to_departure ? <HotelStatusPill value="CTD" tone="warning" /> : null}{!row.stop_sell && !row.closed_to_arrival && !row.closed_to_departure ? <HotelStatusPill value="OPEN" tone="good" /> : null}</div></td></tr>)}</tbody></table></div>}
      </HotelSection>
    </HotelWorkspaceShell>
  );
}
