"use client";

export const dynamic = "force-dynamic";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { LogIn, LogOut, RefreshCw } from "lucide-react";
import { useBusinessContext } from "@/app/providers/BusinessContextProvider";

function dateValue(value) {
  return String(value || "").slice(0, 10);
}

function guestName(booking) {
  return (
    booking?.hotel_guests?.full_name ||
    [
      booking?.hotel_guests?.first_name,
      booking?.hotel_guests?.last_name,
    ]
      .filter(Boolean)
      .join(" ") ||
    "Guest"
  );
}

export default function OperationsFrontDeskPage() {
  const params = useParams();
  const router = useRouter();
  const businessContext = useBusinessContext() || {};
  const organization = businessContext.organization || null;
  const organizationId =
    params?.organizationId ||
    businessContext.organization_id ||
    organization?.id ||
    null;

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
      const response = await fetch(
        `/api/hotel/bookings/list?organizationId=${encodeURIComponent(organizationId)}`,
        {
          cache: "no-store",
          credentials: "include",
        }
      );
      const result = await response.json();

      if (!response.ok || result.success === false) {
        throw new Error(result.error || "Unable to load Front Desk");
      }

      setBookings(result.bookings || []);
    } catch (loadError) {
      setError(loadError?.message || "Unable to load Front Desk");
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    loadBookings();
  }, [loadBookings]);

  const today = new Date().toISOString().slice(0, 10);

  const filteredBookings = useMemo(() => {
    return bookings.filter((booking) => {
      const status = String(booking.status || "").toUpperCase();

      if (filter === "ARRIVALS") {
        return status === "RESERVED" && dateValue(booking.check_in_date) <= today;
      }

      if (filter === "IN_HOUSE") {
        return status === "CHECKED_IN";
      }

      if (filter === "DEPARTURES") {
        return status === "CHECKED_IN" && dateValue(booking.check_out_date) <= today;
      }

      return true;
    });
  }, [bookings, filter, today]);

  const summary = useMemo(
    () => ({
      arrivals: bookings.filter(
        (booking) =>
          String(booking.status || "").toUpperCase() === "RESERVED" &&
          dateValue(booking.check_in_date) <= today
      ).length,
      inHouse: bookings.filter(
        (booking) =>
          String(booking.status || "").toUpperCase() === "CHECKED_IN"
      ).length,
      departures: bookings.filter(
        (booking) =>
          String(booking.status || "").toUpperCase() === "CHECKED_IN" &&
          dateValue(booking.check_out_date) <= today
      ).length,
    }),
    [bookings, today]
  );

  async function transitionBooking(booking, action) {
    if (!organizationId || !booking?.id) return;

    setTransitioningId(booking.id);
    setError(null);

    try {
      const endpoint =
        action === "CHECK_IN"
          ? "/api/hotel/bookings/check-in"
          : "/api/hotel/bookings/check-out";
      const response = await fetch(endpoint, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId,
          bookingId: booking.id,
        }),
      });
      const result = await response.json();

      if (!response.ok || result.success === false) {
        throw new Error(result.error || "Front Desk transition failed");
      }

      await loadBookings();
    } catch (transitionError) {
      setError(transitionError?.message || "Front Desk transition failed");
    } finally {
      setTransitioningId(null);
    }
  }

  return (
    <main className="min-h-screen bg-black px-6 py-8 text-white">
      <div className="mx-auto max-w-[1500px]">
        <header className="rounded-[34px] border border-white/10 bg-white/[0.035] p-7">
          <div className="flex flex-wrap items-start justify-between gap-5">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-[#D6A66A]">
                Operations Application
              </p>
              <h1 className="mt-3 text-4xl font-semibold">Front Desk</h1>
              <p className="mt-2 text-sm text-white/45">
                Control arrivals, in-house guests, departures and room readiness.
              </p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() =>
                  router.push(`/workspace/${organizationId}/operations/reservations`)
                }
                className="rounded-xl border border-[#D6A66A]/40 px-4 py-2 text-sm text-[#F3D7A2]"
              >
                Open Reservations
              </button>
              <button
                type="button"
                onClick={loadBookings}
                disabled={loading}
                className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-4 py-2 text-sm text-white/60 disabled:opacity-35"
              >
                <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
                Refresh
              </button>
            </div>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            <button
              type="button"
              onClick={() => setFilter("ARRIVALS")}
              className={filter === "ARRIVALS" ? "rounded-2xl border border-[#D6A66A]/45 bg-[#D6A66A]/10 p-4 text-left" : "rounded-2xl border border-white/10 bg-black/20 p-4 text-left"}
            >
              <div className="text-xs uppercase tracking-[0.16em] text-white/40">Arrivals</div>
              <div className="mt-2 text-3xl font-semibold">{summary.arrivals}</div>
            </button>
            <button
              type="button"
              onClick={() => setFilter("IN_HOUSE")}
              className={filter === "IN_HOUSE" ? "rounded-2xl border border-[#D6A66A]/45 bg-[#D6A66A]/10 p-4 text-left" : "rounded-2xl border border-white/10 bg-black/20 p-4 text-left"}
            >
              <div className="text-xs uppercase tracking-[0.16em] text-white/40">In House</div>
              <div className="mt-2 text-3xl font-semibold">{summary.inHouse}</div>
            </button>
            <button
              type="button"
              onClick={() => setFilter("DEPARTURES")}
              className={filter === "DEPARTURES" ? "rounded-2xl border border-[#D6A66A]/45 bg-[#D6A66A]/10 p-4 text-left" : "rounded-2xl border border-white/10 bg-black/20 p-4 text-left"}
            >
              <div className="text-xs uppercase tracking-[0.16em] text-white/40">Departures</div>
              <div className="mt-2 text-3xl font-semibold">{summary.departures}</div>
            </button>
          </div>
        </header>

        {error ? (
          <div className="mt-5 rounded-2xl border border-red-400/20 bg-red-500/10 p-4 text-red-100">
            {error}
          </div>
        ) : null}

        <section className="mt-6 rounded-[30px] border border-white/10 bg-white/[0.03] p-6">
          {loading ? (
            <div className="py-16 text-center text-white/35">Loading Front Desk...</div>
          ) : filteredBookings.length ? (
            <div className="grid gap-4 lg:grid-cols-2">
              {filteredBookings.map((booking) => {
                const status = String(booking.status || "").toUpperCase();
                const transitioning = transitioningId === booking.id;

                return (
                  <article
                    key={booking.id}
                    className="rounded-2xl border border-white/10 bg-black/20 p-5"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="text-xl font-semibold">{guestName(booking)}</div>
                        <div className="mt-1 text-sm text-white/40">
                          Room {booking.hotel_rooms?.room_number || "Unassigned"}
                          {booking.hotel_rooms?.room_type
                            ? ` · ${booking.hotel_rooms.room_type}`
                            : ""}
                        </div>
                      </div>
                      <div className="text-xs font-semibold text-[#D6A66A]">{status}</div>
                    </div>

                    <div className="mt-5 grid grid-cols-2 gap-3 text-sm text-white/50">
                      <div>
                        <div className="text-xs uppercase tracking-[0.14em] text-white/30">Arrival</div>
                        <div className="mt-1">{dateValue(booking.check_in_date)}</div>
                      </div>
                      <div>
                        <div className="text-xs uppercase tracking-[0.14em] text-white/30">Departure</div>
                        <div className="mt-1">{dateValue(booking.check_out_date)}</div>
                      </div>
                    </div>

                    {status === "RESERVED" ? (
                      <button
                        type="button"
                        disabled={transitioning}
                        onClick={() => transitionBooking(booking, "CHECK_IN")}
                        className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-[#D6A66A] py-4 text-sm font-semibold text-black disabled:opacity-35"
                      >
                        <LogIn size={17} />
                        {transitioning ? "Checking In..." : "Check In"}
                      </button>
                    ) : null}

                    {status === "CHECKED_IN" ? (
                      <button
                        type="button"
                        disabled={transitioning}
                        onClick={() => transitionBooking(booking, "CHECK_OUT")}
                        className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-[#D6A66A]/40 py-4 text-sm font-semibold text-[#F3D7A2] disabled:opacity-35"
                      >
                        <LogOut size={17} />
                        {transitioning ? "Checking Out..." : "Check Out"}
                      </button>
                    ) : null}
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="py-16 text-center text-white/35">No bookings in this Front Desk queue.</div>
          )}
        </section>
      </div>
    </main>
  );
}
