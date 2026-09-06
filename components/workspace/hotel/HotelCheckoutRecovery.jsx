"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { RotateCcw, ShieldCheck } from "lucide-react";

import {
  HotelEmptyState,
  HotelError,
  HotelField,
  HotelPrimaryAction,
  HotelSecondaryAction,
  HotelSection,
  HotelStatusPill,
  hotelInputClass,
  hotelWorkspaceHref,
} from "@/components/workspace/hotel/HotelWorkspaceUI";

const clean = (value) => String(value ?? "").trim();
const upper = (value) => clean(value).toUpperCase();
const dateValue = (value) => clean(value).slice(0, 10);
const guestName = (booking) => booking?.hotel_guests?.full_name || "Guest";
const roomLabel = (room) => room ? `Room ${room.room_number || "?"}${room.room_type ? ` · ${room.room_type}` : ""}` : "No room";

async function hotelApi(url, options = {}) {
  const response = await fetch(url, { cache: "no-store", credentials: "include", ...options });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.success === false) {
    const error = new Error(payload.error || "Hotel operation failed");
    error.details = payload.details;
    throw error;
  }
  return payload;
}

function sameDayCheckout(booking) {
  const businessDate = dateValue(booking?.operational_day?.businessDate);
  const checkoutDate = dateValue(booking?.actual_check_out_business_date);
  return upper(booking?.status) === "CHECKED_OUT"
    && booking?.operational_day?.configured === true
    && Boolean(businessDate)
    && checkoutDate === businessDate;
}

export default function HotelCheckoutRecovery({ organizationId }) {
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [draft, setDraft] = useState({ bookingId: null, loading: false, recovery: null, roomId: "", reason: "", busy: false, error: "" });

  const load = useCallback(async () => {
    if (!organizationId) return;
    setLoading(true); setError("");
    try {
      const payload = await hotelApi(`/api/hotel/bookings/list?organizationId=${encodeURIComponent(organizationId)}`);
      setBookings(payload.bookings || []);
    } catch (reason) {
      setError(reason?.message || "Unable to load checkout recovery");
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => { load(); }, [load]);

  const recoverable = useMemo(
    () => bookings.filter(sameDayCheckout).sort((a, b) => clean(b.actual_check_out_at).localeCompare(clean(a.actual_check_out_at))),
    [bookings],
  );

  async function prepare(booking) {
    if (!booking?.id) return;
    if (draft.bookingId === booking.id && draft.recovery) {
      setDraft({ bookingId: null, loading: false, recovery: null, roomId: "", reason: "", busy: false, error: "" });
      return;
    }
    setSuccess("");
    setDraft({ bookingId: booking.id, loading: true, recovery: null, roomId: "", reason: "", busy: false, error: "" });
    try {
      const payload = await hotelApi("/api/hotel/bookings/reinstate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ bookingId: booking.id, action: "PREPARE" }),
      });
      setDraft({
        bookingId: booking.id,
        loading: false,
        recovery: payload.recovery,
        roomId: payload.recovery?.suggestedRoomId || "",
        reason: "",
        busy: false,
        error: "",
      });
    } catch (reason) {
      setDraft({ bookingId: booking.id, loading: false, recovery: null, roomId: "", reason: "", busy: false, error: reason?.message || "Unable to prepare recovery" });
    }
  }

  async function confirm(booking) {
    if (!draft.roomId || clean(draft.reason).length < 8) return;
    setDraft((current) => ({ ...current, busy: true, error: "" }));
    setSuccess("");
    try {
      const payload = await hotelApi("/api/hotel/bookings/reinstate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          bookingId: booking.id,
          action: "CONFIRM",
          roomId: draft.roomId,
          reason: clean(draft.reason),
        }),
      });
      setSuccess(`${guestName(booking)} is back in house. Original checkout and financial history were preserved.`);
      setDraft({ bookingId: null, loading: false, recovery: null, roomId: "", reason: "", busy: false, error: "" });
      await load();
      if (payload.recovery?.folioReviewRequired) {
        setSuccess(`${guestName(booking)} is back in house. The folio was already closed, so review future guest charges before posting anything new.`);
      }
    } catch (reason) {
      setDraft((current) => ({ ...current, busy: false, error: reason?.message || "Unable to reinstate stay" }));
    }
  }

  return (
    <HotelSection
      eyebrow="Mistake recovery"
      title="Wrong guest checked out? Put the stay back safely."
      detail="Only checkouts from the current open property business day appear here. Avantiqo re-checks room inventory, housekeeping, Night Audit and folio state before restoring the stay."
    >
      <div className="border-b border-black/[0.05] bg-[#FCFAF6] px-4 py-3 text-[8px] leading-4 text-[#69635D] md:px-5">
        <span className="font-semibold text-[#2E2B28]">Nothing financial is undone automatically.</span> Payments, folio history, booked departure and the original checkout timestamp stay intact.
      </div>
      <HotelError>{error}</HotelError>
      {success ? <div className="border-b border-emerald-900/10 bg-emerald-50 px-4 py-3 text-[8px] leading-4 text-emerald-900 md:px-5">{success}</div> : null}
      {loading ? <HotelEmptyState>Checking today&apos;s completed checkouts…</HotelEmptyState> : !recoverable.length ? (
        <HotelEmptyState>No same-business-day checkout currently needs recovery.</HotelEmptyState>
      ) : (
        <div className="divide-y divide-black/[0.05]">
          {recoverable.map((booking) => {
            const open = draft.bookingId === booking.id;
            const recovery = open ? draft.recovery : null;
            const rooms = [
              ...(recovery?.originalRoomRecoverable && recovery?.originalRoom ? [recovery.originalRoom] : []),
              ...(recovery?.alternativeRooms || []),
            ];
            return (
              <div key={booking.id} className="space-y-3 px-4 py-4 md:px-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-[10px] font-semibold text-[#26221E]">{guestName(booking)}</div>
                    <div className="mt-1 text-[8px] leading-4 text-[#817B73]">
                      {roomLabel(booking.hotel_rooms)} · checked out {booking.actual_check_out_at ? new Date(booking.actual_check_out_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "today"} · property day {booking.operational_day?.businessDate}
                    </div>
                  </div>
                  <HotelSecondaryAction onClick={() => prepare(booking)}>
                    <RotateCcw size={9} />{open ? "Close recovery" : "Wrong checkout / guest still staying"}
                  </HotelSecondaryAction>
                </div>

                {open && draft.loading ? <HotelEmptyState>Re-checking room, housekeeping and day-close truth…</HotelEmptyState> : null}
                {open && draft.error ? <HotelError>{draft.error}</HotelError> : null}
                {open && recovery ? (
                  <div className="rounded-2xl border border-black/[0.07] bg-white p-4 md:p-5">
                    <div className="flex flex-wrap gap-2">
                      <HotelStatusPill
                        value={recovery.originalRoomRecoverable ? "ORIGINAL ROOM SAFE" : "CHOOSE ANOTHER ROOM"}
                        tone={recovery.originalRoomRecoverable ? "good" : "warning"}
                      />
                      {recovery.folioReviewRequired ? <HotelStatusPill value="FOLIO REVIEW" tone="warning" /> : null}
                    </div>
                    <div className="mt-3 text-[8px] leading-4 text-[#69635D]">
                      {recovery.originalRoomRecoverable
                        ? `${roomLabel(recovery.originalRoom)} has not been reused and cleaning has not started.`
                        : recovery.housekeepingStarted
                          ? `Housekeeping has already started in ${roomLabel(recovery.originalRoom)}. Avantiqo will not silently reverse that work; choose another ready room.`
                          : `${roomLabel(recovery.originalRoom)} is no longer safely recoverable. Choose another ready room.`}
                    </div>

                    <div className="mt-4 grid gap-3 md:grid-cols-2">
                      <HotelField label="Room after correction">
                        <select className={hotelInputClass} value={draft.roomId} onChange={(event) => setDraft((current) => ({ ...current, roomId: event.target.value }))}>
                          <option value="">Choose safe room</option>
                          {rooms.map((room) => <option key={room.id} value={room.id}>{roomLabel(room)}{room.id === recovery.originalRoom?.id ? " · original room" : ""}</option>)}
                        </select>
                      </HotelField>
                      <HotelField label="Why are we correcting the checkout?">
                        <textarea
                          className={`${hotelInputClass} min-h-[72px] resize-y`}
                          value={draft.reason}
                          onChange={(event) => setDraft((current) => ({ ...current, reason: event.target.value }))}
                          placeholder="Example: Guest was checked out by mistake and is continuing the same stay."
                          maxLength={1000}
                        />
                      </HotelField>
                    </div>

                    <div className="mt-4 flex flex-wrap items-center gap-2">
                      <HotelPrimaryAction disabled={draft.busy || !draft.roomId || clean(draft.reason).length < 8} onClick={() => confirm(booking)}>
                        <ShieldCheck size={9} />{draft.busy ? "Re-checking & restoring…" : "Put guest back in house"}
                      </HotelPrimaryAction>
                      {recovery.folioReviewRequired ? <HotelSecondaryAction href={hotelWorkspaceHref(organizationId, "hotel-payments")}>Review closed folio</HotelSecondaryAction> : null}
                    </div>
                    <div className="mt-3 text-[7px] leading-4 text-[#918A82]">Confirmation re-checks the same business day and room again. If another staff member changes either first, this correction fails closed.</div>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </HotelSection>
  );
}
