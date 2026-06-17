"use client";

import { useEffect, useState } from "react";
import { useOrganizationRuntime } from "@/lib/hooks/useOrganizationRuntime";

export default function ReservationsPage() {
  const { organization, loading: organizationLoading } = useOrganizationRuntime();
  const organizationId = organization?.id || "";

  const [properties, setProperties] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [guests, setGuests] = useState([]);
  const [form, setForm] = useState({
    propertyId: "",
    roomId: "",
    guestId: "",
    check_in_date: "",
    check_out_date: "",
  });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!organizationId) return;
    async function loadData() {
      const [propertiesRes, guestsRes, roomsRes] = await Promise.all([
        fetch(`/api/hotel/properties/list?organizationId=${organizationId}`).then(r => r.json()),
        fetch(`/api/hotel/guests/list?organizationId=${organizationId}`).then(r => r.json()),
        fetch(`/api/hotel/rooms/list?organizationId=${organizationId}`).then(r => r.json()),
      ]);
      setProperties(propertiesRes.properties || []);
      setGuests(guestsRes.guests || []);
      setRooms(roomsRes.rooms || []);
    }
    loadData();
  }, [organizationId]);

  async function createReservation() {
    if (!organizationId) {
      setMessage("Organization not loaded");
      return;
    }
    setLoading(true);
    setMessage("");
    const res = await fetch("/api/hotel/bookings/create", {
      method: "POST",
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
    const data = await res.json();
    if (!res.ok) {
      setMessage(data.error || "Reservation failed");
      setLoading(false);
      return;
    }
    setMessage("Reservation created");
    setLoading(false);
  }

  if (organizationLoading) return <div className="p-8 text-white">Loading organization...</div>;

  return (
    <div className="p-4 rounded-2xl bg-black/40 border border-white/10 shadow-lg space-y-4">
      <h2 className="text-2xl font-bold mb-2">Create Reservation</h2>
      <div className="grid gap-4">
        <select
          value={form.propertyId}
          onChange={(e) => setForm({ ...form, propertyId: e.target.value, roomId: "" })}
          className="rounded-2xl border border-white/10 bg-white/10 p-4 text-white outline-none"
        >
          <option value="">Select Property</option>
          {properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>

        <select
          value={form.roomId}
          onChange={(e) => setForm({ ...form, roomId: e.target.value })}
          className="rounded-2xl border border-white/10 bg-white/10 p-4 text-white outline-none"
        >
          <option value="">Select Room</option>
          {rooms.filter(r => !form.propertyId || r.property_id === form.propertyId)
            .map(r => <option key={r.id} value={r.id}>{r.room_number} - {r.room_type}</option>)}
        </select>

        <select
          value={form.guestId}
          onChange={(e) => setForm({ ...form, guestId: e.target.value })}
          className="rounded-2xl border border-white/10 bg-white/10 p-4 text-white outline-none"
        >
          <option value="">Select Guest</option>
          {guests.map((g) => <option key={g.id} value={g.id}>{g.full_name}</option>)}
        </select>

        <div className="grid gap-4 md:grid-cols-2">
          <input type="date" value={form.check_in_date} onChange={(e) => setForm({ ...form, check_in_date: e.target.value })} className="rounded-2xl border border-white/10 bg-white/10 p-4 text-white outline-none" />
          <input type="date" value={form.check_out_date} onChange={(e) => setForm({ ...form, check_out_date: e.target.value })} className="rounded-2xl border border-white/10 bg-white/10 p-4 text-white outline-none" />
        </div>

        <button onClick={createReservation} disabled={loading} className="rounded-2xl bg-white px-6 py-4 font-semibold text-black transition hover:bg-white/80 disabled:opacity-50">
          {loading ? "Creating..." : "Create Reservation"}
        </button>

        {message && <div className="rounded-2xl border border-white/10 bg-white/10 p-4 text-sm text-white/80">{message}</div>}
      </div>
    </div>
  );
}
