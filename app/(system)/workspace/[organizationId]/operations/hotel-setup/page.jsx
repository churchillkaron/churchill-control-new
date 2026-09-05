"use client";

export const dynamic = "force-dynamic";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { RefreshCw } from "lucide-react";

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
  hotelTextareaClass,
} from "@/components/workspace/hotel/HotelWorkspaceUI";

const EMPTY_PROPERTY = { name: "", address: "", city: "", country: "" };
const EMPTY_ROOM = { propertyId: "", roomNumber: "", roomType: "", floor: "", baseRate: "", maxGuests: "2", notes: "" };

export default function HotelSetupPage() {
  const params = useParams();
  const organizationId = params?.organizationId || "";
  const [properties, setProperties] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [propertyForm, setPropertyForm] = useState(EMPTY_PROPERTY);
  const [roomForm, setRoomForm] = useState(EMPTY_ROOM);
  const [legacyPropertyId, setLegacyPropertyId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(null);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState(null);

  const load = useCallback(async () => {
    if (!organizationId) return;
    setLoading(true); setError(null);
    try {
      const query = `?organizationId=${encodeURIComponent(organizationId)}`;
      const [propertiesResponse, roomsResponse] = await Promise.all([
        fetch(`/api/hotel/properties/list${query}`, { cache: "no-store", credentials: "include" }),
        fetch(`/api/hotel/rooms/list${query}`, { cache: "no-store", credentials: "include" }),
      ]);
      const [propertiesData, roomsData] = await Promise.all([propertiesResponse.json(), roomsResponse.json()]);
      if (!propertiesResponse.ok || propertiesData.success === false) throw new Error(propertiesData.error || "Unable to load hotel properties");
      if (!roomsResponse.ok || roomsData.success === false) throw new Error(roomsData.error || "Unable to load room inventory");
      const propertyList = propertiesData.properties || [];
      setProperties(propertyList);
      setRooms(roomsData.rooms || []);
      setRoomForm((current) => ({ ...current, propertyId: current.propertyId || propertyList[0]?.id || "" }));
      setLegacyPropertyId((current) => current || propertyList[0]?.id || "");
    } catch (loadError) {
      setError(loadError?.message || "Unable to load Hotel Setup");
    } finally { setLoading(false); }
  }, [organizationId]);

  useEffect(() => { load(); }, [load]);

  const propertyNames = useMemo(() => new Map(properties.map((property) => [String(property.id), property.name || "Property"])), [properties]);
  const unassignedRooms = useMemo(() => rooms.filter((room) => !room.property_id), [rooms]);

  async function createProperty() {
    if (!propertyForm.name.trim()) { setError("Property name is required"); return; }
    setSaving("property"); setError(null); setMessage(null);
    try {
      const response = await fetch("/api/hotel/properties/create", {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId, ...propertyForm }),
      });
      const result = await response.json();
      if (!response.ok || result.success === false) throw new Error(result.error || "Unable to create property");
      setPropertyForm(EMPTY_PROPERTY); setMessage("Property created."); await load();
    } catch (saveError) { setError(saveError?.message || "Unable to create property"); }
    finally { setSaving(null); }
  }

  async function createRoom() {
    if (!roomForm.propertyId || !roomForm.roomNumber.trim() || !roomForm.roomType.trim()) {
      setError("Property, room number and room type are required"); return;
    }
    setSaving("room"); setError(null); setMessage(null);
    try {
      const response = await fetch("/api/hotel/rooms/create", {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId, ...roomForm }),
      });
      const result = await response.json();
      if (!response.ok || result.success === false) throw new Error(result.error || "Unable to create room");
      setRoomForm((current) => ({ ...EMPTY_ROOM, propertyId: current.propertyId }));
      setMessage("Room added to governed property inventory."); await load();
    } catch (saveError) { setError(saveError?.message || "Unable to create room"); }
    finally { setSaving(null); }
  }

  async function bindLegacyRoom(roomId) {
    if (!legacyPropertyId) { setError("Choose a property for legacy room binding"); return; }
    setSaving(`bind:${roomId}`); setError(null); setMessage(null);
    try {
      const response = await fetch("/api/hotel/rooms/assign-property", {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId, roomId, propertyId: legacyPropertyId }),
      });
      const result = await response.json();
      if (!response.ok || result.success === false) throw new Error(result.error || "Unable to bind legacy room");
      setMessage(`Room ${result.room?.room_number || ""} bound to ${result.property?.name || "property"}. Existing room bookings were aligned to the same property.`);
      await load();
    } catch (saveError) { setError(saveError?.message || "Unable to bind legacy room"); }
    finally { setSaving(null); }
  }

  return (
    <HotelWorkspaceShell
      organizationId={organizationId}
      active="configuration"
      title="Hotel Setup"
      subtitle="Configure properties and room inventory inside the active organization. No hard-coded business context and no restaurant configuration leakage."
      actions={<HotelSecondaryAction onClick={load} disabled={loading}><RefreshCw size={9} className={loading ? "animate-spin" : ""} />Refresh</HotelSecondaryAction>}
    >
      <HotelError>{error}</HotelError><HotelSuccess>{message}</HotelSuccess>

      {unassignedRooms.length ? (
        <HotelSection eyebrow="Migration control" title={`${unassignedRooms.length} legacy room${unassignedRooms.length === 1 ? "" : "s"} need a property`} detail="Legacy inventory stays intact. Bind each unassigned room once; reassignment after that requires a controlled transfer instead of silently moving inventory.">
          <div className="grid gap-3 border-b border-black/[0.05] p-4 md:grid-cols-[minmax(220px,360px)_1fr] md:p-5">
            <HotelField label="Destination property"><select className={hotelInputClass} value={legacyPropertyId} onChange={(event) => setLegacyPropertyId(event.target.value)}><option value="">Select property</option>{properties.map((property) => <option key={property.id} value={property.id}>{property.name}</option>)}</select></HotelField>
            <div className="self-end text-[8px] leading-4 text-[#827B73]">Binding also backfills the property onto existing bookings for that room when the booking is still unassigned.</div>
          </div>
          <div className="divide-y divide-black/[0.05]">
            {unassignedRooms.map((room) => <div key={room.id} className="grid gap-2 px-4 py-3 md:grid-cols-[120px_minmax(170px,1fr)_140px_auto] md:items-center md:px-5"><div className="text-[9px] font-semibold text-[#403C37]">Room {room.room_number}</div><div className="text-[8px] text-[#716B63]">{room.room_type || "Room"}</div><HotelStatusPill value={room.status || "AVAILABLE"} /><HotelSecondaryAction disabled={!legacyPropertyId || Boolean(saving)} onClick={() => bindLegacyRoom(room.id)}>{saving === `bind:${room.id}` ? "Binding…" : "Bind room"}</HotelSecondaryAction></div>)}
          </div>
        </HotelSection>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-2">
        <HotelSection eyebrow="Property master" title="Add property" detail="Create the physical property boundary before room inventory is added.">
          <div className="grid gap-3 p-4 md:grid-cols-2">
            <HotelField label="Property name"><input className={hotelInputClass} value={propertyForm.name} onChange={(event) => setPropertyForm((current) => ({ ...current, name: event.target.value }))} /></HotelField>
            <HotelField label="City"><input className={hotelInputClass} value={propertyForm.city} onChange={(event) => setPropertyForm((current) => ({ ...current, city: event.target.value }))} /></HotelField>
            <HotelField label="Address"><input className={hotelInputClass} value={propertyForm.address} onChange={(event) => setPropertyForm((current) => ({ ...current, address: event.target.value }))} /></HotelField>
            <HotelField label="Country"><input className={hotelInputClass} value={propertyForm.country} onChange={(event) => setPropertyForm((current) => ({ ...current, country: event.target.value }))} /></HotelField>
            <div className="md:col-span-2"><HotelPrimaryAction onClick={createProperty} disabled={saving === "property"}>{saving === "property" ? "Creating…" : "Create property"}</HotelPrimaryAction></div>
          </div>
        </HotelSection>

        <HotelSection eyebrow="Room inventory" title="Add room" detail="Every new room is explicitly bound to a property and organization.">
          <div className="grid gap-3 p-4 md:grid-cols-2">
            <HotelField label="Property"><select className={hotelInputClass} value={roomForm.propertyId} onChange={(event) => setRoomForm((current) => ({ ...current, propertyId: event.target.value }))}><option value="">Select property</option>{properties.map((property) => <option key={property.id} value={property.id}>{property.name}</option>)}</select></HotelField>
            <HotelField label="Room number"><input className={hotelInputClass} value={roomForm.roomNumber} onChange={(event) => setRoomForm((current) => ({ ...current, roomNumber: event.target.value }))} /></HotelField>
            <HotelField label="Room type"><input className={hotelInputClass} value={roomForm.roomType} onChange={(event) => setRoomForm((current) => ({ ...current, roomType: event.target.value }))} placeholder="Deluxe King" /></HotelField>
            <HotelField label="Floor"><input className={hotelInputClass} value={roomForm.floor} onChange={(event) => setRoomForm((current) => ({ ...current, floor: event.target.value }))} /></HotelField>
            <HotelField label="Base rate"><input type="number" min="0" className={hotelInputClass} value={roomForm.baseRate} onChange={(event) => setRoomForm((current) => ({ ...current, baseRate: event.target.value }))} /></HotelField>
            <HotelField label="Max guests"><input type="number" min="1" className={hotelInputClass} value={roomForm.maxGuests} onChange={(event) => setRoomForm((current) => ({ ...current, maxGuests: event.target.value }))} /></HotelField>
            <div className="md:col-span-2"><HotelField label="Notes"><textarea className={hotelTextareaClass} value={roomForm.notes} onChange={(event) => setRoomForm((current) => ({ ...current, notes: event.target.value }))} /></HotelField></div>
            <div className="md:col-span-2"><HotelPrimaryAction onClick={createRoom} disabled={saving === "room"}>{saving === "room" ? "Adding…" : "Add room"}</HotelPrimaryAction></div>
          </div>
        </HotelSection>
      </div>

      <HotelSection eyebrow="Configured inventory" title="Rooms by property" detail={`${properties.length} properties · ${rooms.length} rooms`}>
        {loading ? <HotelEmptyState>Loading hotel inventory…</HotelEmptyState> : rooms.length ? (
          <div className="divide-y divide-black/[0.055]">
            <div className="hidden grid-cols-[120px_minmax(170px,1fr)_140px_100px_110px] gap-3 bg-[#FCFBF8] px-5 py-2 text-[7px] font-semibold uppercase tracking-[0.1em] text-[#969087] md:grid"><span>Room</span><span>Property</span><span>Type</span><span>Floor</span><span>Status</span></div>
            {rooms.map((room) => <div key={room.id} className="grid gap-2 px-4 py-3 md:grid-cols-[120px_minmax(170px,1fr)_140px_100px_110px] md:items-center md:gap-3 md:px-5"><div className="text-[9px] font-semibold text-[#403C37]">{room.room_number}</div><div className="text-[8px] text-[#716B63]">{propertyNames.get(String(room.property_id)) || "Unassigned property"}</div><div className="text-[8px] text-[#716B63]">{room.room_type || "Room"}</div><div className="text-[8px] text-[#716B63]">{room.floor || "—"}</div><HotelStatusPill value={room.status || "AVAILABLE"} /></div>)}
          </div>
        ) : <HotelEmptyState>No rooms configured yet.</HotelEmptyState>}
      </HotelSection>
    </HotelWorkspaceShell>
  );
}
