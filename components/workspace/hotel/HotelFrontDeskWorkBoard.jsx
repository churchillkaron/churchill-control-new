"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarPlus2, CheckCircle2, LogIn, LogOut, RefreshCw, UserX } from "lucide-react";

import {
  HotelEmptyState,
  HotelError,
  HotelMetric,
  HotelPrimaryAction,
  HotelSecondaryAction,
  HotelSection,
  HotelStatusPill,
  hotelInputClass,
  hotelWorkspaceHref,
} from "@/components/workspace/hotel/HotelWorkspaceUI";

function dateValue(value) { return String(value || "").slice(0, 10); }
function status(value) { return String(value || "").trim().toUpperCase(); }
function guestName(booking) { return booking?.hotel_guests?.full_name || "Guest"; }
function businessDate(booking) {
  if (booking?.operational_day?.configured !== true) return "";
  return dateValue(booking?.operational_day?.businessDate);
}
function propertyClockLabel(booking) {
  const day = booking?.operational_day || {};
  if (!day.configured) return "Property clock not configured";
  return `${day.timezone || "Property time"} · day ${day.businessDate}`;
}
function nextDate(value) {
  const current = dateValue(value);
  if (!current) return "";
  const date = new Date(`${current}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return "";
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}
function money(value, currency = "THB") {
  try { return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 2 }).format(Number(value || 0)); }
  catch { return `${Number(value || 0).toFixed(2)} ${currency}`; }
}
function firstArrivalCode(booking) { return booking?.arrival_readiness?.blockers?.[0]?.code || booking?.arrival_readiness?.attention?.[0]?.code || null; }
function firstDepartureCode(booking) { return booking?.departure_readiness?.blockers?.[0]?.code || booking?.departure_readiness?.attention?.[0]?.code || null; }
function stayHref(organizationId, route, booking) {
  const query = new URLSearchParams({ bookingId: String(booking?.id || "") });
  if (booking?.property_id) query.set("propertyId", String(booking.property_id));
  return `${hotelWorkspaceHref(organizationId, route)}?${query.toString()}`;
}
async function hotelApi(url, options = {}) {
  const response = await fetch(url, { cache: "no-store", credentials: "include", ...options });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.success === false) throw new Error(payload.error || "Hotel operation failed");
  return payload;
}

export default function HotelFrontDeskWorkBoard({ organizationId }) {
  const [bookings, setBookings] = useState([]);
  const [filter, setFilter] = useState("ARRIVALS");
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState("");
  const [extension, setExtension] = useState({ bookingId: null, newDate: "", busy: false, error: "" });
  const [noShow, setNoShow] = useState({ bookingId: null, busy: false, error: "" });
  const [resolver, setResolver] = useState({ bookingId: null, loading: false, busy: false, rooms: [], roomId: "", error: "" });

  const load = useCallback(async () => {
    if (!organizationId) return;
    setLoading(true); setError("");
    try {
      const payload = await hotelApi(`/api/hotel/bookings/list?organizationId=${encodeURIComponent(organizationId)}`);
      setBookings(payload.bookings || []);
    } catch (reason) { setError(reason?.message || "Unable to load Front Desk"); }
    finally { setLoading(false); }
  }, [organizationId]);

  useEffect(() => { load(); }, [load]);

  const queues = useMemo(() => {
    const arrivals = bookings.filter((booking) => {
      const day = businessDate(booking);
      return Boolean(day) && status(booking.status) === "RESERVED" && dateValue(booking.check_in_date) <= day;
    });
    const inHouse = bookings.filter((booking) => status(booking.status) === "CHECKED_IN");
    const departures = inHouse.filter((booking) => {
      const day = businessDate(booking);
      return Boolean(day) && dateValue(booking.check_out_date) <= day;
    });
    return { ARRIVALS: arrivals, IN_HOUSE: inHouse, DEPARTURES: departures };
  }, [bookings]);

  const current = queues[filter] || [];
  const arrivalStats = useMemo(() => ({
    ready: queues.ARRIVALS.filter((booking) => booking?.arrival_readiness?.can_check_in === true).length,
    blocked: queues.ARRIVALS.filter((booking) => booking?.arrival_readiness?.can_check_in !== true).length,
    overdue: queues.ARRIVALS.filter((booking) => dateValue(booking.check_in_date) < businessDate(booking)).length,
  }), [queues.ARRIVALS]);
  const departureStats = useMemo(() => ({
    ready: queues.DEPARTURES.filter((booking) => booking?.departure_readiness?.can_check_out === true).length,
    blocked: queues.DEPARTURES.filter((booking) => booking?.departure_readiness?.can_check_out !== true).length,
    overdue: queues.DEPARTURES.filter((booking) => dateValue(booking.check_out_date) < businessDate(booking)).length,
  }), [queues.DEPARTURES]);
  const clockProblems = useMemo(() => bookings.filter((booking) => booking?.operational_day?.configured !== true).length, [bookings]);

  async function transition(booking, action) {
    if (!booking?.id) return;
    if (action === "CHECK_IN" && booking?.arrival_readiness?.can_check_in === false) return;
    if (action === "CHECK_OUT" && booking?.departure_readiness?.can_check_out === false) return;
    setBusyId(booking.id); setError("");
    try {
      await hotelApi(action === "CHECK_IN" ? "/api/hotel/bookings/check-in" : "/api/hotel/bookings/check-out", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ organizationId, bookingId: booking.id }),
      });
      await load();
    } catch (reason) { setError(reason?.message || "Front Desk transition failed"); }
    finally { setBusyId(null); }
  }

  async function inspectRoom(booking) {
    if (!booking?.room_turnover?.id) return;
    setBusyId(booking.id); setError("");
    try {
      await hotelApi("/api/hotel/housekeeping/update", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ organizationId, taskId: booking.room_turnover.id, action: "INSPECT" }),
      });
      await load();
    } catch (reason) { setError(reason?.message || "Room inspection failed"); }
    finally { setBusyId(null); }
  }

  async function closeFolio(booking) {
    setBusyId(booking.id); setError("");
    try {
      await hotelApi("/api/hotel/stays", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ organizationId, bookingId: booking.id, action: "CLOSE_FOLIO" }),
      });
      await load();
    } catch (reason) { setError(reason?.message || "Unable to close folio"); }
    finally { setBusyId(null); }
  }

  function toggleNoShow(booking) {
    const day = businessDate(booking);
    if (!day || dateValue(booking.check_in_date) >= day) return;
    setNoShow((currentState) => currentState.bookingId === booking.id ? { bookingId: null, busy: false, error: "" } : { bookingId: booking.id, busy: false, error: "" });
  }

  async function recordNoShow(booking) {
    setNoShow((currentState) => ({ ...currentState, busy: true, error: "" }));
    try {
      await hotelApi("/api/hotel/bookings/no-show", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ bookingId: booking.id }) });
      setNoShow({ bookingId: null, busy: false, error: "" });
      await load();
    } catch (reason) { setNoShow((currentState) => ({ ...currentState, busy: false, error: reason?.message || "Unable to record no-show" })); }
  }

  function toggleExtension(booking) {
    setExtension((currentState) => currentState.bookingId === booking.id
      ? { bookingId: null, newDate: "", busy: false, error: "" }
      : { bookingId: booking.id, newDate: nextDate(booking.check_out_date), busy: false, error: "" });
  }

  async function extendStay(booking) {
    if (!extension.newDate) return;
    setExtension((currentState) => ({ ...currentState, busy: true, error: "" }));
    try {
      await hotelApi("/api/hotel/bookings/extend", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ bookingId: booking.id, newCheckOutDate: extension.newDate }) });
      setExtension({ bookingId: null, newDate: "", busy: false, error: "" });
      await load();
    } catch (reason) { setExtension((currentState) => ({ ...currentState, busy: false, error: reason?.message || "Unable to extend stay" })); }
  }

  async function toggleRoomResolver(booking) {
    if (resolver.bookingId === booking.id && !resolver.loading) {
      setResolver({ bookingId: null, loading: false, busy: false, rooms: [], roomId: "", error: "" }); return;
    }
    setResolver({ bookingId: booking.id, loading: true, busy: false, rooms: [], roomId: "", error: "" });
    try {
      const query = new URLSearchParams({ organizationId: String(organizationId), bookingId: String(booking.id) });
      if (booking.property_id) query.set("propertyId", String(booking.property_id));
      const payload = await hotelApi(`/api/hotel/stays?${query.toString()}`);
      const rooms = (payload.rooms || []).filter((room) => status(room.status) === "AVAILABLE" && room.id !== booking.room_id);
      setResolver({ bookingId: booking.id, loading: false, busy: false, rooms, roomId: rooms[0]?.id || "", error: "" });
    } catch (reason) { setResolver({ bookingId: booking.id, loading: false, busy: false, rooms: [], roomId: "", error: reason?.message || "Unable to load ready rooms" }); }
  }

  async function assignRoom(booking) {
    if (!resolver.roomId) return;
    setResolver((currentState) => ({ ...currentState, busy: true, error: "" }));
    try {
      await hotelApi("/api/hotel/stays", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ organizationId, bookingId: booking.id, action: booking.room_id ? "MOVE_ROOM" : "ASSIGN_ROOM", roomId: resolver.roomId, reason: "Front Desk readiness resolution" }),
      });
      setResolver({ bookingId: null, loading: false, busy: false, rooms: [], roomId: "", error: "" });
      await load();
    } catch (reason) { setResolver((currentState) => ({ ...currentState, busy: false, error: reason?.message || "Unable to assign room" })); }
  }

  function arrivalActions(booking) {
    const code = firstArrivalCode(booking);
    if (booking?.arrival_readiness?.can_check_in === true) return <HotelPrimaryAction onClick={() => transition(booking, "CHECK_IN")} disabled={busyId === booking.id}><LogIn size={9} />{busyId === booking.id ? "Checking in…" : "Check in"}</HotelPrimaryAction>;
    if (code === "ROOM_NOT_AVAILABLE" && status(booking?.hotel_rooms?.status) === "CLEAN" && status(booking?.room_turnover?.task_status) === "AWAITING_INSPECTION") return <><HotelPrimaryAction onClick={() => inspectRoom(booking)} disabled={busyId === booking.id}><CheckCircle2 size={9} />Inspect & release</HotelPrimaryAction><HotelSecondaryAction onClick={() => toggleRoomResolver(booking)}>Choose another</HotelSecondaryAction></>;
    if (["ROOM_UNASSIGNED", "ROOM_NOT_FOUND", "ROOM_NOT_AVAILABLE"].includes(code)) return <><HotelSecondaryAction onClick={() => toggleRoomResolver(booking)}>Choose ready room</HotelSecondaryAction>{booking?.room_turnover ? <HotelSecondaryAction href={hotelWorkspaceHref(organizationId, "housekeeping")}>Housekeeping</HotelSecondaryAction> : null}</>;
    if (code === "DEPOSIT_OUTSTANDING") return <HotelSecondaryAction href={stayHref(organizationId, "hotel-payments", booking)}>Collect deposit</HotelSecondaryAction>;
    return <HotelSecondaryAction href={stayHref(organizationId, "stay-control", booking)}>Review guest</HotelSecondaryAction>;
  }

  function departureActions(booking) {
    const code = firstDepartureCode(booking);
    const scheduled = dateValue(booking.check_out_date);
    const day = businessDate(booking);
    if (!day) return <HotelSecondaryAction href={hotelWorkspaceHref(organizationId, "operational-day")}>Configure property clock</HotelSecondaryAction>;
    if (scheduled > day) return <><HotelPrimaryAction href={stayHref(organizationId, "stay-control", booking)}><LogOut size={9} />Leave early</HotelPrimaryAction><HotelSecondaryAction onClick={() => toggleExtension(booking)}><CalendarPlus2 size={9} />Extend stay</HotelSecondaryAction></>;
    if (booking?.departure_readiness?.can_check_out === true) return <><HotelPrimaryAction onClick={() => transition(booking, "CHECK_OUT")} disabled={busyId === booking.id}><LogOut size={9} />{busyId === booking.id ? "Checking out…" : "Check out"}</HotelPrimaryAction><HotelSecondaryAction onClick={() => toggleExtension(booking)}><CalendarPlus2 size={9} />Extend</HotelSecondaryAction></>;
    if (code === "FOLIO_OPEN_ZERO_BALANCE") return <><HotelPrimaryAction onClick={() => closeFolio(booking)} disabled={busyId === booking.id}><CheckCircle2 size={9} />Close zero folio</HotelPrimaryAction><HotelSecondaryAction href={stayHref(organizationId, "stay-control", booking)}>Review stay</HotelSecondaryAction></>;
    if (code === "FOLIO_BALANCE_OPEN") return <><HotelSecondaryAction href={stayHref(organizationId, "hotel-payments", booking)}>Settle guest</HotelSecondaryAction><HotelSecondaryAction href={stayHref(organizationId, "stay-control", booking)}>Open folio</HotelSecondaryAction></>;
    if (["PAYMENT_PENDING", "FINANCE_EVIDENCE_MISSING"].includes(code)) return <HotelSecondaryAction href={stayHref(organizationId, "hotel-payments", booking)}>Review settlement</HotelSecondaryAction>;
    return <HotelSecondaryAction href={stayHref(organizationId, "stay-control", booking)}>Resolve departure</HotelSecondaryAction>;
  }

  function readinessText(booking) {
    if (status(booking.status) === "RESERVED") {
      const readiness = booking?.arrival_readiness;
      return readiness?.blockers?.[0]?.detail || readiness?.attention?.[0]?.detail || "Room, guest and deposit are ready.";
    }
    const readiness = booking?.departure_readiness;
    return readiness?.blockers?.[0]?.detail || readiness?.attention?.[0]?.detail || "Stay is clear for departure.";
  }

  return <div className="space-y-4">
    <HotelError>{error}</HotelError>
    {clockProblems ? <div className="rounded-2xl border border-amber-700/15 bg-amber-50 px-4 py-3 text-[8px] leading-4 text-amber-900">{clockProblems} booking{clockProblems === 1 ? "" : "s"} belong to properties without a certified operational clock. Date-driven arrivals, departures, no-shows and checkouts are hidden until those properties are configured. <span className="ml-1 inline-block"><HotelSecondaryAction href={hotelWorkspaceHref(organizationId, "operational-day")}>Configure property clock</HotelSecondaryAction></span></div> : null}
    <div className="grid gap-3 sm:grid-cols-3">
      <button type="button" onClick={() => setFilter("ARRIVALS")} className="text-left"><HotelMetric label="Arrivals" value={queues.ARRIVALS.length} detail={`${arrivalStats.ready} ready · ${arrivalStats.blocked} need work${arrivalStats.overdue ? ` · ${arrivalStats.overdue} overdue` : ""}`} attention={filter === "ARRIVALS" && (arrivalStats.blocked + arrivalStats.overdue) > 0} /></button>
      <button type="button" onClick={() => setFilter("IN_HOUSE")} className="text-left"><HotelMetric label="In house" value={queues.IN_HOUSE.length} detail="Active guests, each on its property day" attention={filter === "IN_HOUSE" && clockProblems > 0} /></button>
      <button type="button" onClick={() => setFilter("DEPARTURES")} className="text-left"><HotelMetric label="Departures" value={queues.DEPARTURES.length} detail={`${departureStats.ready} ready · ${departureStats.blocked} need work${departureStats.overdue ? ` · ${departureStats.overdue} overdue` : ""}`} attention={filter === "DEPARTURES" && (departureStats.blocked + departureStats.overdue) > 0} /></button>
    </div>

    <HotelSection eyebrow="Live guest work" title={filter === "ARRIVALS" ? "Who needs an arrival decision?" : filter === "DEPARTURES" ? "Who needs a departure decision?" : "Who is in the hotel now?"} detail="The queue follows each property's server-owned operating day. Work the guest and the exact blocker; Avantiqo handles the navigation and re-checks source truth before any transition.">
      {loading ? <HotelEmptyState>Building the live Front Desk queue…</HotelEmptyState> : current.length ? <div className="divide-y divide-black/[0.055]">{current.map((booking) => {
        const bookingStatus = status(booking.status);
        const day = businessDate(booking);
        const isOverdueArrival = Boolean(day) && bookingStatus === "RESERVED" && dateValue(booking.check_in_date) < day;
        const isOverdueDeparture = Boolean(day) && bookingStatus === "CHECKED_IN" && dateValue(booking.check_out_date) < day;
        const showNoShow = noShow.bookingId === booking.id;
        const showExtension = extension.bookingId === booking.id;
        const showResolver = resolver.bookingId === booking.id;
        const readiness = bookingStatus === "RESERVED" ? booking?.arrival_readiness : booking?.departure_readiness;
        return <div key={booking.id}>
          <div className="grid gap-3 px-4 py-4 lg:grid-cols-[minmax(190px,1.15fr)_145px_145px_105px_minmax(240px,1.25fr)_minmax(190px,0.8fr)] lg:items-center lg:px-5">
            <div><div className="text-[10px] font-semibold text-[#403C37]">{guestName(booking)}</div><div className="mt-1 text-[8px] text-[#918B83]">Room {booking.hotel_rooms?.room_number || "Unassigned"} · {propertyClockLabel(booking)}</div></div>
            <div><div className="text-[7px] uppercase tracking-[0.1em] text-[#9A948C]">Arrival</div><div className="mt-1 text-[8px] text-[#5E5851]">{dateValue(booking.check_in_date) || "—"}</div>{isOverdueArrival ? <div className="mt-1 text-[7px] font-semibold text-[#9A533D]">Needs decision</div> : null}</div>
            <div><div className="text-[7px] uppercase tracking-[0.1em] text-[#9A948C]">Departure</div><div className="mt-1 text-[8px] text-[#5E5851]">{dateValue(booking.check_out_date) || "—"}</div>{isOverdueDeparture ? <div className="mt-1 text-[7px] font-semibold text-[#9A533D]">Needs decision</div> : null}</div>
            <HotelStatusPill value={bookingStatus} />
            <div><HotelStatusPill value={readiness?.state || "BLOCKED"} /><div className="mt-1.5 text-[8px] leading-4 text-[#817B73]">{readinessText(booking)}</div>{bookingStatus === "CHECKED_IN" && booking?.departure_readiness?.folio_status ? <div className="mt-1 text-[7px] font-semibold text-[#8A633C]">Folio {booking.departure_readiness.folio_status} · {money(booking.departure_readiness.folio_balance, booking.departure_readiness.currency_code)}</div> : null}</div>
            <div className="flex flex-wrap gap-1.5">{bookingStatus === "RESERVED" ? <>{arrivalActions(booking)}{isOverdueArrival ? <HotelSecondaryAction onClick={() => toggleNoShow(booking)}><UserX size={9} />No-show</HotelSecondaryAction> : null}</> : departureActions(booking)}</div>
          </div>

          {showNoShow ? <div className="border-t border-black/[0.05] bg-[#FBFAF7] px-4 py-3 lg:px-5"><div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-center"><div><div className="text-[8px] font-semibold text-[#403C37]">Resolve {guestName(booking)} as a no-show?</div><div className="mt-1 text-[7px] leading-4 text-[#918B83]">This changes reservation state and releases this reservation's stay inventory. It does not silently decide deposit, refund, folio, group allotment or OTA treatment.</div></div><div className="flex gap-2"><HotelSecondaryAction onClick={() => setNoShow({ bookingId: null, busy: false, error: "" })} disabled={noShow.busy}>Keep reservation</HotelSecondaryAction><HotelPrimaryAction onClick={() => recordNoShow(booking)} disabled={noShow.busy}>{noShow.busy ? "Recording…" : "Confirm no-show"}</HotelPrimaryAction></div></div>{noShow.error ? <div className="mt-2 text-[8px] text-red-800">{noShow.error}</div> : null}</div> : null}

          {showExtension ? <div className="border-t border-black/[0.05] bg-[#FBFAF7] px-4 py-3 lg:px-5"><div className="grid gap-3 md:grid-cols-[minmax(220px,320px)_auto_1fr] md:items-end"><label><span className="text-[7px] font-semibold uppercase tracking-[0.1em] text-[#8D877F]">New departure</span><input type="date" className={`${hotelInputClass} mt-1.5`} min={nextDate(booking.check_out_date)} value={extension.newDate} onChange={(event) => setExtension((currentState) => ({ ...currentState, newDate: event.target.value, error: "" }))} /></label><HotelPrimaryAction disabled={extension.busy || !extension.newDate} onClick={() => extendStay(booking)}><CalendarPlus2 size={9} />{extension.busy ? "Checking inventory…" : "Confirm extension"}</HotelPrimaryAction><div className="text-[7px] leading-4 text-[#918B83]">Inventory is re-checked atomically. Pricing and folio are not changed automatically; the commercial decision remains visible human work.</div></div>{extension.error ? <div className="mt-2 text-[8px] text-red-800">{extension.error}</div> : null}</div> : null}

          {showResolver ? <div className="border-t border-black/[0.05] bg-[#FBFAF7] px-4 py-3 lg:px-5">{resolver.loading ? <div className="text-[8px] text-[#918B83]">Finding rooms that are actually ready now…</div> : resolver.rooms.length ? <div className="grid gap-3 md:grid-cols-[minmax(260px,420px)_auto_1fr] md:items-end"><label><span className="text-[7px] font-semibold uppercase tracking-[0.1em] text-[#8D877F]">Ready room</span><select className={`${hotelInputClass} mt-1.5`} value={resolver.roomId} onChange={(event) => setResolver((currentState) => ({ ...currentState, roomId: event.target.value }))}>{resolver.rooms.map((room) => <option key={room.id} value={room.id}>Room {room.room_number} · {room.room_type || "Room"}</option>)}</select></label><HotelPrimaryAction disabled={resolver.busy || !resolver.roomId} onClick={() => assignRoom(booking)}>{resolver.busy ? "Assigning…" : booking.room_id ? "Move & resolve" : "Assign & resolve"}</HotelPrimaryAction><div className="text-[7px] leading-4 text-[#918B83]">The stay API checks property scope and AVAILABLE state again. A stale browser choice cannot force an unsafe room move.</div></div> : <div className="flex flex-wrap items-center justify-between gap-3"><div className="text-[8px] text-[#817B73]">No alternate room is currently ready. Keep the guest blocked and work Housekeeping.</div><HotelSecondaryAction href={hotelWorkspaceHref(organizationId, "housekeeping")}>Open Housekeeping</HotelSecondaryAction></div>}{resolver.error ? <div className="mt-2 text-[8px] text-red-800">{resolver.error}</div> : null}</div> : null}
        </div>;
      })}</div> : <HotelEmptyState>No guests need work in this queue.</HotelEmptyState>}
    </HotelSection>

    <div className="flex justify-end"><HotelSecondaryAction onClick={load} disabled={loading}><RefreshCw size={9} className={loading ? "animate-spin" : ""} />Refresh live work</HotelSecondaryAction></div>
  </div>;
}
