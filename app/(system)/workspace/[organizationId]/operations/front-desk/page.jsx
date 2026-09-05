"use client";

export const dynamic = "force-dynamic";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { CheckCircle2, LogIn, LogOut, RefreshCw } from "lucide-react";

import { useBusinessContext } from "@/app/providers/BusinessContextProvider";
import {
  HotelEmptyState,
  HotelError,
  HotelMetric,
  HotelPrimaryAction,
  HotelSecondaryAction,
  HotelSection,
  HotelStatusPill,
  HotelWorkspaceShell,
  hotelInputClass,
  hotelWorkspaceHref,
} from "@/components/workspace/hotel/HotelWorkspaceUI";

function dateValue(value) { return String(value || "").slice(0, 10); }
function guestName(booking) { return booking?.hotel_guests?.full_name || [booking?.hotel_guests?.first_name, booking?.hotel_guests?.last_name].filter(Boolean).join(" ") || "Guest"; }
function status(value) { return String(value || "").trim().toUpperCase(); }

function firstReadinessCode(booking) {
  return booking?.arrival_readiness?.blockers?.[0]?.code || booking?.arrival_readiness?.attention?.[0]?.code || null;
}

function roomTurnoverDetail(booking) {
  if (firstReadinessCode(booking) !== "ROOM_NOT_AVAILABLE") return null;
  const roomStatus = status(booking?.hotel_rooms?.status);
  const taskStatus = status(booking?.room_turnover?.task_status);
  if (roomStatus === "CLEAN" && taskStatus === "AWAITING_INSPECTION") return "Room is cleaned. QC inspection is the final release step before check-in.";
  if (roomStatus === "CLEANING" || taskStatus === "IN_PROGRESS") return "Housekeeping is actively turning this room; it is not yet guest-ready.";
  if (roomStatus === "DIRTY" || taskStatus === "PENDING") return "Room is waiting for housekeeping before it can be released to the guest.";
  return null;
}

function readinessDetail(booking) {
  const readiness = booking?.arrival_readiness || null;
  if (!readiness) return "Arrival readiness unavailable";
  const turnoverDetail = roomTurnoverDetail(booking);
  if (turnoverDetail) return turnoverDetail;
  if (readiness.blockers?.length) return readiness.blockers[0].detail || readiness.blockers[0].label;
  if (readiness.attention?.length) return readiness.attention[0].detail || readiness.attention[0].label;
  return "Room, guest and required deposit are ready";
}

function bookingWorkHref(organizationId, route, booking) {
  const base = hotelWorkspaceHref(organizationId, route);
  const query = new URLSearchParams({ bookingId: String(booking?.id || "") });
  if (booking?.property_id) query.set("propertyId", String(booking.property_id));
  return `${base}?${query.toString()}`;
}

async function hotelApi(url, options = {}) {
  const response = await fetch(url, { cache: "no-store", credentials: "include", ...options });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result.success === false) throw new Error(result.error || "Hotel operation failed");
  return result;
}

export default function OperationsFrontDeskPage() {
  const params = useParams();
  const businessContext = useBusinessContext() || {};
  const organization = businessContext.organization || null;
  const organizationId = params?.organizationId || businessContext.organization_id || organization?.id || null;
  const [bookings, setBookings] = useState([]);
  const [filter, setFilter] = useState("ARRIVALS");
  const [loading, setLoading] = useState(true);
  const [transitioningId, setTransitioningId] = useState(null);
  const [resolvingId, setResolvingId] = useState(null);
  const [error, setError] = useState(null);
  const [resolver, setResolver] = useState({ bookingId: null, loading: false, busy: false, rooms: [], roomId: "", arrivalLink: "", error: "" });

  const loadBookings = useCallback(async () => {
    if (!organizationId) return;
    setLoading(true); setError(null);
    try {
      const result = await hotelApi(`/api/hotel/bookings/list?organizationId=${encodeURIComponent(organizationId)}`);
      setBookings(result.bookings || []);
    } catch (loadError) {
      setError(loadError?.message || "Unable to load Front Desk");
    } finally { setLoading(false); }
  }, [organizationId]);

  useEffect(() => { loadBookings(); }, [loadBookings]);

  const today = new Date().toISOString().slice(0, 10);
  const queues = useMemo(() => {
    const arrivals = bookings.filter((booking) => status(booking.status) === "RESERVED" && dateValue(booking.check_in_date) <= today);
    const inHouse = bookings.filter((booking) => status(booking.status) === "CHECKED_IN");
    const departures = inHouse.filter((booking) => dateValue(booking.check_out_date) <= today);
    return { ARRIVALS: arrivals, IN_HOUSE: inHouse, DEPARTURES: departures };
  }, [bookings, today]);
  const filteredBookings = queues[filter] || [];
  const arrivalSummary = useMemo(() => ({
    ready: queues.ARRIVALS.filter((booking) => booking?.arrival_readiness?.state === "READY").length,
    attention: queues.ARRIVALS.filter((booking) => booking?.arrival_readiness?.state === "NEEDS_ACTION").length,
    blocked: queues.ARRIVALS.filter((booking) => booking?.arrival_readiness?.state === "BLOCKED").length,
  }), [queues.ARRIVALS]);

  async function transitionBooking(booking, action) {
    if (!organizationId || !booking?.id) return;
    if (action === "CHECK_IN" && booking?.arrival_readiness?.can_check_in === false) return;
    setTransitioningId(booking.id); setError(null);
    try {
      await hotelApi(action === "CHECK_IN" ? "/api/hotel/bookings/check-in" : "/api/hotel/bookings/check-out", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ organizationId, bookingId: booking.id }),
      });
      await loadBookings();
    } catch (transitionError) { setError(transitionError?.message || "Front Desk transition failed"); }
    finally { setTransitioningId(null); }
  }

  async function inspectRoomForArrival(booking) {
    const taskId = booking?.room_turnover?.id;
    if (!organizationId || !booking?.id || !taskId) return;
    setResolvingId(booking.id); setError(null);
    try {
      await hotelApi("/api/hotel/housekeeping/update", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ organizationId, taskId, action: "INSPECT" }),
      });
      await loadBookings();
    } catch (reason) { setError(reason?.message || "Room inspection failed"); }
    finally { setResolvingId(null); }
  }

  async function openRoomResolver(booking) {
    if (!organizationId || !booking?.id) return;
    if (resolver.bookingId === booking.id && !resolver.loading) {
      setResolver({ bookingId: null, loading: false, busy: false, rooms: [], roomId: "", arrivalLink: "", error: "" }); return;
    }
    setResolver({ bookingId: booking.id, loading: true, busy: false, rooms: [], roomId: "", arrivalLink: "", error: "" });
    try {
      const query = new URLSearchParams({ organizationId: String(organizationId), bookingId: String(booking.id) });
      if (booking.property_id) query.set("propertyId", String(booking.property_id));
      const result = await hotelApi(`/api/hotel/stays?${query.toString()}`);
      const rooms = (result.rooms || []).filter((room) => status(room.status) === "AVAILABLE" && room.id !== booking.room_id);
      setResolver({ bookingId: booking.id, loading: false, busy: false, rooms, roomId: rooms[0]?.id || "", arrivalLink: "", error: "" });
    } catch (reason) {
      setResolver({ bookingId: booking.id, loading: false, busy: false, rooms: [], roomId: "", arrivalLink: "", error: reason.message || "Unable to load ready rooms" });
    }
  }

  async function assignReadyRoom(booking) {
    if (!organizationId || !booking?.id || !resolver.roomId) return;
    setResolver((current) => ({ ...current, busy: true, error: "" }));
    try {
      await hotelApi("/api/hotel/stays", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ organizationId, bookingId: booking.id, action: booking.room_id ? "MOVE_ROOM" : "ASSIGN_ROOM", roomId: resolver.roomId, reason: "Front Desk arrival readiness resolution" }) });
      setResolver({ bookingId: null, loading: false, busy: false, rooms: [], roomId: "", arrivalLink: "", error: "" });
      await loadBookings();
    } catch (reason) { setResolver((current) => ({ ...current, busy: false, error: reason.message || "Unable to assign room" })); }
  }

  async function createArrivalLink(booking) {
    if (!organizationId || !booking?.id) return;
    setResolver({ bookingId: booking.id, loading: false, busy: true, rooms: [], roomId: "", arrivalLink: "", error: "" });
    try {
      const result = await hotelApi("/api/hotel/stays", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ organizationId, bookingId: booking.id, action: "CREATE_PRE_ARRIVAL" }) });
      const arrivalLink = result?.token ? `${window.location.origin}/hotel-arrival/${result.token}` : "";
      if (!arrivalLink) throw new Error("Arrival link was not returned");
      setResolver({ bookingId: booking.id, loading: false, busy: false, rooms: [], roomId: "", arrivalLink, error: "" });
    } catch (reason) { setResolver({ bookingId: booking.id, loading: false, busy: false, rooms: [], roomId: "", arrivalLink: "", error: reason.message || "Unable to prepare guest arrival" }); }
  }

  function blockedAction(booking) {
    const code = firstReadinessCode(booking);
    const inspectable = code === "ROOM_NOT_AVAILABLE" && status(booking?.hotel_rooms?.status) === "CLEAN" && status(booking?.room_turnover?.task_status) === "AWAITING_INSPECTION";
    if (inspectable) return <><HotelPrimaryAction onClick={() => inspectRoomForArrival(booking)} disabled={resolvingId === booking.id}><CheckCircle2 size={9} />{resolvingId === booking.id ? "Releasing" : "Inspect room"}</HotelPrimaryAction><HotelSecondaryAction onClick={() => openRoomResolver(booking)}>Choose another</HotelSecondaryAction></>;
    if (["ROOM_UNASSIGNED", "ROOM_NOT_FOUND", "ROOM_NOT_AVAILABLE"].includes(code)) return <><HotelSecondaryAction onClick={() => openRoomResolver(booking)}>Choose room</HotelSecondaryAction>{booking?.room_turnover ? <HotelSecondaryAction href={hotelWorkspaceHref(organizationId, "housekeeping")}>Housekeeping</HotelSecondaryAction> : null}</>;
    if (code === "DEPOSIT_OUTSTANDING") return <HotelSecondaryAction href={bookingWorkHref(organizationId, "hotel-payments", booking)}>Collect deposit</HotelSecondaryAction>;
    return <HotelSecondaryAction href={bookingWorkHref(organizationId, "stay-control", booking)}>Open stay</HotelSecondaryAction>;
  }

  function attentionAction(booking) {
    const codes = new Set((booking?.arrival_readiness?.attention || []).map((item) => item.code));
    if (codes.has("REGISTRATION_INCOMPLETE")) return <HotelSecondaryAction onClick={() => createArrivalLink(booking)}>Prepare arrival</HotelSecondaryAction>;
    return <HotelSecondaryAction href={bookingWorkHref(organizationId, "stay-control", booking)}>Review arrival</HotelSecondaryAction>;
  }

  return (
    <HotelWorkspaceShell organizationId={organizationId} active="front-desk" title="Front Desk" subtitle="Work the exception, not the menu. Arrival blockers show the live room-turnover stage and the safest resolution from the same desk queue; server transitions remain the final authority." context={organization?.name || "Property"} actions={<><HotelPrimaryAction href={hotelWorkspaceHref(organizationId, "reservations")}>New / manage reservation</HotelPrimaryAction><HotelSecondaryAction onClick={loadBookings} disabled={loading}><RefreshCw size={9} className={loading ? "animate-spin" : ""} />Refresh</HotelSecondaryAction></>}>
      <HotelError>{error}</HotelError>
      <section className="grid grid-cols-3 gap-3">
        <button type="button" onClick={() => setFilter("ARRIVALS")} className="text-left"><HotelMetric label="Arrivals" value={queues.ARRIVALS.length} detail={`${arrivalSummary.ready} ready · ${arrivalSummary.attention} attention · ${arrivalSummary.blocked} blocked`} attention={filter === "ARRIVALS" && (arrivalSummary.attention + arrivalSummary.blocked) > 0} /></button>
        <button type="button" onClick={() => setFilter("IN_HOUSE")} className="text-left"><HotelMetric label="In house" value={queues.IN_HOUSE.length} detail="Active guest stays" attention={false} /></button>
        <button type="button" onClick={() => setFilter("DEPARTURES")} className="text-left"><HotelMetric label="Departures" value={queues.DEPARTURES.length} detail="Due for closeout" attention={filter === "DEPARTURES" && queues.DEPARTURES.length > 0} /></button>
      </section>
      <HotelSection eyebrow="Live desk queue" title={filter === "ARRIVALS" ? "Arrivals requiring a desk move" : filter === "DEPARTURES" ? "Departures requiring closeout" : "Guests currently in house"} detail={filter === "ARRIVALS" ? "Resolve the exact blocker here. A cleaned room can be inspected and released without leaving the desk; cleaning rooms can be swapped to an already-ready alternative." : "Open the guest action directly. No separate dashboard step is required."}>
        {loading ? <HotelEmptyState>Loading Front Desk…</HotelEmptyState> : filteredBookings.length ? <div className="divide-y divide-black/[0.055]">
          <div className="hidden grid-cols-[minmax(190px,1.15fr)_130px_130px_105px_minmax(180px,0.95fr)_170px] gap-3 bg-[#FCFBF8] px-5 py-2 text-[7px] font-semibold uppercase tracking-[0.1em] text-[#969087] md:grid"><span>Guest / room</span><span>Arrival</span><span>Departure</span><span>Status</span><span>Readiness</span><span>Next move</span></div>
          {filteredBookings.map((booking) => {
            const bookingStatus = status(booking.status); const transitioning = transitioningId === booking.id; const readiness = booking?.arrival_readiness || null; const canCheckIn = bookingStatus === "RESERVED" && readiness?.can_check_in === true; const showResolver = resolver.bookingId === booking.id;
            return <div key={booking.id}>
              <div className="grid gap-2 px-4 py-3 md:grid-cols-[minmax(190px,1.15fr)_130px_130px_105px_minmax(180px,0.95fr)_170px] md:items-center md:gap-3 md:px-5">
                <div className="min-w-0"><div className="truncate text-[9px] font-semibold text-[#403C37]">{guestName(booking)}</div><div className="mt-0.5 text-[8px] text-[#918B83]">Room {booking.hotel_rooms?.room_number || "Unassigned"}{booking.hotel_rooms?.room_type ? ` · ${booking.hotel_rooms.room_type}` : ""}{booking.hotel_rooms?.status ? ` · ${booking.hotel_rooms.status}` : ""}</div></div>
                <div className="text-[8px] text-[#716B63]">{dateValue(booking.check_in_date) || "—"}</div><div className="text-[8px] text-[#716B63]">{dateValue(booking.check_out_date) || "—"}</div><HotelStatusPill value={bookingStatus} />
                <div className="min-w-0">{bookingStatus === "RESERVED" ? <><HotelStatusPill value={readiness?.state || "BLOCKED"} /><div className="mt-1 text-[7px] leading-3 text-[#918B83]">{readinessDetail(booking)}</div>{booking?.room_turnover ? <div className="mt-0.5 text-[7px] font-semibold text-[#8A633C]">Housekeeping · {String(booking.room_turnover.task_status || "").replaceAll("_", " ")}</div> : null}{(readiness?.blockers?.length || 0) + (readiness?.attention?.length || 0) > 1 ? <div className="mt-0.5 text-[7px] font-semibold text-[#8A633C]">+{(readiness?.blockers?.length || 0) + (readiness?.attention?.length || 0) - 1} more item(s)</div> : null}</> : <span className="text-[8px] text-[#918B83]">—</span>}</div>
                <div className="flex flex-wrap gap-1.5">{bookingStatus === "RESERVED" ? (canCheckIn ? <><HotelPrimaryAction onClick={() => transitionBooking(booking, "CHECK_IN")} disabled={transitioning}><LogIn size={9} />{transitioning ? "Checking in" : "Check in"}</HotelPrimaryAction>{readiness?.state === "NEEDS_ACTION" ? attentionAction(booking) : null}</> : blockedAction(booking)) : bookingStatus === "CHECKED_IN" ? <HotelSecondaryAction onClick={() => transitionBooking(booking, "CHECK_OUT")} disabled={transitioning}><LogOut size={9} />{transitioning ? "Checking out" : "Check out"}</HotelSecondaryAction> : <span className="text-[8px] text-[#918B83]">No desk action</span>}</div>
              </div>
              {showResolver ? <div className="border-t border-black/[0.05] bg-[#FBFAF7] px-4 py-3 md:px-5">{resolver.loading ? <div className="text-[8px] text-[#918B83]">Finding governed-ready rooms…</div> : resolver.arrivalLink ? <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between"><div><div className="text-[8px] font-semibold text-[#403C37]">Secure arrival link ready</div><div className="mt-0.5 break-all text-[7px] text-[#918B83]">{resolver.arrivalLink}</div></div><div className="flex gap-2"><HotelSecondaryAction onClick={() => navigator.clipboard?.writeText(resolver.arrivalLink)}>Copy link</HotelSecondaryAction><HotelSecondaryAction href={bookingWorkHref(organizationId, "stay-control", booking)}>Open stay</HotelSecondaryAction></div></div> : resolver.rooms.length ? <div className="grid gap-2 md:grid-cols-[minmax(260px,420px)_auto_1fr] md:items-end"><label><span className="text-[7px] font-semibold uppercase tracking-[0.1em] text-[#8D877F]">Governed-ready alternative</span><select className={`${hotelInputClass} mt-1.5`} value={resolver.roomId} onChange={(event) => setResolver((current) => ({ ...current, roomId: event.target.value }))}>{resolver.rooms.map((room) => <option key={room.id} value={room.id}>Room {room.room_number} · {room.room_type || "Room"}</option>)}</select></label><HotelPrimaryAction disabled={resolver.busy || !resolver.roomId} onClick={() => assignReadyRoom(booking)}>{resolver.busy ? "Assigning…" : booking.room_id ? "Move & resolve" : "Assign & resolve"}</HotelPrimaryAction><div className="text-[7px] leading-4 text-[#918B83]">The stay API re-checks property scope and AVAILABLE state. A stale browser choice cannot force a room move.</div></div> : <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between"><div><div className="text-[8px] font-semibold text-[#403C37]">No alternate room is ready</div><div className="mt-0.5 text-[7px] text-[#918B83]">Keep the arrival blocked and work the assigned room through Housekeeping.</div></div><div className="flex gap-2"><HotelSecondaryAction href={hotelWorkspaceHref(organizationId, "housekeeping")}>Open Housekeeping</HotelSecondaryAction><HotelSecondaryAction href={bookingWorkHref(organizationId, "stay-control", booking)}>Open stay</HotelSecondaryAction></div></div>}{resolver.error ? <div className="mt-2 text-[8px] text-red-800">{resolver.error}</div> : null}</div> : null}
            </div>;
          })}
        </div> : <HotelEmptyState>No bookings in this Front Desk queue.</HotelEmptyState>}
      </HotelSection>
    </HotelWorkspaceShell>
  );
}
