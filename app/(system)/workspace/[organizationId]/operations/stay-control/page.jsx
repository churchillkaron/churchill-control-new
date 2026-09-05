"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";

import {
  HotelEmptyState, HotelError, HotelField, HotelMetric, HotelPrimaryAction, HotelSecondaryAction,
  HotelSection, HotelStatusPill, HotelSuccess, HotelWorkspaceShell, hotelInputClass, hotelTextareaClass,
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

export default function StayControlPage() {
  const params = useParams();
  const organizationId = String(params?.organizationId || "");
  const [properties, setProperties] = useState([]);
  const [propertyId, setPropertyId] = useState("");
  const [data, setData] = useState({ bookings: [], guests: [], rooms: [], folios: [], folioLines: [], roomMoves: [], offers: [], bookingUpsells: [] });
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [roomId, setRoomId] = useState("");
  const [moveReason, setMoveReason] = useState("");
  const [vipStatus, setVipStatus] = useState("STANDARD");
  const [language, setLanguage] = useState("");
  const [preferences, setPreferences] = useState("");
  const [lineType, setLineType] = useState("CHARGE");
  const [lineAmount, setLineAmount] = useState("");
  const [lineDescription, setLineDescription] = useState("");
  const [paymentReference, setPaymentReference] = useState("");
  const [arrivalLink, setArrivalLink] = useState("");

  useEffect(() => {
    let active = true;
    api(`/api/hotel/properties/list?organizationId=${encodeURIComponent(organizationId)}`)
      .then((payload) => { if (!active) return; const list = payload.properties || []; setProperties(list); setPropertyId(list[0]?.id || ""); })
      .catch((reason) => active && setError(reason.message));
    return () => { active = false; };
  }, [organizationId]);

  const load = useCallback(async () => {
    if (!propertyId) { setLoading(false); return; }
    setLoading(true); setError("");
    try {
      const payload = await api(`/api/hotel/stays?organizationId=${encodeURIComponent(organizationId)}&propertyId=${encodeURIComponent(propertyId)}`);
      setData(payload);
      setSelectedId((current) => current && payload.bookings?.some((booking) => booking.id === current) ? current : payload.bookings?.[0]?.id || "");
    } catch (reason) { setError(reason.message); } finally { setLoading(false); }
  }, [organizationId, propertyId]);

  useEffect(() => { load(); }, [load]);

  const guestById = useMemo(() => new Map((data.guests || []).map((guest) => [guest.id, guest])), [data.guests]);
  const roomById = useMemo(() => new Map((data.rooms || []).map((room) => [room.id, room])), [data.rooms]);
  const selected = (data.bookings || []).find((booking) => booking.id === selectedId) || null;
  const guest = selected ? guestById.get(selected.guest_id) : null;
  const room = selected ? roomById.get(selected.room_id) : null;
  const folio = selected ? (data.folios || []).find((item) => item.booking_id === selected.id) : null;
  const lines = folio ? (data.folioLines || []).filter((line) => line.folio_id === folio.id && !line.voided_at) : [];
  const folioTotal = lines.reduce((sum, line) => sum + Number(line.amount || 0) + Number(line.tax_amount || 0), 0);
  const arrivals = (data.bookings || []).filter((booking) => booking.status === "RESERVED").length;
  const inHouse = (data.bookings || []).filter((booking) => booking.status === "CHECKED_IN").length;
  const preArrivalMissing = (data.bookings || []).filter((booking) => booking.status === "RESERVED" && booking.pre_arrival_status !== "COMPLETED").length;
  const openFolios = (data.folios || []).filter((item) => item.status === "OPEN").length;

  useEffect(() => {
    setRoomId(""); setMoveReason(""); setArrivalLink("");
    setVipStatus(guest?.vip_status || "STANDARD");
    setLanguage(guest?.preferred_language || "");
    setPreferences(guest?.preferences?.notes || "");
  }, [selectedId, guest?.id, guest?.vip_status, guest?.preferred_language, guest?.preferences]);

  async function stayAction(action, extra = {}) {
    if (!selected) return null;
    setSaving(true); setError(""); setSuccess("");
    try {
      const payload = await api("/api/hotel/stays", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ organizationId, bookingId: selected.id, action, ...extra }) });
      await load();
      return payload;
    } catch (reason) { setError(reason.message); return null; } finally { setSaving(false); }
  }

  async function saveGuest() {
    const result = await stayAction("UPDATE_GUEST", { vipStatus, preferredLanguage: language, preferences: { ...(guest?.preferences || {}), notes: preferences } });
    if (result) setSuccess("Guest profile and stay preferences updated.");
  }

  async function assignRoom() {
    const result = await stayAction(selected?.room_id ? "MOVE_ROOM" : "ASSIGN_ROOM", { roomId, reason: moveReason });
    if (result) { setSuccess(`Room ${result.roomNumber || "assignment"} updated.`); setRoomId(""); setMoveReason(""); }
  }

  async function addLine() {
    const refType = lineType.includes("REFERENCE");
    const result = await stayAction("ADD_FOLIO_LINE", { lineType, amount: Number(lineAmount), description: lineDescription, sourceType: refType ? "PAYMENT_RUNTIME" : "HOTEL", sourceId: paymentReference || null });
    if (result) { setSuccess("Folio updated. Payment data remains referenced, not stored as raw card data."); setLineAmount(""); setLineDescription(""); setPaymentReference(""); }
  }

  async function createArrival() {
    const result = await stayAction("CREATE_PRE_ARRIVAL");
    if (result?.token) {
      const link = `${window.location.origin}/hotel-arrival/${result.token}`;
      setArrivalLink(link);
      setSuccess("Secure 72-hour guest pre-arrival link created.");
    }
  }

  async function acceptUpsell(offer) {
    if (!selected) return;
    setSaving(true); setError("");
    try {
      await api("/api/hotel/upsells", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ organizationId, propertyId, action: "ACCEPT", bookingId: selected.id, offerId: offer.id, quantity: 1 }) });
      setSuccess(`${offer.name} added to the stay.`); await load();
    } catch (reason) { setError(reason.message); } finally { setSaving(false); }
  }

  return (
    <HotelWorkspaceShell organizationId={organizationId} active="stays" eyebrow="Guest operations" title="Guests & Stays" subtitle="One operating record for the guest journey: profile, room, digital arrival, folio, deposit/payment references and stay enhancements." context={properties.find((p) => p.id === propertyId)?.name || "Choose property"}>
      <HotelError>{error}</HotelError><HotelSuccess>{success}</HotelSuccess>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <HotelMetric label="Reserved stays" value={arrivals} detail="Upcoming / unresolved arrivals" />
        <HotelMetric label="In house" value={inHouse} detail="Currently checked in" />
        <HotelMetric label="Pre-arrival needed" value={preArrivalMissing} detail="Reserved stays not digitally completed" attention={preArrivalMissing > 0} />
        <HotelMetric label="Open folios" value={openFolios} detail="Guest balances under control" attention={openFolios > 0} />
      </div>

      <HotelSection eyebrow="Property" title="Stay control scope">
        <div className="p-4 md:max-w-sm md:p-5"><HotelField label="Property"><select className={hotelInputClass} value={propertyId} onChange={(e) => setPropertyId(e.target.value)}><option value="">Choose property</option>{properties.map((property) => <option key={property.id} value={property.id}>{property.name}</option>)}</select></HotelField></div>
      </HotelSection>

      <div className="grid gap-4 xl:grid-cols-[minmax(360px,0.72fr)_minmax(0,1.28fr)]">
        <HotelSection eyebrow="Stay queue" title="Reservations & in-house guests" detail="Choose a stay to work the whole guest journey.">
          {!data.bookings?.length ? <HotelEmptyState>{loading ? "Loading stays…" : "No stays in this property."}</HotelEmptyState> : <div className="max-h-[720px] divide-y divide-black/[0.05] overflow-y-auto">{data.bookings.map((booking) => {
            const itemGuest = guestById.get(booking.guest_id); const itemRoom = roomById.get(booking.room_id); const active = booking.id === selectedId;
            return <button key={booking.id} onClick={() => setSelectedId(booking.id)} className={`grid w-full grid-cols-[1fr_auto] gap-3 px-4 py-3 text-left transition md:px-5 ${active ? "bg-[#FBF8F3]" : "hover:bg-[#FAF9F6]"}`}><div><div className="text-[9px] font-semibold text-[#3C3732]">{itemGuest?.full_name || "Guest"}</div><div className="mt-0.5 text-[7px] text-[#918B83]">{booking.check_in_date} → {booking.check_out_date} · {itemRoom ? `Room ${itemRoom.room_number}` : "Unassigned"}</div></div><HotelStatusPill value={booking.status} /></button>;
          })}</div>}
        </HotelSection>

        {!selected ? <HotelSection title="Stay details"><HotelEmptyState>Select a stay.</HotelEmptyState></HotelSection> : <div className="space-y-4">
          <HotelSection eyebrow="Guest profile" title={guest?.full_name || "Guest"} detail={`${selected.check_in_date} → ${selected.check_out_date} · ${selected.source || "Direct"}`} action={<HotelStatusPill value={selected.status} />}>
            <div className="grid gap-3 p-4 sm:grid-cols-2 md:p-5">
              <HotelField label="VIP status"><select className={hotelInputClass} value={vipStatus} onChange={(e) => setVipStatus(e.target.value)}><option>STANDARD</option><option>VIP</option><option>VVIP</option><option>RETURNING</option></select></HotelField>
              <HotelField label="Preferred language"><input className={hotelInputClass} value={language} onChange={(e) => setLanguage(e.target.value)} placeholder="English" /></HotelField>
              <div className="sm:col-span-2"><HotelField label="Preferences & stay notes"><textarea className={hotelTextareaClass} value={preferences} onChange={(e) => setPreferences(e.target.value)} placeholder="Quiet room, high floor, pillow preference…" /></HotelField></div>
              <div className="sm:col-span-2"><HotelPrimaryAction disabled={saving} onClick={saveGuest}>Save guest intelligence</HotelPrimaryAction></div>
            </div>
          </HotelSection>

          <div className="grid gap-4 lg:grid-cols-2">
            <HotelSection eyebrow="Room control" title={room ? `Room ${room.room_number}` : "Room unassigned"} detail={room ? `${room.room_type} · ${room.status}` : "Assign a ready room before check-in."}>
              <div className="space-y-3 p-4 md:p-5">
                <HotelField label={room ? "Move to available room" : "Assign available room"}><select className={hotelInputClass} value={roomId} onChange={(e) => setRoomId(e.target.value)}><option value="">Choose room</option>{data.rooms.filter((candidate) => candidate.status === "AVAILABLE" && candidate.id !== selected.room_id).map((candidate) => <option key={candidate.id} value={candidate.id}>Room {candidate.room_number} · {candidate.room_type}</option>)}</select></HotelField>
                <HotelField label="Reason"><input className={hotelInputClass} value={moveReason} onChange={(e) => setMoveReason(e.target.value)} placeholder="Guest request / operational move" /></HotelField>
                <HotelPrimaryAction disabled={saving || !roomId} onClick={assignRoom}>{room ? "Move room" : "Assign room"}</HotelPrimaryAction>
              </div>
            </HotelSection>

            <HotelSection eyebrow="Digital arrival" title={selected.pre_arrival_status === "COMPLETED" ? "Pre-arrival complete" : "Prepare guest before arrival"} detail="Registration reduces front-desk administration without bypassing hotel controls.">
              <div className="space-y-3 p-4 md:p-5"><div className="flex flex-wrap gap-2"><HotelStatusPill value={selected.pre_arrival_status} /><HotelStatusPill value={selected.registration_status} /><HotelStatusPill value={selected.mobile_arrival_status} /></div><HotelPrimaryAction disabled={saving || selected.status !== "RESERVED"} onClick={createArrival}>Create secure arrival link</HotelPrimaryAction>{arrivalLink ? <div className="rounded-xl border border-black/[0.07] bg-[#FBFAF7] p-3"><div className="break-all text-[8px] leading-4 text-[#675F57]">{arrivalLink}</div><button className="mt-2 text-[8px] font-semibold text-[#76583A]" onClick={() => navigator.clipboard?.writeText(arrivalLink)}>Copy link</button></div> : null}</div>
            </HotelSection>
          </div>

          <HotelSection eyebrow="Guest folio" title={folio ? `${folio.status} folio · ${money(folioTotal, folio.currency_code)}` : "Open on first charge"} detail="Charges live in Hotel. Deposits/payments/refunds are referenced to Finance or the payment runtime; no raw card data is stored here.">
            <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4 md:p-5">
              <HotelField label="Type"><select className={hotelInputClass} value={lineType} onChange={(e) => setLineType(e.target.value)}><option>CHARGE</option><option>ADJUSTMENT</option><option>DEPOSIT_REFERENCE</option><option>PAYMENT_REFERENCE</option><option>REFUND_REFERENCE</option></select></HotelField>
              <HotelField label="Amount"><input inputMode="decimal" className={hotelInputClass} value={lineAmount} onChange={(e) => setLineAmount(e.target.value)} placeholder="2500" /></HotelField>
              <HotelField label="Description"><input className={hotelInputClass} value={lineDescription} onChange={(e) => setLineDescription(e.target.value)} placeholder="Room charge / deposit" /></HotelField>
              <HotelField label="Finance / payment reference"><input className={hotelInputClass} value={paymentReference} onChange={(e) => setPaymentReference(e.target.value)} placeholder={lineType.includes("REFERENCE") ? "Required" : "Optional"} /></HotelField>
              <div className="sm:col-span-2 lg:col-span-4"><HotelPrimaryAction disabled={saving || !lineAmount || !lineDescription || (lineType.includes("REFERENCE") && !paymentReference)} onClick={addLine}>Add folio line</HotelPrimaryAction></div>
            </div>
            {lines.length ? <div className="divide-y divide-black/[0.05] border-t border-black/[0.05]">{lines.map((line) => <div key={line.id} className="grid grid-cols-[1fr_auto] gap-3 px-4 py-2.5 md:px-5"><div><div className="text-[8px] font-semibold text-[#4A453F]">{line.description}</div><div className="mt-0.5 text-[7px] text-[#99928A]">{line.line_type} {line.source_id ? `· Ref ${line.source_id}` : ""}</div></div><div className="text-[9px] font-semibold tabular-nums">{money(Number(line.amount || 0) + Number(line.tax_amount || 0), folio?.currency_code || selected.currency_code || "THB")}</div></div>)}</div> : null}
          </HotelSection>

          <HotelSection eyebrow="Stay enhancements" title="Upsell without extra admin" detail="Only active offers for this property are shown.">
            {!data.offers?.length ? <HotelEmptyState>No active upsell offers. Configure offers through hotel operations.</HotelEmptyState> : <div className="grid gap-2 p-4 sm:grid-cols-2 md:p-5">{data.offers.map((offer) => { const accepted = data.bookingUpsells?.some((item) => item.booking_id === selected.id && item.offer_id === offer.id && item.status === "ACCEPTED"); return <div key={offer.id} className="flex items-center justify-between gap-3 rounded-xl border border-black/[0.06] px-3 py-2.5"><div><div className="text-[8px] font-semibold">{offer.name}</div><div className="text-[7px] text-[#918B83]">{money(offer.price, offer.currency_code)}</div></div>{accepted ? <HotelStatusPill value="ACCEPTED" tone="good" /> : <HotelSecondaryAction disabled={saving} onClick={() => acceptUpsell(offer)}>Add</HotelSecondaryAction>}</div>})}</div>}
          </HotelSection>
        </div>}
      </div>
    </HotelWorkspaceShell>
  );
}
