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
function money(value, currency = "THB") {
  try { return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 2 }).format(Number(value || 0)); }
  catch { return `${Number(value || 0).toFixed(2)} ${currency}`; }
}

function firstReadinessCode(booking) {
  return booking?.arrival_readiness?.blockers?.[0]?.code || booking?.arrival_readiness?.attention?.[0]?.code || null;
}

function firstDepartureCode(booking) {
  return booking?.departure_readiness?.blockers?.[0]?.code || booking?.departure_readiness?.attention?.[0]?.code || null;
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

function departureDetail(booking, today) {
  const readiness = booking?.departure_readiness || null;
  if (!readiness) return "Departure readiness unavailable";
  if (readiness.blockers?.length) return readiness.blockers[0].detail || readiness.blockers[0].label;
  if (readiness.attention?.length) return readiness.attention[0].detail || readiness.attention[0].label;
  if (dateValue(booking?.check_out_date) < today) return "Departure date has passed. Financial controls are clear; complete check-out and release the room.";
  return readiness.folio_status === "CLOSED" ? "Folio closed and settlement evidence is clear." : "No open folio or unsettled Hotel payment blocks departure.";
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
  const departureSummary = useMemo(() => ({
    ready: queues.DEPARTURES.filter((booking) => booking?.departure_readiness?.can_check_out === true).length,
    blocked: queues.DEPARTURES.filter((booking) => booking?.departure_readiness?.can_check_out !== true).length,
    overdue: queues.DEPARTURES.filter((booking) => dateValue(booking.check_out_date) < today).length,
  }), [queues.DEPARTURES, today]);

  async function transitionBooking(booking, action) {
    if (!organizationId || !booking?.id) return;
    if (action === "CHECK_IN" && booking?.arrival_readiness?.can_check_in === false) return;
    if (action === "CHECK_OUT" && booking?.departure_readiness?.can_check_out === false) return;
    setTransitioningId(booking.id); setError(null);
    try {
      await hotelApi(action === "CHECK_IN" ? "/api/hotel/bookings/check-in" : "/api/hotel/bookings/check-out", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ organizationId, bookingId: booking.id }),
      });
      await loadBookings();
    } catch (transitionError) { setError(transitionError?.message || "Front Desk transition failed"); }
    finally { setTransitioningId(null); }
  }

  async function closeDepartureFolio(booking) {
    if (!organizationId || !booking?.id) return;
    setResolvingId(booking.id); setError(null);
    try {
      await hotelApi("/api/hotel/stays", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ organizationId, bookingId: booking.id, action: "CLOSE_FOLIO" }),
      });
      await loadBookings();
    } catch (reason) { setError(reason?.message || "Unable to close guest folio"); }
    finally { setResolvingId(null); }
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

  function departureAction(booking) {
    const readiness = booking?.departure_readiness;
    const code = firstDepartureCode(booking);
    if (readiness?.can_check_out === true) {
      return <HotelPrimaryAction onClick={() => transitionBooking(booking, "CHECK_OUT")} disabled={transitioningId === booking.id}><LogOut size={9} />{transitioningId === booking.id ? "Checking out" : "Check out"}</HotelPrimaryAction>;
    }
    if (code === "FOLIO_OPEN_ZERO_BALANCE") {
      return <><HotelPrimaryAction onClick={() => closeDepartureFolio(booking)} disabled={resolvingId === booking.id}><CheckCircle2 size={9} />{resolvingId === booking.id ? "Closing" : "Close folio"}</HotelPrimaryAction><HotelSecondaryAction href={bookingWorkHref(organizationId, "stay-control", booking)}>Review folio</HotelSecondaryAction></>;
    }
    if (code === "FOLIO_BALANCE_OPEN") {
      return <><HotelSecondaryAction href={bookingWorkHref(organizationId, "hotel-payments", booking)}>Settle folio</HotelSecondaryAction><HotelSecondaryAction href={bookingWorkHref(organizationId, "stay-control", booking)}>Open stay</HotelSecondaryAction></>;
    }
    if (["PAYMENT_PENDING", "FINANCE_EVIDENCE_MISSING"].includes(code)) {
      return <HotelSecondaryAction href={bookingWorkHref(organizationId, "hotel-payments", booking)}>Review settlement</HotelSecondaryAction>;
    }
    return <HotelSecondaryAction href={bookingWorkHref(organizationId, "stay-control", booking)}>Review departure</HotelSecondaryAction>;
  }

  return (
    <HotelWorkspaceShell organizationId={organizationId} active="front-desk" title="Front Desk" subtitle="Work the exception, not the menu. Arrivals and departures expose the exact operational blocker and safest governed resolution before the final desk action." context={organization?.name || "Property"} actions={<><HotelPrimaryAction href={hotelWorkspaceHref(organizationId, "reservations")}>New / manage reservation</HotelPrimaryAction><HotelSecondaryAction onClick={loadBookings} disabled={loading}><RefreshCw size={9} className={loading ? "animate-spin" : ""} />Refresh</HotelSecondaryAction></>}>
      <HotelError>{error}</HotelError>
      <section className="grid grid-cols-3 gap-3">
        <button type="button" onClick={() => setFilter("ARRIVALS")} className="text-left"><HotelMetric label="Arrivals" value={queues.ARRIVALS.length} detail={`${arrivalSummary.ready} ready · ${arrivalSummary.attention} attention · ${arrivalSummary.blocked} blocked`} attention={filter === "ARRIVALS" && (arrivalSummary.attention + arrivalSummary.blocked) > 0} /></button>
        <button type="button" onClick={() => setFilter("IN_HOUSE")} className="text-left"><HotelMetric label="In house" value={queues.IN_HOUSE.length} detail="Active guest stays" attention={false} /></button>
        <button type="button" onClick={() => setFilter("DEPARTURES")} className="text-left"><HotelMetric label="Departures" value={queues.DEPARTURES.length} detail={`${departureSummary.ready} ready · ${departureSummary.blocked} blocked${departureSummary.overdue ? ` · ${departureSummary.overdue} overdue` : ""}`} attention={filter === "DEPARTURES" && (departureSummary.blocked + departureSummary.overdue) > 0} /></button>
      </section>
      <HotelSection eyebrow="Live desk queue" title={filter === "ARRIVALS" ? "Arrivals requiring a desk move" : filter === "DEPARTURES" ? "Departures requiring closeout" : "Guests currently in house"} detail={filter === "ARRIVALS" ? "Resolve the exact arrival blocker here. A cleaned room can be inspected and released without leaving the desk; cleaning rooms can be swapped to an already-ready alternative." : filter === "DEPARTURES" ? "Close a balanced folio inline, settle a real balance, resolve pending gateway / Finance evidence, then check out. The server re-reads the same evidence before releasing the room." : "Active stays remain connected to their exact departure readiness without forcing an early checkout."}>
        {loading ? <HotelEmptyState>Loading Front Desk…</HotelEmptyState> : filteredBookings.length ? <div className="divide-y divide-black/[0.055]">
          <div className="hidden grid-cols-[minmax(190px,1.15fr)_130px_130px_105px_minmax(200px,1fr)_180px] gap-3 bg-[#FCFBF8] px-5 py-2 text-[7px] font-semibold uppercase tracking-[0.1em] text-[#969087] md:grid"><span>Guest / room</span><span>Arrival</span><span>Departure</span><span>Status</span><span>Readiness</span><span>Next move</span></div>
          {filteredBookings.map((booking) => {
            const bookingStatus = status(booking.status);
            const transitioning = transitioningId === booking.id;
            const arrivalReadiness = booking?.arrival_readiness || null;
            const departureReadiness = booking?.departure_readiness || null;
            const canCheckIn = bookingStatus === "RESERVED" && arrivalReadiness?.can_check_in === true;
            const showResolver = resolver.bookingId === booking.id;
            const isOverdueDeparture = bookingStatus === "CHECKED_IN" && dateValue(booking.check_out_date) < today;
            return <div key={booking.id}>
              <div className="grid gap-2 px-4 py-3 md:grid-cols-[minmax(190px,1.15fr)_130px_130px_105px_minmax(200px,1fr)_180px] md:items-center md:gap-3 md:px-5">
                <div className="min-w-0"><div className="truncate text-[9px] font-semibold text-[#403C37]">{guestName(booking)}</div><div className="mt-0.5 text-[8px] text-[#918B83]">Room {booking.hotel_rooms?.room_number || "Unassigned"}{booking.hotel_rooms?.room_type ? ` · ${booking.hotel_rooms.room_type}` : ""}{booking.hotel_rooms?.status ? ` · ${booking.hotel_rooms.status}` : ""}</div></div>
                <div className="text-[8px] text-[#716B63]">{dateValue(booking.check_in_date) || "—"}</div>
                <div><div className="text-[8px] text-[#716B63]">{dateValue(booking.check_out_date) || "—"}</div>{isOverdueDeparture ? <div className="mt-0.5 text-[7px] font-semibold text-[#9A533D]">Date passed</div> : null}</div>
                <HotelStatusPill value={bookingStatus} />
                <div className="min-w-0">{bookingStatus === "RESERVED" ? <><HotelStatusPill value={arrivalReadiness?.state || "BLOCKED"} /><div className="mt-1 text-[7px] leading-3 text-[#918B83]">{readinessDetail(booking)}</div>{booking?.room_turnover ? <div className="mt-0.5 text-[7px] font-semibold text-[#8A633C]">Housekeeping · {String(booking.room_turnover.task_status || "").replaceAll("_", " ")}</div> : null}{(arrivalReadiness?.blockers?.length || 0) + (arrivalReadiness?.attention?.length || 0) > 1 ? <div className="mt-0.5 text-[7px] font-semibold text-[#8A633C]">+{(arrivalReadiness?.blockers?.length || 0) + (arrivalReadiness?.attention?.length || 0) - 1} more item(s)</div> : null}</> : bookingStatus === "CHECKED_IN" ? <><HotelStatusPill value={departureReadiness?.state || "BLOCKED"} /><div className="mt-1 text-[7px] leading-3 text-[#918B83]">{departureDetail(booking, today)}</div>{departureReadiness?.folio_status ? <div className="mt-0.5 text-[7px] font-semibold text-[#8A633C]">Folio {departureReadiness.folio_status} · {money(departureReadiness.folio_balance, departureReadiness.currency_code)}</div> : null}</> : <span className="text-[8px] text-[#918B83]">—</span>}</div>
                <div className="flex flex-wrap gap-1.5">{bookingStatus === "RESERVED" ? (canCheckIn ? <><HotelPrimaryAction onClick={() => transitionBooking(booking, "CHECK_IN")} disabled={transitioning}><LogIn size={9} />{transitioning ? "Checking in" : "Check in"}</HotelPrimaryAction>{arrivalReadiness?.state === "NEEDS_ACTION" ? attentionAction(booking) : null}</> : blockedAction(booking)) : bookingStatus === "CHECKED_IN" ? departureAction(booking) : <span className="text-[8px] text-[#918B83]">No desk action</span>}</div>
              </div>
              {showResolver ? <div className="border-t border-black/[0.05] bg-[#FBFAF7] px-4 py-3 md:px-5">{resolver.loading ? <div className="text-[8px] text-[#918B83]">Finding governed-ready rooms…</div> : resolver.arrivalLink ? <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between"><div><div className="text-[8px] font-semibold text-[#403C37]">Secure arrival link ready</div><div className="mt-0.5 break-all text-[7px] text-[#918B83]">{resolver.arrivalLink}</div></div><div className="flex gap-2"><HotelSecondaryAction onClick={() => navigator.clipboard?.writeText(resolver.arrivalLink)}>Copy link</HotelSecondaryAction><HotelSecondaryAction href={bookingWorkHref(organizationId, "stay-control", booking)}>Open stay</HotelSecondaryAction></div></div> : resolver.rooms.length ? <div className="grid gap-2 md:grid-cols-[minmax(260px,420px)_auto_1fr] md:items-end"><label><span className="text-[7px] font-semibold uppercase tracking-[0.1em] text-[#8D877F]">Governed-ready alternative</span><select className={`${hotelInputClass} mt-1.5`} value={resolver.roomId} onChange={(event) => setResolver((current) => ({ ...current, roomId: event.target.value }))}>{resolver.rooms.map((room) => <option key={room.id} value={room.id}>Room {room.room_number} · {room.room_type || "Room"}</option>)}</select></label><HotelPrimaryAction disabled={resolver.busy || !resolver.roomId} onClick={() => assignReadyRoom(booking)}>{resolver.busy ? "Assigning…" : booking.room_id ? "Move & resolve" : "Assign & resolve"}</HotelPrimaryAction><div className="text-[7px] leading-4 text-[#918B83]">The stay API re-checks property scope and AVAILABLE state. A stale browser choice cannot force a room move.</div></div> : <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between"><div><div className="text-[8px] font-semibold text-[#403C37]">No alternate room is ready</div><div className="mt-0.5 text-[7px] text-[#918B83]">Keep the arrival blocked and work the assigned room through Housekeeping.</div></div><div className="flex gap-2"><HotelSecondaryAction href={hotelWorkspaceHref(organizationId, "housekeeping")}>Open Housekeeping</HotelSecondaryAction><HotelSecondaryAction href={bookingWorkHref(organizationId, "stay-control", booking)}>Open stay</HotelSecondaryAction></div></div>}{resolver.error ? <div className="mt-2 text-[8px] text-red-800">{resolver.error}</div> : null}</div> : null}
            </div>;
          })}
        </div> : <HotelEmptyState>No bookings in this Front Desk queue.</HotelEmptyState>}
      </HotelSection>
    </HotelWorkspaceShell>
  );
}
