"use client";

export const dynamic = "force-dynamic";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useParams } from "next/navigation";
import { useOrganizationRuntime } from "@/lib/hooks/useOrganizationRuntime";
import { hotelWorkspace } from "@/lib/hotel/workspaces/hotelWorkspace";

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
  const response = await fetch(url, {
    credentials: "include",
    cache: "no-store",
  });
  const payload = await response.json();

  if (!response.ok || payload?.error) {
    throw new Error(payload?.error || "Hotel operations request failed");
  }

  return payload;
}

function MetricCard({ label, value, detail }) {
  return (
    <div className="rounded-[24px] border border-white/10 bg-white/[0.035] p-5">
      <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/35">
        {label}
      </div>
      <div className="mt-3 text-3xl font-semibold text-white">
        {value}
      </div>
      <div className="mt-2 text-xs leading-5 text-white/40">
        {detail}
      </div>
    </div>
  );
}

function OperationCard({ href, title, value, label, detail }) {
  return (
    <Link
      href={href}
      className="group rounded-[24px] border border-white/10 bg-black/25 p-5 transition hover:border-[#D6A66A]/45 hover:bg-[#D6A66A]/[0.06]"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-sm font-semibold text-white">
            {title}
          </div>
          <div className="mt-1 text-xs leading-5 text-white/40">
            {detail}
          </div>
        </div>
        <div className="text-2xl font-semibold text-[#E4C78F]">
          {value}
        </div>
      </div>
      <div className="mt-5 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#D6A66A]">
        {label} →
      </div>
    </Link>
  );
}

export default function HotelOperationsControlPage() {
  const params = useParams();
  const {
    organization,
    loading: organizationLoading,
  } = useOrganizationRuntime();
  const organizationId =
    params?.organizationId || organization?.id || "";

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
      const [
        bookingsPayload,
        roomsPayload,
        housekeepingPayload,
        maintenancePayload,
        conciergePayload,
      ] = await Promise.all([
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
      setError(
        loadError?.message ||
          "Unable to load Hotel Control"
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [organizationId]);

  useEffect(() => {
    loadHotelRuntime();
  }, [loadHotelRuntime]);

  useEffect(() => {
    const onFocus = () => loadHotelRuntime({ silent: true });
    window.addEventListener("focus", onFocus);

    return () => {
      window.removeEventListener("focus", onFocus);
    };
  }, [loadHotelRuntime]);

  const metrics = useMemo(() => {
    const today = localDateKey();
    const activeBookings = bookings.filter((booking) =>
      ["RESERVED", "CHECKED_IN"].includes(
        normalizedStatus(booking.status)
      )
    );
    const checkedInBookings = bookings.filter(
      (booking) => normalizedStatus(booking.status) === "CHECKED_IN"
    );
    const roomStatusCounts = rooms.reduce((counts, room) => {
      const status = normalizedStatus(room.status) || "UNKNOWN";
      counts[status] = Number(counts[status] || 0) + 1;
      return counts;
    }, {});
    const arrivalsToday = bookings.filter(
      (booking) =>
        booking.check_in_date === today &&
        normalizedStatus(booking.status) !== "CANCELLED"
    ).length;
    const departuresToday = bookings.filter(
      (booking) =>
        booking.check_out_date === today &&
        normalizedStatus(booking.status) === "CHECKED_IN"
    ).length;
    const pendingHousekeeping = housekeeping.filter((task) =>
      ["PENDING", "IN_PROGRESS"].includes(
        normalizedStatus(task.task_status)
      )
    ).length;
    const openMaintenance = maintenance.filter((task) =>
      ["PENDING", "IN_PROGRESS"].includes(
        normalizedStatus(task.status)
      )
    ).length;
    const openConcierge = concierge.filter((request) =>
      ["PENDING", "IN_PROGRESS"].includes(
        normalizedStatus(request.status)
      )
    ).length;
    const totalRooms = rooms.length;
    const occupiedRooms = Number(
      roomStatusCounts.OCCUPIED || checkedInBookings.length
    );
    const availableRooms = Number(roomStatusCounts.AVAILABLE || 0);
    const dirtyRooms = Number(roomStatusCounts.DIRTY || 0);
    const occupancy = totalRooms
      ? Math.round((occupiedRooms / totalRooms) * 100)
      : 0;
    const readiness = totalRooms
      ? Math.round((availableRooms / totalRooms) * 100)
      : 0;

    return {
      activeBookings: activeBookings.length,
      totalRooms,
      occupiedRooms,
      availableRooms,
      dirtyRooms,
      occupancy,
      readiness,
      arrivalsToday,
      departuresToday,
      pendingHousekeeping,
      openMaintenance,
      openConcierge,
    };
  }, [bookings, concierge, housekeeping, maintenance, rooms]);

  const base = `/workspace/${encodeURIComponent(organizationId)}/operations`;
  const operationCards = [
    {
      title: "Reservations",
      value: metrics.activeBookings,
      label: "Open Reservations",
      detail: `${metrics.arrivalsToday} arrival(s) scheduled today`,
      href: `${base}/reservations`,
    },
    {
      title: "Front Desk",
      value: metrics.occupiedRooms,
      label: "Open Front Desk",
      detail: `${metrics.departuresToday} departure(s) expected today`,
      href: `${base}/front-desk`,
    },
    {
      title: "Housekeeping",
      value: metrics.pendingHousekeeping,
      label: "Open Housekeeping",
      detail: `${metrics.dirtyRooms} room(s) currently marked dirty`,
      href: `${base}/housekeeping`,
    },
    {
      title: "Maintenance",
      value: metrics.openMaintenance,
      label: "Open Maintenance",
      detail: "Pending and active property work",
      href: `${base}/maintenance`,
    },
    {
      title: "Concierge",
      value: metrics.openConcierge,
      label: "Open Concierge",
      detail: "Pending and active guest-service requests",
      href: `${base}/concierge`,
    },
  ];

  if (organizationLoading || loading) {
    return (
      <section className="mx-auto max-w-[1240px] px-4 py-12 text-white/45">
        Loading Hotel Control...
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-[1240px] px-4 py-6 text-white">
      <div className="rounded-[32px] border border-white/10 bg-white/[0.025] p-5 md:p-7">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.24em] text-[#D6A66A]">
              Hotel Operations
            </div>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight md:text-4xl">
              {organization?.name || hotelWorkspace.hero.title}
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-white/45">
              {hotelWorkspace.ai.insight}
            </p>
          </div>

          <button
            type="button"
            disabled={refreshing}
            onClick={() => loadHotelRuntime({ silent: true })}
            className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2 text-xs font-semibold text-white/65 disabled:opacity-40"
          >
            {refreshing ? "Refreshing..." : "Refresh Control"}
          </button>
        </div>

        {error ? (
          <div className="mt-5 rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-100">
            {error}
          </div>
        ) : null}

        <div className="mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard
            label="Occupancy"
            value={`${metrics.occupancy}%`}
            detail={`${metrics.occupiedRooms} occupied of ${metrics.totalRooms} total rooms`}
          />
          <MetricCard
            label="Room Readiness"
            value={`${metrics.readiness}%`}
            detail={`${metrics.availableRooms} available · ${metrics.dirtyRooms} dirty`}
          />
          <MetricCard
            label="Arrivals Today"
            value={metrics.arrivalsToday}
            detail="Reservations scheduled to begin today"
          />
          <MetricCard
            label="Departures Today"
            value={metrics.departuresToday}
            detail="Checked-in stays scheduled to end today"
          />
        </div>

        <div className="mt-7 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          {operationCards.map((card) => (
            <OperationCard key={card.title} {...card} />
          ))}
        </div>

        <div className="mt-7 grid gap-4 lg:grid-cols-2">
          <div className="rounded-[24px] border border-white/10 bg-black/20 p-5">
            <div className="text-sm font-semibold text-white">
              Current Operating Position
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-2xl border border-white/10 p-4">
                <div className="text-white/35">Active stays</div>
                <div className="mt-2 text-xl font-semibold">
                  {metrics.occupiedRooms}
                </div>
              </div>
              <div className="rounded-2xl border border-white/10 p-4">
                <div className="text-white/35">Available rooms</div>
                <div className="mt-2 text-xl font-semibold">
                  {metrics.availableRooms}
                </div>
              </div>
              <div className="rounded-2xl border border-white/10 p-4">
                <div className="text-white/35">Cleaning workload</div>
                <div className="mt-2 text-xl font-semibold">
                  {metrics.pendingHousekeeping}
                </div>
              </div>
              <div className="rounded-2xl border border-white/10 p-4">
                <div className="text-white/35">Open service work</div>
                <div className="mt-2 text-xl font-semibold">
                  {metrics.openMaintenance + metrics.openConcierge}
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-[24px] border border-[#D6A66A]/20 bg-[#D6A66A]/[0.055] p-5">
            <div className="text-sm font-semibold text-[#F2D9AA]">
              Control Priorities
            </div>
            <div className="mt-4 space-y-3 text-sm leading-6 text-white/55">
              <div>
                Prepare today&apos;s arrivals and confirm room readiness before check-in.
              </div>
              <div>
                Clear dirty rooms and active maintenance work before releasing capacity.
              </div>
              <div>
                Resolve active concierge requests before they become service escalations.
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
