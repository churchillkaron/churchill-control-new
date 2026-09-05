"use client";

export const dynamic = "force-dynamic";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { RefreshCw } from "lucide-react";

import { useBusinessContext } from "@/app/providers/BusinessContextProvider";
import {
  HotelEmptyState,
  HotelError,
  HotelField,
  HotelPrimaryAction,
  HotelSecondaryAction,
  HotelSection,
  HotelStatusPill,
  HotelSuccess,
  HotelWorkspaceShell,
  hotelInputClass,
  hotelWorkspaceHref,
} from "@/components/workspace/hotel/HotelWorkspaceUI";

function dateValue(value) {
  return String(value || "").slice(0, 10);
}

export default function OperationsReservationsPage() {
  const params = useParams();
  const businessContext = useBusinessContext() || {};
  const organization = businessContext.organization || null;
  const organizationId = params?.organizationId || businessContext.organization_id || organization?.id || null;
  const [properties, setProperties] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [guests, setGuests] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [form, setForm] = useState({ propertyId: "", roomId: "", guestId: "", check_in_date: "", check_out_date: "" });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState(null);

  const loadWorkspace = useCallback(async () => {
    if (!organizationId) return;
    setLoading(true);
    setError(null);
    try {
      const query = `?organizationId=${encodeURIComponent(organizationId)}`;
      const responses = await Promise.all([
        fetch(`/api/hotel/properties/list${query}`, { cache: "no-store", credentials: "include" }),
        fetch(`/api/hotel/rooms/list${query}`, { cache: "no-store", credentials: "include" }),
        fetch(`/api/hotel/guests/list${query}`, { cache: "no-store", credentials: "include" }),
        fetch(`/api/hotel/bookings/list${query}`, { cache: "no-store", credentials: "include" }),
      ]);
      const results = await Promise.all(responses.map(async (response) => {
        const result = await response.json();
        if (!response.ok || result.success === false) throw new Error(result.error || "Unable to load reservations workspace");
        return result;
      }));
      setProperties(results[0].properties || []);
      setRooms(results[1].rooms || []);
      setGuests(results[2].guests || []);
      setBookings(results[3].bookings || []);
    } catch (loadError) {
      setError(loadError?.message || "Unable to load reservations workspace");
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => { loadWorkspace(); }, [loadWorkspace]);

  const availableRooms = useMemo(() => rooms.filter((room) => !form.propertyId || String(room.property_id || "") === String(form.propertyId)), [form.propertyId, rooms]);
  const upcomingBookings = useMemo(() => bookings
    .filter((booking) => ["RESERVED", "CHECKED_IN"].includes(String(booking.status || "").toUpperCase()))
    .sort((a, b) => dateValue(a.check_in_date).localeCompare(dateValue(b.check_in_date))), [bookings]);

  async function createReservation() {
    if (!organizationId) return;
    if (!form.propertyId || !form.roomId || !form.guestId || !form.check_in_date || !form.check_out_date) {
      setError("Property, room, guest and stay dates are required"); return;
    }
    if (form.check_out_date <= form.check_in_date) { setError("Check-out must be after check-in"); return; }
    setSaving(true); setError(null); setMessage(null);
    try {
      const response = await fetch("/api/hotel/bookings/create", {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId, ...form }),
      });
      const result = await response.json();
      if (!response.ok || result.success === false) throw new Error(result.error || "Reservation failed");
      setForm({ propertyId: "", roomId: "", guestId: "", check_in_date: "", check_out_date: "" });
      setMessage("Reservation created and ready for the Front Desk flow.");
      await loadWorkspace();
    } catch (saveError) {
      setError(saveError?.message || "Reservation failed");
    } finally { setSaving(false); }
  }

  return (
    <HotelWorkspaceShell
      organizationId={organizationId}
      active="reservations"
      title="Reservations"
      subtitle="Create and review stays without losing the operating context that Front Desk and room readiness depend on."
      context={organization?.name || "Property"}
      actions={<>
        <HotelPrimaryAction href={hotelWorkspaceHref(organizationId, "front-desk")}>Open Front Desk</HotelPrimaryAction>
        <HotelSecondaryAction onClick={loadWorkspace} disabled={loading}><RefreshCw size={9} className={loading ? "animate-spin" : ""} />Refresh</HotelSecondaryAction>
      </>}
    >
      <HotelError>{error}</HotelError>
      <HotelSuccess>{message}</HotelSuccess>

      <div className="grid gap-4 xl:grid-cols-[minmax(320px,0.45fr)_minmax(0,1.55fr)]">
        <HotelSection eyebrow="New stay" title="Create reservation" detail="Choose the accountable property, room, guest and stay dates.">
          <div className="grid gap-3 p-4">
            <HotelField label="Property"><select value={form.propertyId} onChange={(event) => setForm((current) => ({ ...current, propertyId: event.target.value, roomId: "" }))} className={hotelInputClass}><option value="">Select property</option>{properties.map((property) => <option key={property.id} value={property.id}>{property.name || property.property_name}</option>)}</select></HotelField>
            <HotelField label="Room"><select value={form.roomId} onChange={(event) => setForm((current) => ({ ...current, roomId: event.target.value }))} className={hotelInputClass}><option value="">Select room</option>{availableRooms.map((room) => <option key={room.id} value={room.id}>{room.room_number} · {room.room_type || "Room"}</option>)}</select></HotelField>
            <HotelField label="Guest"><select value={form.guestId} onChange={(event) => setForm((current) => ({ ...current, guestId: event.target.value }))} className={hotelInputClass}><option value="">Select guest</option>{guests.map((guest) => <option key={guest.id} value={guest.id}>{guest.full_name || [guest.first_name, guest.last_name].filter(Boolean).join(" ") || "Guest"}</option>)}</select></HotelField>
            <div className="grid gap-3 sm:grid-cols-2">
              <HotelField label="Arrival"><input type="date" value={form.check_in_date} onChange={(event) => setForm((current) => ({ ...current, check_in_date: event.target.value }))} className={hotelInputClass} /></HotelField>
              <HotelField label="Departure"><input type="date" value={form.check_out_date} onChange={(event) => setForm((current) => ({ ...current, check_out_date: event.target.value }))} className={hotelInputClass} /></HotelField>
            </div>
            <HotelPrimaryAction onClick={createReservation} disabled={saving}>{saving ? "Creating…" : "Create reservation"}</HotelPrimaryAction>
          </div>
        </HotelSection>

        <HotelSection eyebrow="Stay book" title="Upcoming and active stays" detail="A compact operating list that hands directly into Front Desk.">
          {loading ? <HotelEmptyState>Loading reservations…</HotelEmptyState> : upcomingBookings.length ? (
            <div className="divide-y divide-black/[0.055]">
              <div className="hidden grid-cols-[minmax(190px,1.2fr)_110px_120px_120px_100px] gap-3 bg-[#FCFBF8] px-5 py-2 text-[7px] font-semibold uppercase tracking-[0.1em] text-[#969087] md:grid"><span>Guest</span><span>Room</span><span>Arrival</span><span>Departure</span><span>Status</span></div>
              {upcomingBookings.map((booking) => (
                <div key={booking.id} className="grid gap-2 px-4 py-3 md:grid-cols-[minmax(190px,1.2fr)_110px_120px_120px_100px] md:items-center md:gap-3 md:px-5">
                  <div className="truncate text-[9px] font-semibold text-[#403C37]">{booking.hotel_guests?.full_name || "Guest"}</div>
                  <div className="text-[8px] text-[#716B63]">{booking.hotel_rooms?.room_number || "Unassigned"}</div>
                  <div className="text-[8px] text-[#716B63]">{dateValue(booking.check_in_date)}</div>
                  <div className="text-[8px] text-[#716B63]">{dateValue(booking.check_out_date)}</div>
                  <HotelStatusPill value={booking.status || "RESERVED"} />
                </div>
              ))}
            </div>
          ) : <HotelEmptyState>No upcoming bookings.</HotelEmptyState>}
        </HotelSection>
      </div>
    </HotelWorkspaceShell>
  );
}
