"use client";

export const dynamic = "force-dynamic";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { CalendarDays, RefreshCw } from "lucide-react";
import { useBusinessContext } from "@/app/providers/BusinessContextProvider";

function dateValue(value) {
  return String(value || "").slice(0, 10);
}

export default function OperationsReservationsPage() {
  const params = useParams();
  const router = useRouter();
  const businessContext = useBusinessContext() || {};
  const organization = businessContext.organization || null;
  const organizationId =
    params?.organizationId ||
    businessContext.organization_id ||
    organization?.id ||
    null;

  const [properties, setProperties] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [guests, setGuests] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [form, setForm] = useState({
    propertyId: "",
    roomId: "",
    guestId: "",
    check_in_date: "",
    check_out_date: "",
  });
  const [loading, setLoading] = useState(true);
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
        fetch(`/api/hotel/properties/list${query}`, {
          cache: "no-store",
          credentials: "include",
        }),
        fetch(`/api/hotel/rooms/list${query}`, {
          cache: "no-store",
          credentials: "include",
        }),
        fetch(`/api/hotel/guests/list${query}`, {
          cache: "no-store",
          credentials: "include",
        }),
        fetch(`/api/hotel/bookings/list${query}`, {
          cache: "no-store",
          credentials: "include",
        }),
      ]);

      const results = await Promise.all(
        responses.map(async (response) => {
          const result = await response.json();
          if (!response.ok || result.success === false) {
            throw new Error(result.error || "Unable to load reservations workspace");
          }
          return result;
        })
      );

      setProperties(results[0].properties || []);
      setRooms(results[1].rooms || []);
      setGuests(results[2].guests || []);
      setBookings(results[3].bookings || []);
    } catch (loadError) {
      setError(loadError?.message || "Unable to load reservations workspace");
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    loadWorkspace();
  }, [loadWorkspace]);

  const availableRooms = useMemo(
    () =>
      rooms.filter(
        (room) =>
          !form.propertyId ||
          String(room.property_id || "") === String(form.propertyId)
      ),
    [form.propertyId, rooms]
  );

  const upcomingBookings = useMemo(
    () =>
      bookings
        .filter((booking) =>
          ["RESERVED", "CHECKED_IN"].includes(
            String(booking.status || "").toUpperCase()
          )
        )
        .sort((a, b) =>
          dateValue(a.check_in_date).localeCompare(dateValue(b.check_in_date))
        ),
    [bookings]
  );

  async function createReservation() {
    if (!organizationId) return;

    if (
      !form.propertyId ||
      !form.roomId ||
      !form.guestId ||
      !form.check_in_date ||
      !form.check_out_date
    ) {
      setError("Property, room, guest and stay dates are required");
      return;
    }

    if (form.check_out_date <= form.check_in_date) {
      setError("Check-out must be after check-in");
      return;
    }

    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch("/api/hotel/bookings/create", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId,
          propertyId: form.propertyId,
          roomId: form.roomId,
          guestId: form.guestId,
          check_in_date: form.check_in_date,
          check_out_date: form.check_out_date,
        }),
      });
      const result = await response.json();

      if (!response.ok || result.success === false) {
        throw new Error(result.error || "Reservation failed");
      }

      setForm({
        propertyId: "",
        roomId: "",
        guestId: "",
        check_in_date: "",
        check_out_date: "",
      });
      setMessage("Reservation created");
      await loadWorkspace();
    } catch (saveError) {
      setError(saveError?.message || "Reservation failed");
    } finally {
      setSaving(false);
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
              <h1 className="mt-3 text-4xl font-semibold">Reservations</h1>
              <p className="mt-2 text-sm text-white/45">
                Create bookings, control stay dates and prepare arrivals for Front Desk.
              </p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() =>
                  router.push(`/workspace/${organizationId}/operations/front-desk`)
                }
                className="rounded-xl border border-[#D6A66A]/40 px-4 py-2 text-sm text-[#F3D7A2]"
              >
                Open Front Desk
              </button>
              <button
                type="button"
                onClick={loadWorkspace}
                disabled={loading}
                className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-4 py-2 text-sm text-white/60 disabled:opacity-35"
              >
                <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
                Refresh
              </button>
            </div>
          </div>
        </header>

        {error ? (
          <div className="mt-5 rounded-2xl border border-red-400/20 bg-red-500/10 p-4 text-red-100">
            {error}
          </div>
        ) : null}
        {message ? (
          <div className="mt-5 rounded-2xl border border-emerald-400/20 bg-emerald-500/10 p-4 text-emerald-100">
            {message}
          </div>
        ) : null}

        <section className="mt-6 grid gap-6 xl:grid-cols-[0.85fr_1.15fr]">
          <div className="rounded-[30px] border border-white/10 bg-white/[0.03] p-6">
            <div className="flex items-center gap-3">
              <CalendarDays className="text-[#D6A66A]" size={21} />
              <h2 className="text-xl font-semibold">Create Reservation</h2>
            </div>

            <div className="mt-5 grid gap-3">
              <select
                value={form.propertyId}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    propertyId: event.target.value,
                    roomId: "",
                  }))
                }
                className="rounded-xl border border-white/10 bg-black px-4 py-3"
              >
                <option value="">Select property</option>
                {properties.map((property) => (
                  <option key={property.id} value={property.id}>
                    {property.name || property.property_name}
                  </option>
                ))}
              </select>

              <select
                value={form.roomId}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    roomId: event.target.value,
                  }))
                }
                className="rounded-xl border border-white/10 bg-black px-4 py-3"
              >
                <option value="">Select room</option>
                {availableRooms.map((room) => (
                  <option key={room.id} value={room.id}>
                    {room.room_number} · {room.room_type || "Room"}
                  </option>
                ))}
              </select>

              <select
                value={form.guestId}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    guestId: event.target.value,
                  }))
                }
                className="rounded-xl border border-white/10 bg-black px-4 py-3"
              >
                <option value="">Select guest</option>
                {guests.map((guest) => (
                  <option key={guest.id} value={guest.id}>
                    {guest.full_name ||
                      [guest.first_name, guest.last_name].filter(Boolean).join(" ")}
                  </option>
                ))}
              </select>

              <div className="grid gap-3 md:grid-cols-2">
                <input
                  type="date"
                  value={form.check_in_date}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      check_in_date: event.target.value,
                    }))
                  }
                  className="rounded-xl border border-white/10 bg-black px-4 py-3"
                />
                <input
                  type="date"
                  value={form.check_out_date}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      check_out_date: event.target.value,
                    }))
                  }
                  className="rounded-xl border border-white/10 bg-black px-4 py-3"
                />
              </div>

              <button
                type="button"
                onClick={createReservation}
                disabled={saving}
                className="rounded-2xl bg-[#D6A66A] py-4 text-sm font-semibold text-black disabled:opacity-35"
              >
                {saving ? "Creating..." : "Create Reservation"}
              </button>
            </div>
          </div>

          <div className="rounded-[30px] border border-white/10 bg-white/[0.03] p-6">
            <h2 className="text-xl font-semibold">Upcoming and Active Stays</h2>
            <div className="mt-5 space-y-3">
              {loading ? (
                <div className="py-10 text-center text-white/35">Loading bookings...</div>
              ) : upcomingBookings.length ? (
                upcomingBookings.map((booking) => (
                  <div
                    key={booking.id}
                    className="rounded-2xl border border-white/10 bg-black/20 p-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="font-semibold">
                          {booking.hotel_guests?.full_name || "Guest"}
                        </div>
                        <div className="mt-1 text-xs text-white/40">
                          Room {booking.hotel_rooms?.room_number || "Unassigned"}
                        </div>
                      </div>
                      <div className="text-xs font-semibold text-[#D6A66A]">
                        {booking.status || "RESERVED"}
                      </div>
                    </div>
                    <div className="mt-4 text-sm text-white/50">
                      {dateValue(booking.check_in_date)} → {dateValue(booking.check_out_date)}
                    </div>
                  </div>
                ))
              ) : (
                <div className="py-10 text-center text-white/35">No upcoming bookings.</div>
              )}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
