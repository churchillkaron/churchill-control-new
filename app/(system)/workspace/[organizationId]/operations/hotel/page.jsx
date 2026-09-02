"use client";

export const dynamic = "force-dynamic";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { ArrowRight, RefreshCw } from "lucide-react";

import { useOrganizationRuntime } from "@/lib/hooks/useOrganizationRuntime";

function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function normalizedStatus(value) {
  return String(value || "").trim().toUpperCase();
}

async function fetchJson(url) {
  const response = await fetch(url, { credentials: "include", cache: "no-store" });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.error) throw new Error(payload?.error || "Hotel operations request failed");
  return payload;
}

function Metric({ label, value, detail }) {
  return (
    <div className="rounded-2xl border border-black/[0.075] bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.025)]">
      <div className="text-[10px] font-medium uppercase tracking-[0.16em] text-[#8E8A82]">{label}</div>
      <div className="mt-3 text-[27px] font-medium tracking-[-0.04em] text-[#1A1917]">{value}</div>
      <div className="mt-1.5 text-[11px] leading-5 text-[#9A968E]">{detail}</div>
    </div>
  );
}

export default function HotelOperationsControlPage() {
  const params = useParams();
  const { organization, loading: organizationLoading } = useOrganizationRuntime();
  const organizationId = params?.organizationId || organization?.id || "";

  const [bookings, setBookings] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [housekeeping, setHousekeeping] = useState([]);
  const [maintenance, setMaintenance] = useState([]);
  const [concierge, setConcierge] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const loadHotelRuntime = useCallback(async ({ silent = false } = {}) => {
    if (!organizationId) return;
    if (silent) setRefreshing(true);
    else setLoading(true);

    try {
      const query = `?organizationId=${encodeURIComponent(organizationId)}`;
      const [bookingsPayload, roomsPayload, housekeepingPayload, maintenancePayload, conciergePayload] = await Promise.all([
        fetchJson(`/api/hotel/bookings/list${query}`),
        fetchJson(`/api/hotel/rooms/list${query}`),
        fetchJson(`/api/hotel/housekeeping/list${query}`),
        fetchJson(`/api/hotel/maintenance/list${query}`),
        fetchJson(`/api/hotel/concierge/list${query}`),
      ]);

      setBookings(bookingsPayload.bookings || []);
      setRooms(roomsPayload.rooms || []);
      setHousekeeping(housekeepingPayload.tasks || []);
      setMaintenance(maintenancePayload.tasks || []);
      setConcierge(conciergePayload.requests || []);
      setError(null);
    } catch (loadError) {
      setError(loadError?.message || "Unable to load Hotel Control");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [organizationId]);

  useEffect(() => { loadHotelRuntime(); }, [loadHotelRuntime]);
  useEffect(() => {
    const onFocus = () => loadHotelRuntime({ silent: true });
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [loadHotelRuntime]);

  const metrics = useMemo(() => {
    const today = localDateKey();
    const checkedIn = bookings.filter((booking) => normalizedStatus(booking.status) === "CHECKED_IN");
    const activeBookings = bookings.filter((booking) => ["RESERVED", "CHECKED_IN"].includes(normalizedStatus(booking.status)));
    const roomStatusCounts = rooms.reduce((counts, room) => {
      const status = normalizedStatus(room.status) || "UNKNOWN";
      counts[status] = Number(counts[status] || 0) + 1;
      return counts;
    }, {});
    const arrivalsToday = bookings.filter((booking) => booking.check_in_date === today && normalizedStatus(booking.status) !== "CANCELLED").length;
    const departuresToday = bookings.filter((booking) => booking.check_out_date === today && normalizedStatus(booking.status) === "CHECKED_IN").length;
    const pendingHousekeeping = housekeeping.filter((task) => ["PENDING", "IN_PROGRESS"].includes(normalizedStatus(task.task_status))).length;
    const openMaintenance = maintenance.filter((task) => ["PENDING", "IN_PROGRESS"].includes(normalizedStatus(task.status))).length;
    const openConcierge = concierge.filter((request) => ["PENDING", "IN_PROGRESS"].includes(normalizedStatus(request.status))).length;
    const totalRooms = rooms.length;
    const occupiedRooms = Number(roomStatusCounts.OCCUPIED || checkedIn.length);
    const availableRooms = Number(roomStatusCounts.AVAILABLE || 0);
    const dirtyRooms = Number(roomStatusCounts.DIRTY || 0);

    return {
      activeBookings: activeBookings.length,
      totalRooms,
      occupiedRooms,
      availableRooms,
      dirtyRooms,
      occupancy: totalRooms ? Math.round((occupiedRooms / totalRooms) * 100) : 0,
      readiness: totalRooms ? Math.round((availableRooms / totalRooms) * 100) : 0,
      arrivalsToday,
      departuresToday,
      pendingHousekeeping,
      openMaintenance,
      openConcierge,
    };
  }, [bookings, concierge, housekeeping, maintenance, rooms]);

  const base = `/workspace/${encodeURIComponent(organizationId)}/operations`;
  const flow = [
    { id: "reservations", label: "Reservations", value: metrics.activeBookings, detail: `${metrics.arrivalsToday} arrivals today`, route: `${base}/reservations` },
    { id: "frontdesk", label: "Front Desk", value: metrics.occupiedRooms, detail: `${metrics.departuresToday} departures today`, route: `${base}/front-desk` },
    { id: "housekeeping", label: "Housekeeping", value: metrics.pendingHousekeeping, detail: `${metrics.dirtyRooms} rooms marked dirty`, route: `${base}/housekeeping` },
    { id: "maintenance", label: "Maintenance", value: metrics.openMaintenance, detail: "Open property work", route: `${base}/maintenance` },
    { id: "concierge", label: "Guest Requests", value: metrics.openConcierge, detail: "Open concierge/service requests", route: `${base}/concierge` },
  ];

  if (organizationLoading || loading) {
    return <div className="min-h-[420px] bg-[#F7F6F3] p-8 text-sm text-[#77736C]">Preparing Hotel Control...</div>;
  }

  return (
    <main className="min-h-[calc(100vh-61px)] bg-[#F7F6F3] px-4 py-6 text-[#191919] md:px-6 lg:px-8">
      <div className="mx-auto max-w-[1640px]">
        <header className="rounded-[26px] border border-black/[0.075] bg-white p-6 shadow-[0_12px_38px_rgba(31,27,20,0.055)] md:p-7">
          <div className="flex flex-wrap items-start justify-between gap-5">
            <div>
              <div className="text-[10px] font-medium uppercase tracking-[0.22em] text-[#A37849]">Hotel Operations</div>
              <h1 className="mt-2 text-[32px] font-semibold tracking-[-0.04em] text-[#1B1A18] md:text-[36px]">Property Control</h1>
              <p className="mt-2.5 max-w-3xl text-[13px] leading-6 text-[#6F6B64]">
                {organization?.name || "Property"} · Coordinate arrivals, room readiness, in-house guests, housekeeping, maintenance and guest requests from one operating desk.
              </p>
            </div>
            <button
              type="button"
              disabled={refreshing}
              onClick={() => loadHotelRuntime({ silent: true })}
              className="inline-flex items-center gap-2 rounded-xl border border-black/[0.09] bg-white px-4 py-2.5 text-[12px] text-[#5E5A54] hover:border-[#D6A66A]/45 hover:text-[#8D6338] disabled:opacity-40"
            >
              <RefreshCw size={13} className={refreshing ? "animate-spin" : ""} />
              {refreshing ? "Refreshing" : "Refresh"}
            </button>
          </div>

          <div className="mt-6 flex flex-wrap gap-2 border-t border-black/[0.07] pt-5">
            <Link href={`${base}/front-desk`} className="inline-flex items-center gap-2 rounded-xl bg-[#1D1B18] px-4 py-2.5 text-[12px] font-medium text-white">Open Front Desk <ArrowRight size={13} /></Link>
            <Link href={`${base}/housekeeping`} className="inline-flex items-center gap-2 rounded-xl border border-black/[0.09] bg-white px-4 py-2.5 text-[12px] font-medium text-[#4E4A44]">Housekeeping</Link>
            <Link href={`${base}/reservations`} className="inline-flex items-center gap-2 rounded-xl border border-black/[0.09] bg-white px-4 py-2.5 text-[12px] font-medium text-[#4E4A44]">Reservations</Link>
          </div>
        </header>

        {error ? <div className="mt-4 rounded-2xl border border-[#B36B52]/20 bg-[#B36B52]/[0.06] px-4 py-3 text-[12px] text-[#8B4937]">{error}</div> : null}

        <section className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          <Metric label="Occupancy" value={`${metrics.occupancy}%`} detail={`${metrics.occupiedRooms} of ${metrics.totalRooms} occupied`} />
          <Metric label="Room readiness" value={`${metrics.readiness}%`} detail={`${metrics.availableRooms} available rooms`} />
          <Metric label="Arrivals today" value={metrics.arrivalsToday} detail="Guests due to arrive" />
          <Metric label="Departures today" value={metrics.departuresToday} detail="Guests due to depart" />
          <Metric label="Housekeeping" value={metrics.pendingHousekeeping} detail="Rooms/tasks still open" />
          <Metric label="Guest/service issues" value={metrics.openMaintenance + metrics.openConcierge} detail="Maintenance + guest requests" />
        </section>

        <section className="mt-5 rounded-[24px] border border-black/[0.075] bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.025)]">
          <div className="border-b border-black/[0.07] pb-4">
            <div className="text-[10px] font-medium uppercase tracking-[0.17em] text-[#8D8982]">Live property workflow</div>
            <h2 className="mt-1.5 text-[20px] font-medium tracking-[-0.025em] text-[#1C1B19]">Today at the property</h2>
          </div>

          <div className="grid gap-x-5 md:grid-cols-2 xl:grid-cols-5">
            {flow.map((item, index) => (
              <Link key={item.id} href={item.route} className="group border-b border-black/[0.06] py-4 xl:border-b-0">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full border border-black/[0.08] bg-[#FBFAF8] text-[11px] font-medium text-[#77736C]">{index + 1}</div>
                  <div className="text-[22px] font-medium tracking-[-0.03em] text-[#1B1A18]">{item.value}</div>
                </div>
                <div className="mt-4 text-[13px] font-medium text-[#312F2B] group-hover:text-[#8D6338]">{item.label}</div>
                <div className="mt-1 text-[11px] leading-5 text-[#96928A]">{item.detail}</div>
                <div className="mt-3 inline-flex items-center gap-1.5 text-[10px] font-medium text-[#A37849]">Open workspace <ArrowRight size={11} /></div>
              </Link>
            ))}
          </div>
        </section>

        <section className="mt-5 grid gap-4 lg:grid-cols-2">
          <div className="rounded-[24px] border border-black/[0.075] bg-white p-5">
            <div className="text-[10px] font-medium uppercase tracking-[0.17em] text-[#8D8982]">Capacity position</div>
            <div className="mt-4 grid grid-cols-2 gap-3">
              {[
                ["In-house", metrics.occupiedRooms],
                ["Available", metrics.availableRooms],
                ["Dirty", metrics.dirtyRooms],
                ["Active bookings", metrics.activeBookings],
              ].map(([label, value]) => (
                <div key={label} className="rounded-2xl border border-black/[0.07] bg-[#FBFAF8] p-4">
                  <div className="text-[10px] text-[#8D8982]">{label}</div>
                  <div className="mt-2 text-[22px] font-medium text-[#1B1A18]">{value}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[24px] border border-[#D6A66A]/20 bg-[#D6A66A]/[0.05] p-5">
            <div className="text-[10px] font-medium uppercase tracking-[0.17em] text-[#9A744B]">Control priorities</div>
            <div className="mt-4 space-y-3 text-[12px] leading-6 text-[#6F604F]">
              <div>Prepare today&apos;s arrivals and confirm room readiness before check-in.</div>
              <div>Clear dirty rooms and maintenance blockers before releasing capacity.</div>
              <div>Resolve guest requests before they become service escalations.</div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
