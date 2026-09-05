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
  hotelTextareaClass,
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

function overlaps(booking, group) {
  if (!group) return false;
  if (group.arrival_date && booking.check_out_date <= group.arrival_date) return false;
  if (group.departure_date && booking.check_in_date >= group.departure_date) return false;
  return true;
}

export default function HotelGroupReservationsPage() {
  const params = useParams();
  const organizationId = String(params?.organizationId || "");
  const [properties, setProperties] = useState([]);
  const [propertyId, setPropertyId] = useState("");
  const [payload, setPayload] = useState({ groups: [], blocks: [], bookings: [], rooms: [], guests: [], ratePlans: [] });
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [groupForm, setGroupForm] = useState({ name: "", groupCode: "", arrivalDate: "", departureDate: "", cutoffDate: "", status: "PROSPECT", blockMode: "DEDUCT", ratePlanId: "", notes: "" });
  const [blockForm, setBlockForm] = useState({ roomType: "", from: "", to: "", allocatedRooms: "1", negotiatedRate: "", deductInventory: true });
  const [status, setStatus] = useState("PROSPECT");

  useEffect(() => {
    let active = true;
    api(`/api/hotel/properties/list?organizationId=${encodeURIComponent(organizationId)}`)
      .then((data) => {
        if (!active) return;
        const list = data.properties || [];
        setProperties(list);
        setPropertyId((current) => current || list[0]?.id || "");
      })
      .catch((reason) => active && setError(reason.message));
    return () => { active = false; };
  }, [organizationId]);

  const load = useCallback(async () => {
    if (!propertyId) { setLoading(false); return; }
    setLoading(true); setError("");
    try {
      const data = await api(`/api/hotel/groups?organizationId=${encodeURIComponent(organizationId)}&propertyId=${encodeURIComponent(propertyId)}`);
      setPayload(data);
      setSelectedId((current) => current && data.groups?.some((group) => group.id === current) ? current : data.groups?.[0]?.id || "");
    } catch (reason) {
      setError(reason.message);
    } finally {
      setLoading(false);
    }
  }, [organizationId, propertyId]);

  useEffect(() => { load(); }, [load]);

  const selected = payload.groups?.find((group) => group.id === selectedId) || null;
  const guestById = useMemo(() => new Map((payload.guests || []).map((guest) => [guest.id, guest])), [payload.guests]);
  const roomById = useMemo(() => new Map((payload.rooms || []).map((room) => [room.id, room])), [payload.rooms]);
  const roomTypes = useMemo(() => [...new Set((payload.rooms || []).map((room) => room.room_type).filter(Boolean))].sort(), [payload.rooms]);
  const groupBlocks = selected ? (payload.blocks || []).filter((block) => block.group_id === selected.id) : [];
  const groupBookings = selected ? (payload.bookings || []).filter((booking) => booking.group_id === selected.id) : [];
  const eligibleBookings = selected ? (payload.bookings || []).filter((booking) => !booking.group_id && ["RESERVED", "CHECKED_IN"].includes(booking.status) && overlaps(booking, selected)) : [];

  const totalAllocatedNights = groupBlocks.filter((block) => block.status === "ACTIVE").reduce((sum, block) => sum + Number(block.allocated_rooms || 0), 0);
  const pickedNights = groupBlocks.filter((block) => block.status === "ACTIVE").reduce((sum, block) => sum + Number(block.picked_up || 0), 0);
  const remainingNights = Math.max(0, totalAllocatedNights - pickedNights);
  const peakByDate = useMemo(() => {
    const values = new Map();
    for (const block of groupBlocks.filter((item) => item.status === "ACTIVE")) values.set(block.stay_date, (values.get(block.stay_date) || 0) + Number(block.allocated_rooms || 0));
    return Math.max(0, ...values.values());
  }, [groupBlocks]);

  useEffect(() => {
    if (!selected) return;
    setStatus(selected.status || "PROSPECT");
    setBlockForm((current) => ({
      ...current,
      roomType: current.roomType || roomTypes[0] || "",
      from: selected.arrival_date || current.from,
      to: selected.departure_date || current.to,
      deductInventory: String(selected.block_mode || "DEDUCT").toUpperCase() === "DEDUCT",
    }));
  }, [selected?.id, selected?.arrival_date, selected?.departure_date, selected?.block_mode, selected?.status, roomTypes]);

  async function post(body) {
    setSaving(true); setError(""); setSuccess("");
    try {
      const result = await api("/api/hotel/groups", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ organizationId, propertyId, ...body }) });
      await load();
      return result;
    } catch (reason) {
      setError(reason.message);
      return null;
    } finally {
      setSaving(false);
    }
  }

  async function createGroup() {
    if (!groupForm.name.trim()) { setError("Group name is required."); return; }
    const result = await post({ action: "CREATE", ...groupForm });
    if (result?.group) {
      setSelectedId(result.group.id);
      setGroupForm({ name: "", groupCode: "", arrivalDate: "", departureDate: "", cutoffDate: "", status: "PROSPECT", blockMode: "DEDUCT", ratePlanId: "", notes: "" });
      setSuccess(`${result.group.name} created. Add room allocations by type and date next.`);
    }
  }

  async function saveBlock() {
    if (!selected) return;
    const result = await post({ action: "UPSERT_BLOCK_RANGE", groupId: selected.id, ...blockForm, allocatedRooms: Number(blockForm.allocatedRooms || 0), negotiatedRate: blockForm.negotiatedRate === "" ? null : Number(blockForm.negotiatedRate) });
    if (result) setSuccess(`${result.days} group night${result.days === 1 ? "" : "s"} updated against ${result.physicalInventory} physical ${blockForm.roomType} room${result.physicalInventory === 1 ? "" : "s"}.`);
  }

  async function changeStatus() {
    if (!selected) return;
    const result = await post({ action: "UPDATE_STATUS", groupId: selected.id, status });
    if (result?.group) setSuccess(`${result.group.name} moved to ${result.group.status}.`);
  }

  async function linkBooking(bookingId) {
    if (!selected) return;
    const result = await post({ action: "LINK_BOOKING", groupId: selected.id, bookingId });
    if (result?.booking) setSuccess("Reservation linked to the group and now counts toward pickup.");
  }

  return (
    <HotelWorkspaceShell
      organizationId={organizationId}
      active="groups"
      eyebrow="Group business"
      title="Groups & Allotments"
      subtitle="Manage group profiles, negotiated room blocks, pickup and reservation linkage without flattening group business into ordinary transient bookings."
      context={properties.find((property) => property.id === propertyId)?.name || "Choose property"}
    >
      <HotelError>{error}</HotelError><HotelSuccess>{success}</HotelSuccess>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <HotelMetric label="Open groups" value={(payload.groups || []).filter((group) => ["PROSPECT", "TENTATIVE", "CONFIRMED", "IN_HOUSE"].includes(group.status)).length} detail="Commercial group records in progress" />
        <HotelMetric label="Allocated room nights" value={totalAllocatedNights} detail={selected ? selected.name : "Select a group"} />
        <HotelMetric label="Picked up" value={pickedNights} detail={`${remainingNights} allocated room nights remain`} attention={selected && totalAllocatedNights > 0 && pickedNights === 0} />
        <HotelMetric label="Peak rooms held" value={peakByDate} detail={`${groupBookings.length} linked reservation${groupBookings.length === 1 ? "" : "s"}`} />
      </div>

      <HotelSection eyebrow="Property" title="Group business scope">
        <div className="p-4 md:max-w-sm md:p-5"><HotelField label="Property"><select className={hotelInputClass} value={propertyId} onChange={(event) => { setPropertyId(event.target.value); setSelectedId(""); }}><option value="">Choose property</option>{properties.map((property) => <option key={property.id} value={property.id}>{property.name}</option>)}</select></HotelField></div>
      </HotelSection>

      <div className="grid gap-4 xl:grid-cols-[minmax(340px,0.65fr)_minmax(0,1.35fr)]">
        <div className="space-y-4">
          <HotelSection eyebrow="Create" title="New group profile" detail="Start commercial control before allocating inventory.">
            <div className="grid gap-3 p-4 sm:grid-cols-2 md:p-5">
              <div className="sm:col-span-2"><HotelField label="Group name"><input className={hotelInputClass} value={groupForm.name} onChange={(e) => setGroupForm((current) => ({ ...current, name: e.target.value }))} placeholder="Smith Wedding · Tour Series 14" /></HotelField></div>
              <HotelField label="Group code"><input className={hotelInputClass} value={groupForm.groupCode} onChange={(e) => setGroupForm((current) => ({ ...current, groupCode: e.target.value }))} placeholder="SW-SEP26" /></HotelField>
              <HotelField label="Status"><select className={hotelInputClass} value={groupForm.status} onChange={(e) => setGroupForm((current) => ({ ...current, status: e.target.value }))}><option>PROSPECT</option><option>TENTATIVE</option><option>CONFIRMED</option></select></HotelField>
              <HotelField label="Arrival"><input type="date" className={hotelInputClass} value={groupForm.arrivalDate} onChange={(e) => setGroupForm((current) => ({ ...current, arrivalDate: e.target.value }))} /></HotelField>
              <HotelField label="Departure"><input type="date" className={hotelInputClass} value={groupForm.departureDate} onChange={(e) => setGroupForm((current) => ({ ...current, departureDate: e.target.value }))} /></HotelField>
              <HotelField label="Cutoff / release date"><input type="date" className={hotelInputClass} value={groupForm.cutoffDate} onChange={(e) => setGroupForm((current) => ({ ...current, cutoffDate: e.target.value }))} /></HotelField>
              <HotelField label="Inventory behavior"><select className={hotelInputClass} value={groupForm.blockMode} onChange={(e) => setGroupForm((current) => ({ ...current, blockMode: e.target.value }))}><option value="DEDUCT">Deduct from sellable inventory</option><option value="NON_DEDUCT">Rate/allotment only</option></select></HotelField>
              <div className="sm:col-span-2"><HotelField label="Negotiated rate plan"><select className={hotelInputClass} value={groupForm.ratePlanId} onChange={(e) => setGroupForm((current) => ({ ...current, ratePlanId: e.target.value }))}><option value="">No linked plan</option>{(payload.ratePlans || []).map((plan) => <option key={plan.id} value={plan.id}>{plan.name}</option>)}</select></HotelField></div>
              <div className="sm:col-span-2"><HotelField label="Commercial / operational notes"><textarea className={hotelTextareaClass} value={groupForm.notes} onChange={(e) => setGroupForm((current) => ({ ...current, notes: e.target.value }))} /></HotelField></div>
              <div className="sm:col-span-2"><HotelPrimaryAction disabled={saving || !propertyId || !groupForm.name.trim()} onClick={createGroup}>{saving ? "Saving…" : "Create group"}</HotelPrimaryAction></div>
            </div>
          </HotelSection>

          <HotelSection eyebrow="Group queue" title="Profiles" detail={`${payload.groups?.length || 0} group records in this property`}>
            {!payload.groups?.length ? <HotelEmptyState>{loading ? "Loading groups…" : "No groups yet."}</HotelEmptyState> : <div className="max-h-[520px] divide-y divide-black/[0.05] overflow-y-auto">{payload.groups.map((group) => <button key={group.id} onClick={() => setSelectedId(group.id)} className={`grid w-full grid-cols-[1fr_auto] gap-2 px-4 py-3 text-left md:px-5 ${selectedId === group.id ? "bg-[#FBF8F3]" : "hover:bg-[#FAF9F6]"}`}><div><div className="text-[9px] font-semibold text-[#3E3934]">{group.name}</div><div className="mt-0.5 text-[7px] text-[#918B83]">{group.group_code || "No code"} · {group.arrival_date || "—"} → {group.departure_date || "—"}</div></div><HotelStatusPill value={group.status} tone={["CONFIRMED", "IN_HOUSE", "COMPLETED"].includes(group.status) ? "good" : ["CANCELLED", "LOST"].includes(group.status) ? "critical" : "warning"} /></button>)}</div>}
          </HotelSection>
        </div>

        {!selected ? <HotelSection title="Group control"><HotelEmptyState>Select or create a group.</HotelEmptyState></HotelSection> : <div className="space-y-4">
          <HotelSection eyebrow="Control" title={selected.name} detail={`${selected.group_code || "No group code"} · ${selected.arrival_date || "—"} → ${selected.departure_date || "—"} · cutoff ${selected.cutoff_date || "not set"}`} action={<HotelStatusPill value={selected.status} />}>
            <div className="flex flex-wrap items-end gap-3 p-4 md:p-5"><div className="min-w-[190px]"><HotelField label="Group status"><select className={hotelInputClass} value={status} onChange={(e) => setStatus(e.target.value)}><option>PROSPECT</option><option>TENTATIVE</option><option>CONFIRMED</option><option>IN_HOUSE</option><option>COMPLETED</option><option>CANCELLED</option><option>LOST</option></select></HotelField></div><HotelPrimaryAction disabled={saving || status === selected.status} onClick={changeStatus}>Update status</HotelPrimaryAction><div className="text-[7px] leading-4 text-[#8A837B]">Cancelling or losing a group releases active group inventory automatically.</div></div>
          </HotelSection>

          <HotelSection eyebrow="Room block" title="Allocate by room type and stay date" detail="Deduct blocks are checked against physical inventory and other active group holds before they are accepted.">
            <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3 md:p-5">
              <HotelField label="Room type"><select className={hotelInputClass} value={blockForm.roomType} onChange={(e) => setBlockForm((current) => ({ ...current, roomType: e.target.value }))}><option value="">Choose room type</option>{roomTypes.map((type) => <option key={type} value={type}>{type}</option>)}</select></HotelField>
              <HotelField label="From"><input type="date" className={hotelInputClass} value={blockForm.from} onChange={(e) => setBlockForm((current) => ({ ...current, from: e.target.value }))} /></HotelField>
              <HotelField label="To"><input type="date" className={hotelInputClass} value={blockForm.to} onChange={(e) => setBlockForm((current) => ({ ...current, to: e.target.value }))} /></HotelField>
              <HotelField label="Rooms per night"><input type="number" min="0" className={hotelInputClass} value={blockForm.allocatedRooms} onChange={(e) => setBlockForm((current) => ({ ...current, allocatedRooms: e.target.value }))} /></HotelField>
              <HotelField label="Negotiated nightly rate"><input type="number" min="0" className={hotelInputClass} value={blockForm.negotiatedRate} onChange={(e) => setBlockForm((current) => ({ ...current, negotiatedRate: e.target.value }))} placeholder="Optional" /></HotelField>
              <HotelField label="Inventory"><label className="flex h-9 items-center gap-2 rounded-lg border border-black/[0.08] bg-[#FBFAF7] px-3 text-[8px] font-medium text-[#625C55]"><input type="checkbox" checked={blockForm.deductInventory} onChange={(e) => setBlockForm((current) => ({ ...current, deductInventory: e.target.checked }))} />Deduct from house availability</label></HotelField>
              <div className="sm:col-span-2 lg:col-span-3"><HotelPrimaryAction disabled={saving || !blockForm.roomType || !blockForm.from || !blockForm.to} onClick={saveBlock}>Apply room block</HotelPrimaryAction></div>
            </div>
            {!groupBlocks.length ? <HotelEmptyState>No room allocations yet.</HotelEmptyState> : <div className="overflow-x-auto border-t border-black/[0.05]"><table className="w-full min-w-[760px] border-collapse text-left text-[8px]"><thead className="bg-[#FAF9F6] text-[7px] uppercase tracking-[0.08em] text-[#918B83]"><tr><th className="px-4 py-2.5">Stay date</th><th className="px-3">Room type</th><th className="px-3">Held</th><th className="px-3">Pickup</th><th className="px-3">Remaining</th><th className="px-3">Rate</th><th className="px-3">Mode</th></tr></thead><tbody className="divide-y divide-black/[0.05]">{groupBlocks.map((block) => <tr key={block.id}><td className="px-4 py-2.5 font-medium">{block.stay_date}</td><td className="px-3">{block.room_type}</td><td className="px-3 tabular-nums">{block.allocated_rooms}</td><td className="px-3 tabular-nums">{block.picked_up}</td><td className="px-3 tabular-nums">{block.remaining}</td><td className="px-3">{block.negotiated_rate == null ? "—" : money(block.negotiated_rate, block.currency_code)}</td><td className="px-3"><HotelStatusPill value={block.status === "RELEASED" ? "RELEASED" : block.deduct_inventory ? "DEDUCT" : "NON-DEDUCT"} tone={block.status === "RELEASED" ? "neutral" : "good"} /></td></tr>)}</tbody></table></div>}
          </HotelSection>

          <div className="grid gap-4 lg:grid-cols-2">
            <HotelSection eyebrow="Pickup" title="Linked reservations" detail="Each linked stay contributes to room-block pickup by room type and occupied night.">
              {!groupBookings.length ? <HotelEmptyState>No reservations linked yet.</HotelEmptyState> : <div className="divide-y divide-black/[0.05]">{groupBookings.map((booking) => { const guest = guestById.get(booking.guest_id); const room = roomById.get(booking.room_id); return <div key={booking.id} className="grid grid-cols-[1fr_auto] gap-2 px-4 py-3 md:px-5"><div><div className="text-[8px] font-semibold">{guest?.full_name || booking.booking_reference || "Group guest"}</div><div className="mt-0.5 text-[7px] text-[#928B83]">{booking.check_in_date} → {booking.check_out_date} · {room ? `Room ${room.room_number} · ${room.room_type}` : "Room pending"}</div></div><HotelStatusPill value={booking.status} /></div>; })}</div>}
            </HotelSection>

            <HotelSection eyebrow="Rooming list" title="Attach eligible reservations" detail="Reservations remain individual guest stays; the group profile adds block, pickup and commercial context.">
              {!eligibleBookings.length ? <HotelEmptyState>No ungrouped reservations overlap this group window.</HotelEmptyState> : <div className="divide-y divide-black/[0.05]">{eligibleBookings.slice(0, 50).map((booking) => { const guest = guestById.get(booking.guest_id); const room = roomById.get(booking.room_id); return <div key={booking.id} className="grid grid-cols-[1fr_auto] items-center gap-2 px-4 py-3 md:px-5"><div><div className="text-[8px] font-semibold">{guest?.full_name || booking.booking_reference || "Reservation"}</div><div className="mt-0.5 text-[7px] text-[#928B83]">{booking.check_in_date} → {booking.check_out_date} · {room ? `${room.room_type} · Room ${room.room_number}` : "Room pending"}</div></div><HotelSecondaryAction disabled={saving} onClick={() => linkBooking(booking.id)}>Add to group</HotelSecondaryAction></div>; })}</div>}
            </HotelSection>
          </div>
        </div>}
      </div>
    </HotelWorkspaceShell>
  );
}
