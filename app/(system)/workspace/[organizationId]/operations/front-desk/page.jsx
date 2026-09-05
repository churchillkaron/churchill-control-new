"use client";

export const dynamic = "force-dynamic";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { LogIn, LogOut, RefreshCw } from "lucide-react";

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
  hotelWorkspaceHref,
} from "@/components/workspace/hotel/HotelWorkspaceUI";

function dateValue(value) {
  return String(value || "").slice(0, 10);
}

function guestName(booking) {
  return booking?.hotel_guests?.full_name || [booking?.hotel_guests?.first_name, booking?.hotel_guests?.last_name].filter(Boolean).join(" ") || "Guest";
}

function status(value) {
  return String(value || "").trim().toUpperCase();
}

function readinessDetail(booking) {
  const readiness = booking?.arrival_readiness || null;
  if (!readiness) return "Arrival readiness unavailable";
  if (readiness.blockers?.length) return readiness.blockers[0].detail || readiness.blockers[0].label;
  if (readiness.attention?.length) return readiness.attention[0].detail || readiness.attention[0].label;
  return "Room, guest and required deposit are ready";
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
  const [error, setError] = useState(null);

  const loadBookings = useCallback(async () => {
    if (!organizationId) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/hotel/bookings/list?organizationId=${encodeURIComponent(organizationId)}`, { cache: "no-store", credentials: "include" });
      const result = await response.json();
      if (!response.ok || result.success === false) throw new Error(result.error || "Unable to load Front Desk");
      setBookings(result.bookings || []);
    } catch (loadError) {
      setError(loadError?.message || "Unable to load Front Desk");
    } finally {
      setLoading(false);
    }
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
    setTransitioningId(booking.id);
    setError(null);
    try {
      const endpoint = action === "CHECK_IN" ? "/api/hotel/bookings/check-in" : "/api/hotel/bookings/check-out";
      const response = await fetch(endpoint, {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId, bookingId: booking.id }),
      });
      const result = await response.json();
      if (!response.ok || result.success === false) throw new Error(result.error || "Front Desk transition failed");
      await loadBookings();
    } catch (transitionError) {
      setError(transitionError?.message || "Front Desk transition failed");
    } finally {
      setTransitioningId(null);
    }
  }

  return (
    <HotelWorkspaceShell
      organizationId={organizationId}
      active="front-desk"
      title="Front Desk"
      subtitle="Move arrivals, in-house stays and departures with the minimum safe number of steps. Arrival blockers are visible before staff act; the server transition remains the final authority."
      context={organization?.name || "Property"}
      actions={<>
        <HotelPrimaryAction href={hotelWorkspaceHref(organizationId, "reservations")}>New / manage reservation</HotelPrimaryAction>
        <HotelSecondaryAction onClick={loadBookings} disabled={loading}><RefreshCw size={9} className={loading ? "animate-spin" : ""} />Refresh</HotelSecondaryAction>
      </>}
    >
      <HotelError>{error}</HotelError>

      <section className="grid grid-cols-3 gap-3">
        <button type="button" onClick={() => setFilter("ARRIVALS")} className="text-left"><HotelMetric label="Arrivals" value={queues.ARRIVALS.length} detail={`${arrivalSummary.ready} ready · ${arrivalSummary.attention} attention · ${arrivalSummary.blocked} blocked`} attention={filter === "ARRIVALS" && (arrivalSummary.attention + arrivalSummary.blocked) > 0} /></button>
        <button type="button" onClick={() => setFilter("IN_HOUSE")} className="text-left"><HotelMetric label="In house" value={queues.IN_HOUSE.length} detail="Active guest stays" attention={false} /></button>
        <button type="button" onClick={() => setFilter("DEPARTURES")} className="text-left"><HotelMetric label="Departures" value={queues.DEPARTURES.length} detail="Due for closeout" attention={filter === "DEPARTURES" && queues.DEPARTURES.length > 0} /></button>
      </section>

      <HotelSection
        eyebrow="Live desk queue"
        title={filter === "ARRIVALS" ? "Arrivals requiring a desk move" : filter === "DEPARTURES" ? "Departures requiring closeout" : "Guests currently in house"}
        detail={filter === "ARRIVALS" ? "Readiness is evaluated from the governed booking, assigned room, guest profile and required deposit before Check in is offered." : "Open the guest action directly. No separate dashboard step is required."}
      >
        {loading ? (
          <HotelEmptyState>Loading Front Desk…</HotelEmptyState>
        ) : filteredBookings.length ? (
          <div className="divide-y divide-black/[0.055]">
            <div className="hidden grid-cols-[minmax(190px,1.15fr)_130px_130px_105px_minmax(180px,0.95fr)_130px] gap-3 bg-[#FCFBF8] px-5 py-2 text-[7px] font-semibold uppercase tracking-[0.1em] text-[#969087] md:grid">
              <span>Guest / room</span><span>Arrival</span><span>Departure</span><span>Status</span><span>Readiness</span><span>Next move</span>
            </div>
            {filteredBookings.map((booking) => {
              const bookingStatus = status(booking.status);
              const transitioning = transitioningId === booking.id;
              const readiness = booking?.arrival_readiness || null;
              const canCheckIn = bookingStatus === "RESERVED" && readiness?.can_check_in === true;
              return (
                <div key={booking.id} className="grid gap-2 px-4 py-3 md:grid-cols-[minmax(190px,1.15fr)_130px_130px_105px_minmax(180px,0.95fr)_130px] md:items-center md:gap-3 md:px-5">
                  <div className="min-w-0">
                    <div className="truncate text-[9px] font-semibold text-[#403C37]">{guestName(booking)}</div>
                    <div className="mt-0.5 text-[8px] text-[#918B83]">Room {booking.hotel_rooms?.room_number || "Unassigned"}{booking.hotel_rooms?.room_type ? ` · ${booking.hotel_rooms.room_type}` : ""}</div>
                  </div>
                  <div className="text-[8px] text-[#716B63]">{dateValue(booking.check_in_date) || "—"}</div>
                  <div className="text-[8px] text-[#716B63]">{dateValue(booking.check_out_date) || "—"}</div>
                  <HotelStatusPill value={bookingStatus} />
                  <div className="min-w-0">
                    {bookingStatus === "RESERVED" ? <>
                      <HotelStatusPill value={readiness?.state || "BLOCKED"} />
                      <div className="mt-1 text-[7px] leading-3 text-[#918B83]">{readinessDetail(booking)}</div>
                    </> : <span className="text-[8px] text-[#918B83]">—</span>}
                  </div>
                  <div>
                    {bookingStatus === "RESERVED" ? (
                      <HotelPrimaryAction onClick={() => transitionBooking(booking, "CHECK_IN")} disabled={transitioning || !canCheckIn}><LogIn size={9} />{transitioning ? "Checking in" : canCheckIn ? "Check in" : "Resolve first"}</HotelPrimaryAction>
                    ) : bookingStatus === "CHECKED_IN" ? (
                      <HotelSecondaryAction onClick={() => transitionBooking(booking, "CHECK_OUT")} disabled={transitioning}><LogOut size={9} />{transitioning ? "Checking out" : "Check out"}</HotelSecondaryAction>
                    ) : <span className="text-[8px] text-[#918B83]">No desk action</span>}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <HotelEmptyState>No bookings in this Front Desk queue.</HotelEmptyState>
        )}
      </HotelSection>
    </HotelWorkspaceShell>
  );
}
