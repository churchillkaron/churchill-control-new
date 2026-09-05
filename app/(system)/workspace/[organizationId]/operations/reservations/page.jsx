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
  const [availableRooms, setAvailableRooms] = useState([]);
  const [groups, setGroups] = useState([]);
  const [guests, setGuests] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [form, setForm] = useState({ propertyId: "", groupId: "", roomId: "", guestId: "", check_in_date: "", check_out_date: "" });
  const [loading, setLoading] = useState(true);
  const [checkingGroups, setCheckingGroups] = useState(false);
  const [checkingAvailability, setCheckingAvailability] = useState(false);
  const [availabilityChecked, setAvailabilityChecked] = useState(false);
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
        fetch(`/api/hotel/guests/list${query}`, { cache: "no-store", credentials: "include" }),
        fetch(`/api/hotel/bookings/list${query}`, { cache: "no-store", credentials: "include" }),
      ]);
      const results = await Promise.all(responses.map(async (response) => {
        const result = await response.json();
        if (!response.ok || result.success === false) throw new Error(result.error || "Unable to load reservations workspace");
        return result;
      }));
      setProperties(results[0].properties || []);
      setGuests(results[1].guests || []);
      setBookings(results[2].bookings || []);
    } catch (loadError) {
      setError(loadError?.message || "Unable to load reservations workspace");
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => { loadWorkspace(); }, [loadWorkspace]);

  useEffect(() => {
    let active = true;
    setGroups([]);
    if (!organizationId || !form.propertyId) return () => { active = false; };
    setCheckingGroups(true);
    fetch(`/api/hotel/groups?organizationId=${encodeURIComponent(organizationId)}&propertyId=${encodeURIComponent(form.propertyId)}`, { cache: "no-store", credentials: "include" })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok || result.success === false) throw new Error(result.error || "Unable to load group business");
        if (!active) return;
        setGroups((result.groups || []).filter((group) => ["PROSPECT", "TENTATIVE", "CONFIRMED", "IN_HOUSE"].includes(String(group.status || "").toUpperCase())));
      })
      .catch((reason) => active && setError(reason.message))
      .finally(() => active && setCheckingGroups(false));
    return () => { active = false; };
  }, [organizationId, form.propertyId]);

  useEffect(() => {
    let active = true;
    const valid = form.propertyId && form.check_in_date && form.check_out_date && form.check_out_date > form.check_in_date;
    setForm((current) => current.roomId ? { ...current, roomId: "" } : current);
    setAvailableRooms([]);
    setAvailabilityChecked(false);
    if (!valid || !organizationId) return () => { active = false; };

    const timer = setTimeout(async () => {
      setCheckingAvailability(true);
      setError(null);
      try {
        const response = await fetch("/api/hotel/availability", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            organizationId,
            propertyId: form.propertyId,
            groupId: form.groupId || null,
            checkInDate: form.check_in_date,
            checkOutDate: form.check_out_date,
          }),
        });
        const result = await response.json();
        if (!response.ok || result.success === false) throw new Error(result.error || "Unable to check room availability");
        if (!active) return;
        setAvailableRooms(result.rooms || []);
        setAvailabilityChecked(true);
      } catch (availabilityError) {
        if (active) setError(availabilityError?.message || "Unable to check room availability");
      } finally {
        if (active) setCheckingAvailability(false);
      }
    }, 180);

    return () => { active = false; clearTimeout(timer); };
  }, [organizationId, form.propertyId, form.groupId, form.check_in_date, form.check_out_date]);

  const upcomingBookings = useMemo(() => bookings
    .filter((booking) => ["RESERVED", "CHECKED_IN"].includes(String(booking.status || "").toUpperCase()))
    .sort((a, b) => dateValue(a.check_in_date).localeCompare(dateValue(b.check_in_date))), [bookings]);

  const availableByType = useMemo(() => {
    const result = new Map();
    for (const room of availableRooms) result.set(room.room_type || "Room", (result.get(room.room_type || "Room") || 0) + 1);
    return [...result.entries()];
  }, [availableRooms]);

  const selectedGroup = groups.find((group) => group.id === form.groupId) || null;

  function chooseGroup(groupId) {
    const group = groups.find((item) => item.id === groupId);
    setForm((current) => ({
      ...current,
      groupId,
      roomId: "",
      check_in_date: group?.arrival_date || current.check_in_date,
      check_out_date: group?.departure_date || current.check_out_date,
    }));
  }

  async function createReservation() {
    if (!organizationId) return;
    if (!form.propertyId || !form.roomId || !form.guestId || !form.check_in_date || !form.check_out_date) {
      setError("Property, dates, available room and guest are required"); return;
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
      const groupName = selectedGroup?.name;
      setForm((current) => ({ propertyId: current.propertyId, groupId: current.groupId, roomId: "", guestId: "", check_in_date: current.groupId ? current.check_in_date : "", check_out_date: current.groupId ? current.check_out_date : "" }));
      setAvailableRooms([]);
      setAvailabilityChecked(false);
      setMessage(groupName ? `Group pickup created for ${groupName} against its governed allotment.` : "Reservation created against live governed availability and handed to Front Desk.");
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
      subtitle="Create transient stays or group pickup against live room availability after existing reservations, out-of-service rooms and unpicked group allotments are protected."
      context={organization?.name || "Property"}
      actions={<>
        <HotelPrimaryAction href={hotelWorkspaceHref(organizationId, "front-desk")}>Open Front Desk</HotelPrimaryAction>
        <HotelSecondaryAction href={hotelWorkspaceHref(organizationId, "group-reservations")}>Groups</HotelSecondaryAction>
        <HotelSecondaryAction onClick={loadWorkspace} disabled={loading}><RefreshCw size={9} className={loading ? "animate-spin" : ""} />Refresh</HotelSecondaryAction>
      </>}
    >
      <HotelError>{error}</HotelError>
      <HotelSuccess>{message}</HotelSuccess>

      <div className="grid gap-4 xl:grid-cols-[minmax(340px,0.48fr)_minmax(0,1.52fr)]">
        <HotelSection eyebrow="New stay" title="Create reservation" detail="Property and stay dates come first. Select a group when this reservation should consume its held allotment.">
          <div className="grid gap-3 p-4">
            <HotelField label="Property"><select value={form.propertyId} onChange={(event) => setForm((current) => ({ ...current, propertyId: event.target.value, groupId: "", roomId: "" }))} className={hotelInputClass}><option value="">Select property</option>{properties.map((property) => <option key={property.id} value={property.id}>{property.name || property.property_name}</option>)}</select></HotelField>
            <HotelField label="Group / allotment"><select value={form.groupId} onChange={(event) => chooseGroup(event.target.value)} className={hotelInputClass} disabled={!form.propertyId || checkingGroups}><option value="">Transient / no group</option>{groups.map((group) => <option key={group.id} value={group.id}>{group.name} · {group.status}</option>)}</select></HotelField>
            {selectedGroup ? <div className="rounded-xl border border-[#A37849]/15 bg-[#FBF8F3] px-3 py-2 text-[8px] leading-4 text-[#756A5E]">Pickup against <strong>{selectedGroup.name}</strong>. Group dates prefill the stay; changing dates is still validated against the group’s remaining dated room block.</div> : null}
            <div className="grid gap-3 sm:grid-cols-2">
              <HotelField label="Arrival"><input type="date" value={form.check_in_date} onChange={(event) => setForm((current) => ({ ...current, check_in_date: event.target.value, roomId: "" }))} className={hotelInputClass} /></HotelField>
              <HotelField label="Departure"><input type="date" value={form.check_out_date} onChange={(event) => setForm((current) => ({ ...current, check_out_date: event.target.value, roomId: "" }))} className={hotelInputClass} /></HotelField>
            </div>

            <div className="rounded-xl border border-black/[0.06] bg-[#FBFAF7] px-3 py-2.5">
              <div className="flex items-center justify-between gap-2"><span className="text-[7px] font-semibold uppercase tracking-[0.1em] text-[#8D877F]">Live availability</span>{checkingAvailability ? <span className="text-[7px] text-[#8D877F]">Checking…</span> : availabilityChecked ? <HotelStatusPill value={availableRooms.length ? "AVAILABLE" : "BLOCKED"} tone={availableRooms.length ? "good" : "critical"} /> : <HotelStatusPill value="DATES NEEDED" tone="neutral" />}</div>
              {availabilityChecked ? <div className="mt-2 flex flex-wrap gap-1.5">{availableByType.length ? availableByType.map(([type, count]) => <span key={type} className="rounded-md border border-black/[0.06] bg-white px-2 py-1 text-[7px] font-medium text-[#6C655E]">{type} · {count}</span>) : <span className="text-[8px] text-[#9A533D]">No sellable rooms remain for the full stay.</span>}</div> : <div className="mt-1.5 text-[8px] leading-4 text-[#918B83]">Select a property and valid stay dates before choosing a room.</div>}
            </div>

            <HotelField label="Available room"><select value={form.roomId} onChange={(event) => setForm((current) => ({ ...current, roomId: event.target.value }))} className={hotelInputClass} disabled={!availabilityChecked || checkingAvailability}><option value="">{checkingAvailability ? "Checking availability…" : "Select sellable room"}</option>{availableRooms.map((room) => <option key={room.id} value={room.id}>{room.room_number} · {room.room_type || "Room"}</option>)}</select></HotelField>
            <HotelField label="Guest"><select value={form.guestId} onChange={(event) => setForm((current) => ({ ...current, guestId: event.target.value }))} className={hotelInputClass}><option value="">Select guest</option>{guests.map((guest) => <option key={guest.id} value={guest.id}>{guest.full_name || [guest.first_name, guest.last_name].filter(Boolean).join(" ") || "Guest"}</option>)}</select></HotelField>
            <HotelPrimaryAction onClick={createReservation} disabled={saving || checkingAvailability || !availabilityChecked || !form.roomId}>{saving ? "Creating…" : selectedGroup ? "Create group pickup" : "Create reservation"}</HotelPrimaryAction>
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
