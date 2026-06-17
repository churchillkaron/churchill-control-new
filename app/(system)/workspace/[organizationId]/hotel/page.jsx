"use client";

import { useEffect, useMemo, useState } from "react";
import { useOrganizationRuntime } from "@/lib/hooks/useOrganizationRuntime";

export default function HotelWorkspacePage() {
  const { organization, loading: organizationLoading } = useOrganizationRuntime();
  const organizationId = organization?.id || "";

  const [bookings, setBookings] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [housekeeping, setHousekeeping] = useState([]);
  const [maintenance, setMaintenance] = useState([]);
  const [concierge, setConcierge] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!organizationId) return;

    async function loadHotelData() {
      setLoading(true);
      try {
        const query = `?organizationId=${organizationId}`;
        const [
          bookingsRes,
          roomsRes,
          housekeepingRes,
          maintenanceRes,
          conciergeRes,
        ] = await Promise.all([
          fetch(`/api/hotel/bookings/list${query}`).then(r => r.json()).catch(() => ({})),
          fetch(`/api/hotel/rooms/list${query}`).then(r => r.json()).catch(() => ({})),
          fetch(`/api/hotel/housekeeping/list${query}`).then(r => r.json()).catch(() => ({})),
          fetch(`/api/hotel/maintenance/list${query}`).then(r => r.json()).catch(() => ({})),
          fetch(`/api/hotel/concierge/list${query}`).then(r => r.json()).catch(() => ({})),
        ]);

        setBookings(bookingsRes.bookings || []);
        setRooms(roomsRes.rooms || []);
        setHousekeeping(housekeepingRes.tasks || []);
        setMaintenance(maintenanceRes.tasks || []);
        setConcierge(conciergeRes.requests || []);
      } finally {
        setLoading(false);
      }
    }

    loadHotelData();
  }, [organizationId]);

  const stats = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const totalRooms = rooms.length;
    const occupiedRooms = bookings.filter(b => b.status === "CHECKED_IN").length;
    const arrivalsToday = bookings.filter(b => b.check_in_date === today).length;
    const departuresToday = bookings.filter(b => b.check_out_date === today).length;
    const pendingHousekeeping = housekeeping.filter(t => t.task_status !== "COMPLETED").length;
    const openMaintenance = maintenance.filter(t => t.status !== "COMPLETED").length;
    const openConcierge = concierge.filter(r => r.status !== "COMPLETED").length;
    const availableRooms = Math.max(totalRooms - occupiedRooms, 0);
    const occupancy = totalRooms > 0 ? Math.round((occupiedRooms / totalRooms) * 100) : 0;
    const revenueToday = bookings.reduce((sum, b) => sum + Number(b.total_amount || b.amount || 0), 0);
    const adr = occupiedRooms > 0 ? Math.round(revenueToday / occupiedRooms) : 0;
    const revpar = totalRooms > 0 ? Math.round(revenueToday / totalRooms) : 0;

    return {
      totalRooms,
      occupiedRooms,
      availableRooms,
      occupancy,
      arrivalsToday,
      departuresToday,
      pendingHousekeeping,
      openMaintenance,
      openConcierge,
      revenueToday,
      adr,
      revpar,
      guestScore: 4.8,
    };
  }, [bookings, rooms, housekeeping, maintenance, concierge]);

  const operationCards = [
    { title: "Reservations", value: stats.arrivalsToday, label: "Arrivals Today", href: `/workspace/${organizationId}/hotel/reservations` },
    { title: "Front Desk", value: stats.occupiedRooms, label: "Active Guests", href: `/workspace/${organizationId}/hotel/frontdesk` },
    { title: "Housekeeping", value: stats.pendingHousekeeping, label: "Rooms Pending", href: `/workspace/${organizationId}/hotel/housekeeping` },
    { title: "Maintenance", value: stats.openMaintenance, label: "Open Tickets", href: `/workspace/${organizationId}/hotel/maintenance` },
    { title: "Concierge", value: stats.openConcierge, label: "Requests Open", href: `/workspace/${organizationId}/hotel/concierge` },
  ];

  if (organizationLoading) return <div className="p-8 text-white">Loading organization...</div>;

  return (
    <div className="min-h-screen bg-gray-900 p-6 font-sans text-white">
      <header className="mb-8">
        <div className="bg-black/30 backdrop-blur-xl border border-white/10 rounded-3xl p-6 shadow-lg">
          <h1 className="text-4xl font-bold text-yellow-400 tracking-wide">{organization?.name || "Luxury Hotel Command Center"}</h1>
          <p className="text-white/70 mt-2">Enterprise Hotel Management Dashboard</p>
        </div>
      </header>

      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-6 mb-12">
        {operationCards.map(card => (
          <a key={card.title} href={card.href} className={`backdrop-blur-xl bg-black/30 border border-white/10 rounded-3xl p-6 flex flex-col items-center justify-center shadow-lg hover:scale-105 transition-transform`}>
            <span className="text-yellow-400 text-xl font-semibold">{card.label}</span>
            <span className="mt-2 text-white text-3xl font-bold">{card.value}</span>
          </a>
        ))}
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="backdrop-blur-xl bg-black/30 border border-white/10 rounded-3xl p-6 shadow-lg">
          <h2 className="text-yellow-400 text-2xl font-semibold mb-4">Occupancy Stats</h2>
          <p className="text-white/70">Rooms: {stats.totalRooms} | Occupied: {stats.occupiedRooms} | Available: {stats.availableRooms}</p>
          <p className="text-white/70">Arrivals Today: {stats.arrivalsToday} | Departures Today: {stats.departuresToday}</p>
          <p className="text-white/70">ADR: THB {stats.adr} | RevPAR: THB {stats.revpar} | Occupancy: {stats.occupancy}%</p>
        </div>

        <div className="backdrop-blur-xl bg-black/30 border border-white/10 rounded-3xl p-6 shadow-lg">
          <h2 className="text-yellow-400 text-2xl font-semibold mb-4">Guest Score</h2>
          <p className="text-white/70 text-4xl font-bold">{stats.guestScore}</p>
        </div>
      </section>
    </div>
  );
}
