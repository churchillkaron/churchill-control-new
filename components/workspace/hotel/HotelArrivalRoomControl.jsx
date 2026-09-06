"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowRight, BedDouble, RefreshCw, ShieldCheck, TriangleAlert } from "lucide-react";

import {
  HotelEmptyState,
  HotelError,
  HotelMetric,
  HotelPrimaryAction,
  HotelSecondaryAction,
  HotelSection,
  HotelStatusPill,
} from "@/components/workspace/hotel/HotelWorkspaceUI";

function clean(value) { return String(value ?? "").trim(); }
function status(value) { return clean(value).toUpperCase(); }
function dateValue(value) { return clean(value).slice(0, 10); }
function guestName(booking) { return booking?.hotel_guests?.full_name || "Guest"; }
function dayFor(booking) { return booking?.operational_day?.configured === true ? dateValue(booking?.operational_day?.businessDate) : ""; }
function roomLabel(room) { return room?.roomNumber ? `Room ${room.roomNumber}` : "Room"; }

async function hotelApi(url, options = {}) {
  const response = await fetch(url, { cache: "no-store", credentials: "include", ...options });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.success === false) throw new Error(payload.error || "Hotel operation failed");
  return payload;
}

function firstRoomBlocker(booking) {
  const blockers = booking?.arrival_readiness?.blockers || [];
  return blockers.find((item) => ["ROOM_UNASSIGNED", "ROOM_NOT_FOUND", "ROOM_NOT_AVAILABLE"].includes(item?.code)) || null;
}

export default function HotelArrivalRoomControl({ organizationId, onChanged = null }) {
  const [bookings, setBookings] = useState([]);
  const [plans, setPlans] = useState({});
  const [selectedRooms, setSelectedRooms] = useState({});
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!organizationId) return;
    setLoading(true); setError("");
    try {
      const payload = await hotelApi(`/api/hotel/bookings/list?organizationId=${encodeURIComponent(organizationId)}`);
      const due = (payload.bookings || []).filter((booking) => {
        const day = dayFor(booking);
        return Boolean(day) && status(booking.status) === "RESERVED" && dateValue(booking.check_in_date) <= day;
      });
      setBookings(due);
      const roomRisk = due.filter((booking) => firstRoomBlocker(booking));
      const results = await Promise.all(roomRisk.map(async (booking) => {
        try {
          const plan = await hotelApi(`/api/hotel/bookings/room-options?bookingId=${encodeURIComponent(booking.id)}`);
          return [booking.id, plan];
        } catch (reason) {
          return [booking.id, { error: reason?.message || "Unable to evaluate rooms", options: [], counts: {} }];
        }
      }));
      const nextPlans = Object.fromEntries(results);
      setPlans(nextPlans);
      setSelectedRooms((current) => {
        const next = { ...current };
        for (const [bookingId, plan] of results) {
          const currentRoom = next[bookingId];
          const currentStillSafe = plan?.options?.some((room) => room.id === currentRoom && room.assignableNow);
          if (!currentStillSafe) next[bookingId] = plan?.recommendedRoomId || "";
        }
        return next;
      });
    } catch (reason) {
      setError(reason?.message || "Unable to build arrival room plan");
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => { load(); }, [load]);

  const roomRisks = useMemo(() => bookings.filter((booking) => firstRoomBlocker(booking)), [bookings]);
  const noSafeRoom = useMemo(() => roomRisks.filter((booking) => Number(plans[booking.id]?.counts?.assignableNow || 0) === 0).length, [plans, roomRisks]);
  const readyAlternative = useMemo(() => roomRisks.filter((booking) => Number(plans[booking.id]?.counts?.readyNow || 0) > 0).length, [plans, roomRisks]);

  async function assign(booking) {
    const roomId = selectedRooms[booking.id];
    if (!roomId) return;
    setBusyId(booking.id); setError("");
    try {
      await hotelApi("/api/hotel/bookings/assign-room", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          bookingId: booking.id,
          roomId,
          reason: "Front Desk proactive arrival room control",
        }),
      });
      await load();
      if (typeof onChanged === "function") onChanged();
    } catch (reason) {
      setError(reason?.message || "Unable to assign safe room");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <HotelSection
      eyebrow="Arrival orchestration"
      title="Put arriving guests into the right ready room"
      detail="Avantiqo separates sellable inventory from physical guest placement. It checks capacity, overlapping stays, maintenance and Housekeeping before recommending a room; staff still make the assignment."
      action={<HotelSecondaryAction onClick={load} disabled={loading}><RefreshCw size={9} className={loading ? "animate-spin" : ""} />Refresh room plan</HotelSecondaryAction>}
    >
      <div className="space-y-3 p-4 md:p-5">
        <HotelError>{error}</HotelError>
        <div className="grid gap-3 sm:grid-cols-3">
          <HotelMetric label="Arrivals needing room action" value={roomRisks.length} detail="Assigned room missing or not ready" attention={roomRisks.length > 0} />
          <HotelMetric label="Ready alternatives" value={readyAlternative} detail="Arrivals with at least one safe room now" />
          <HotelMetric label="No safe room yet" value={noSafeRoom} detail="Housekeeping, maintenance, capacity or occupancy must change first" attention={noSafeRoom > 0} />
        </div>

        {!loading && roomRisks.length === 0 ? (
          <HotelEmptyState>Every due arrival already has a room path. Avantiqo will surface a new room risk here when live Hotel truth changes.</HotelEmptyState>
        ) : null}

        <div className="space-y-2">
          {roomRisks.map((booking) => {
            const plan = plans[booking.id] || {};
            const options = Array.isArray(plan.options) ? plan.options : [];
            const selectable = options.filter((room) => room.assignableNow && !room.currentAssignment);
            const blocked = options.filter((room) => !room.assignableNow);
            const selectedId = selectedRooms[booking.id] || "";
            const selected = selectable.find((room) => room.id === selectedId) || null;
            const recommended = options.find((room) => room.id === plan.recommendedRoomId) || null;
            const existingBlocker = firstRoomBlocker(booking);

            return (
              <div key={booking.id} className="rounded-2xl border border-black/[0.07] bg-[#FCFBF8] p-3.5">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="text-[11px] font-semibold text-[#3B3630]">{guestName(booking)}</div>
                      <HotelStatusPill value={selectable.length ? "SAFE ROOM FOUND" : "BLOCKED"} tone={selectable.length ? "good" : "critical"} />
                      <span className="text-[8px] text-[#918B83]">Arrival {dateValue(booking.check_in_date)} · {booking.adults || 0} adult{Number(booking.adults || 0) === 1 ? "" : "s"}{Number(booking.children || 0) ? ` · ${booking.children} child${Number(booking.children) === 1 ? "" : "ren"}` : ""}</span>
                    </div>
                    <div className="mt-1.5 flex items-start gap-1.5 text-[8px] leading-4 text-[#766F67]">
                      <TriangleAlert size={10} className="mt-0.5 shrink-0 text-[#9A6A3A]" />
                      <span><strong className="font-semibold text-[#544D46]">Why this needs action:</strong> {existingBlocker?.detail || "The assigned room is not ready for arrival."}</span>
                    </div>
                  </div>
                  <div className="text-right text-[7px] uppercase tracking-[0.1em] text-[#999188]">Property day {plan?.operationalDay?.businessDate || dayFor(booking) || "not configured"}</div>
                </div>

                {plan.error ? <div className="mt-3 rounded-xl border border-red-700/10 bg-red-50 px-3 py-2 text-[8px] text-red-800">{plan.error}</div> : null}

                {recommended && recommended.assignableNow ? (
                  <div className="mt-3 rounded-xl border border-emerald-700/10 bg-emerald-50/60 px-3 py-2.5">
                    <div className="flex items-center gap-1.5 text-[8px] font-semibold uppercase tracking-[0.1em] text-emerald-800"><ShieldCheck size={10} />Best safe room</div>
                    <div className="mt-1 text-[11px] font-semibold text-[#36312C]">{roomLabel(recommended)} · {recommended.roomType || "Room"}</div>
                    <div className="mt-1 text-[8px] leading-4 text-[#6D675F]">{(recommended.whyRecommended || []).join(" · ") || "Passes current room safety checks."}</div>
                  </div>
                ) : (
                  <div className="mt-3 rounded-xl border border-amber-700/15 bg-amber-50 px-3 py-2.5 text-[8px] leading-4 text-amber-900">
                    <strong>No safe room is assignable yet.</strong> Keep the guest visible here and resolve the physical blocker instead of forcing a room assignment.
                  </div>
                )}

                {selectable.length ? (
                  <div className="mt-3 grid gap-2 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
                    <label className="block">
                      <span className="text-[7px] font-semibold uppercase tracking-[0.1em] text-[#8D877F]">Choose safe room</span>
                      <select
                        value={selectedId}
                        onChange={(event) => setSelectedRooms((current) => ({ ...current, [booking.id]: event.target.value }))}
                        className="mt-1.5 h-9 w-full rounded-lg border border-black/[0.09] bg-white px-2.5 text-[9px] text-[#3F3A35] outline-none focus:border-[#A37849]/45"
                      >
                        {selectable.map((room) => <option key={room.id} value={room.id}>{roomLabel(room)} · {room.roomType || "Room"} · max {room.maxGuests} · {room.readyNow ? "ready now" : "future-safe"}</option>)}
                      </select>
                    </label>
                    <HotelPrimaryAction onClick={() => assign(booking)} disabled={!selected || busyId === booking.id}>
                      <BedDouble size={9} />{busyId === booking.id ? "Rechecking…" : "Assign selected room"}<ArrowRight size={9} />
                    </HotelPrimaryAction>
                  </div>
                ) : null}

                {selected ? (
                  <div className="mt-2 text-[8px] leading-4 text-[#7B746B]"><strong className="font-semibold text-[#554E47]">Why this room:</strong> {(selected.whyRecommended || []).join(" · ") || "It passes current governed safety checks."}</div>
                ) : null}

                {blocked.length ? (
                  <details className="mt-3 rounded-xl border border-black/[0.06] bg-white px-3 py-2">
                    <summary className="cursor-pointer text-[8px] font-semibold text-[#716A62]">What blocks {blocked.length} other room{blocked.length === 1 ? "" : "s"}</summary>
                    <div className="mt-2 space-y-1.5">
                      {blocked.map((room) => (
                        <div key={room.id} className="grid gap-1 text-[8px] leading-4 text-[#847D74] sm:grid-cols-[110px_1fr]">
                          <span className="font-semibold text-[#57514A]">{roomLabel(room)}</span>
                          <span>{(room.blockedReasons || []).map((reason) => reason.detail).join(" · ") || "Not safe for this arrival."}</span>
                        </div>
                      ))}
                    </div>
                  </details>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </HotelSection>
  );
}
