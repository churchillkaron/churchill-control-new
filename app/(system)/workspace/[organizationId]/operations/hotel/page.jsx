"use client";

export const dynamic = "force-dynamic";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { ArrowRight, CheckCircle2, RefreshCw } from "lucide-react";

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
import { useOrganizationRuntime } from "@/lib/hooks/useOrganizationRuntime";

function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(dateKey, days) {
  const value = new Date(`${dateKey}T12:00:00`);
  value.setDate(value.getDate() + days);
  return localDateKey(value);
}

function status(value) {
  return String(value || "").trim().toUpperCase();
}

async function fetchJson(url) {
  const response = await fetch(url, { credentials: "include", cache: "no-store" });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.success === false || payload?.error) throw new Error(payload?.error || "Hotel operations request failed");
  return payload;
}

export default function HotelOperationsControlPage() {
  const params = useParams();
  const { organization, loading: organizationLoading } = useOrganizationRuntime();
  const organizationId = params?.organizationId || organization?.id || "";
  const [runtime, setRuntime] = useState({
    bookings: [], rooms: [], housekeeping: [], maintenance: [], concierge: [], folios: [], groups: [], groupBlocks: [],
  });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const loadHotelRuntime = useCallback(async ({ silent = false } = {}) => {
    if (!organizationId) return;
    if (silent) setRefreshing(true);
    else setLoading(true);
    try {
      const query = `?organizationId=${encodeURIComponent(organizationId)}`;
      const [bookings, rooms, housekeeping, maintenance, concierge, stays, groups] = await Promise.all([
        fetchJson(`/api/hotel/bookings/list${query}`),
        fetchJson(`/api/hotel/rooms/list${query}`),
        fetchJson(`/api/hotel/housekeeping/list${query}`),
        fetchJson(`/api/hotel/maintenance/list${query}`),
        fetchJson(`/api/hotel/concierge/list${query}`),
        fetchJson(`/api/hotel/stays${query}`),
        fetchJson(`/api/hotel/groups${query}`),
      ]);
      setRuntime({
        bookings: bookings.bookings || [],
        rooms: rooms.rooms || [],
        housekeeping: housekeeping.tasks || [],
        maintenance: maintenance.tasks || [],
        concierge: concierge.requests || [],
        folios: stays.folios || [],
        groups: groups.groups || [],
        groupBlocks: groups.blocks || [],
      });
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

  const state = useMemo(() => {
    const today = localDateKey();
    const nextSeven = addDays(today, 7);
    const bookings = runtime.bookings;
    const rooms = runtime.rooms;
    const checkedIn = bookings.filter((booking) => status(booking.status) === "CHECKED_IN");
    const activeBookings = bookings.filter((booking) => ["RESERVED", "CHECKED_IN"].includes(status(booking.status)));
    const roomCounts = rooms.reduce((accumulator, room) => {
      const key = status(room.status) || "UNKNOWN";
      accumulator[key] = Number(accumulator[key] || 0) + 1;
      return accumulator;
    }, {});
    const arrivals = bookings.filter((booking) => booking.check_in_date === today && status(booking.status) === "RESERVED");
    const departures = bookings.filter((booking) => booking.check_out_date === today && status(booking.status) === "CHECKED_IN");
    const housekeeping = runtime.housekeeping.filter((task) => ["PENDING", "IN_PROGRESS"].includes(status(task.task_status)));
    const maintenance = runtime.maintenance.filter((task) => ["PENDING", "IN_PROGRESS"].includes(status(task.status)));
    const concierge = runtime.concierge.filter((request) => ["PENDING", "IN_PROGRESS"].includes(status(request.status)));
    const openFolios = runtime.folios.filter((folio) => status(folio.status) === "OPEN");
    const dirtyRooms = Number(roomCounts.DIRTY || 0);
    const blockedRooms = Number(roomCounts.OUT_OF_SERVICE || 0) + Number(roomCounts.BLOCKED || 0);
    const occupiedRooms = Number(roomCounts.OCCUPIED || checkedIn.length);
    const availableRooms = Number(roomCounts.AVAILABLE || 0);
    const totalRooms = rooms.length;

    const openGroups = runtime.groups.filter((group) => ["PROSPECT", "TENTATIVE", "CONFIRMED", "IN_HOUSE"].includes(status(group.status)));
    const cutoffGroups = openGroups.filter((group) => group.cutoff_date && group.cutoff_date <= addDays(today, 2));
    const groupHeldNext7 = runtime.groupBlocks
      .filter((block) => block.status === "ACTIVE" && block.deduct_inventory && block.stay_date >= today && block.stay_date < nextSeven)
      .reduce((sum, block) => sum + Number(block.remaining ?? block.allocated_rooms ?? 0), 0);

    const exceptions = [];
    if (dirtyRooms) exceptions.push({ id: "dirty-rooms", title: "Release dirty rooms before demand reaches the desk", detail: `${dirtyRooms} room${dirtyRooms === 1 ? " is" : "s are"} not ready for sale or arrival.`, value: dirtyRooms, route: "housekeeping", status: "DIRTY", priority: 1 });
    if (blockedRooms) exceptions.push({ id: "blocked-rooms", title: "Recover blocked room capacity", detail: `${blockedRooms} room${blockedRooms === 1 ? " is" : "s are"} unavailable because of an operating blocker.`, value: blockedRooms, route: "maintenance", status: "BLOCKED", priority: 1 });
    if (openFolios.length) exceptions.push({ id: "open-folios", title: "Settle guest folios before departure pressure", detail: `${openFolios.length} open folio${openFolios.length === 1 ? " can" : "s can"} block governed checkout until balanced and closed.`, value: openFolios.length, route: "stay-control", status: "OPEN", priority: 1 });
    if (cutoffGroups.length) exceptions.push({ id: "group-cutoff", title: "Review group release decisions", detail: `${cutoffGroups.length} open group${cutoffGroups.length === 1 ? " has" : "s have"} a cutoff due or within two days. Protect pickup or release unused inventory intentionally.`, value: cutoffGroups.length, route: "group-reservations", status: "DUE", priority: 1 });
    if (maintenance.length) exceptions.push({ id: "maintenance", title: "Clear open property work", detail: `${maintenance.length} maintenance item${maintenance.length === 1 ? "" : "s"} can affect room readiness or guest experience.`, value: maintenance.length, route: "maintenance", status: "ATTENTION", priority: 2 });
    if (concierge.length) exceptions.push({ id: "guest-requests", title: "Close open guest promises", detail: `${concierge.length} guest request${concierge.length === 1 ? " is" : "s are"} still open.`, value: concierge.length, route: "concierge", status: "OPEN", priority: 2 });
    if (groupHeldNext7) exceptions.push({ id: "group-demand", title: "Watch protected group demand", detail: `${groupHeldNext7} unpicked group room night${groupHeldNext7 === 1 ? " is" : "s are"} protected across the next seven days. Revenue sees this as committed—not sold—demand.`, value: groupHeldNext7, route: "hotel-revenue", status: "HELD", priority: 2 });
    if (arrivals.length) exceptions.push({ id: "arrivals", title: "Prepare today's arrivals", detail: `${arrivals.length} arrival${arrivals.length === 1 ? "" : "s"} need a clean handoff into Front Desk.`, value: arrivals.length, route: "front-desk", status: "DUE", priority: 3 });
    if (departures.length) exceptions.push({ id: "departures", title: "Protect today's departures", detail: `${departures.length} departure${departures.length === 1 ? "" : "s"} should close cleanly before room turnover.`, value: departures.length, route: "front-desk", status: "DUE", priority: 3 });

    return {
      totalRooms, occupiedRooms, availableRooms, dirtyRooms, blockedRooms,
      activeBookings: activeBookings.length,
      arrivals: arrivals.length, departures: departures.length,
      housekeeping: housekeeping.length, maintenance: maintenance.length, concierge: concierge.length,
      openFolios: openFolios.length, openGroups: openGroups.length, cutoffGroups: cutoffGroups.length, groupHeldNext7,
      occupancy: totalRooms ? Math.round((occupiedRooms / totalRooms) * 100) : 0,
      readiness: totalRooms ? Math.round((availableRooms / totalRooms) * 100) : 0,
      exceptions: exceptions.sort((a, b) => a.priority - b.priority),
    };
  }, [runtime]);

  if (organizationLoading || loading) return <div className="min-h-[420px] bg-[#F7F6F3] p-8 text-[10px] text-[#77736C]">Preparing Hotel Control…</div>;

  const frontDeskHref = hotelWorkspaceHref(organizationId, "front-desk");

  return (
    <HotelWorkspaceShell
      organizationId={organizationId}
      active="control"
      title="What needs attention now"
      subtitle="Run the property by exception. Room readiness, folio blockers, group cutoffs, protected demand, arrivals, departures and guest promises surface only when a person can move them."
      context={organization?.name || "Property"}
      actions={<>
        <HotelPrimaryAction href={frontDeskHref}>Open Front Desk <ArrowRight size={9} /></HotelPrimaryAction>
        <HotelSecondaryAction onClick={() => loadHotelRuntime({ silent: true })} disabled={refreshing}><RefreshCw size={9} className={refreshing ? "animate-spin" : ""} /> Refresh</HotelSecondaryAction>
      </>}
    >
      <HotelError>{error}</HotelError>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
        <HotelMetric label="Arrivals today" value={state.arrivals} detail="Reserved stays due today" href={frontDeskHref} attention={state.arrivals > 0} />
        <HotelMetric label="Departures today" value={state.departures} detail="In-house stays due out" href={frontDeskHref} attention={state.departures > 0} />
        <HotelMetric label="Room readiness" value={`${state.readiness}%`} detail={`${state.availableRooms} ready · ${state.dirtyRooms} dirty`} href={hotelWorkspaceHref(organizationId, "housekeeping")} attention={state.dirtyRooms > 0} />
        <HotelMetric label="Occupancy" value={`${state.occupancy}%`} detail={`${state.occupiedRooms} of ${state.totalRooms} rooms`} />
        <HotelMetric label="Open folios" value={state.openFolios} detail="Must settle before checkout" href={hotelWorkspaceHref(organizationId, "stay-control")} attention={state.openFolios > 0} />
        <HotelMetric label="Group held · 7d" value={state.groupHeldNext7} detail={`${state.cutoffGroups} cutoff decisions due`} href={hotelWorkspaceHref(organizationId, "hotel-revenue")} attention={state.cutoffGroups > 0} />
        <HotelMetric label="Maintenance" value={state.maintenance} detail={`${state.blockedRooms} blocked rooms`} href={hotelWorkspaceHref(organizationId, "maintenance")} attention={state.maintenance > 0 || state.blockedRooms > 0} />
        <HotelMetric label="Guest promises" value={state.concierge} detail="Open service requests" href={hotelWorkspaceHref(organizationId, "concierge")} attention={state.concierge > 0} />
      </section>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(320px,0.45fr)]">
        <HotelSection eyebrow="Priority work" title="Next human moves" detail="Operational and commercial exceptions ranked ahead of passive status. Healthy work stays quiet.">
          {state.exceptions.length ? <div className="divide-y divide-black/[0.055]">{state.exceptions.slice(0, 12).map((item) => (
            <Link key={item.id} href={hotelWorkspaceHref(organizationId, item.route)} className="grid gap-2 px-4 py-3 transition hover:bg-[#FCFAF6] md:grid-cols-[minmax(260px,1.25fr)_minmax(240px,1fr)_80px_60px] md:items-center md:px-5">
              <div className="min-w-0"><div className="text-[9px] font-semibold text-[#403C37]">{item.title}</div><div className="mt-0.5 text-[7px] uppercase tracking-[0.08em] text-[#A09A92]">Hotel operation</div></div>
              <div className="text-[8px] leading-4 text-[#807A72]">{item.detail}</div>
              <HotelStatusPill value={item.status} tone={item.priority === 1 ? "critical" : "warning"} />
              <div className="text-right text-[8px] font-semibold text-[#76583A]">Open →</div>
            </Link>
          ))}</div> : <HotelEmptyState><span className="inline-flex items-center gap-2"><CheckCircle2 size={12} className="text-emerald-700" /> No surfaced hotel exception currently needs intervention.</span></HotelEmptyState>}
        </HotelSection>

        <HotelSection eyebrow="Control state" title="Property context, not a dashboard" detail="Only numbers that help decide where staff should work next.">
          <div className="divide-y divide-black/[0.055]">{[
            ["Active stays", state.activeBookings, "Reserved or in-house", "reservations"],
            ["Available", state.availableRooms, "Ready for allocation", "reservations"],
            ["Housekeeping open", state.housekeeping, `${state.dirtyRooms} rooms dirty`, "housekeeping"],
            ["Open groups", state.openGroups, `${state.groupHeldNext7} held nights next 7d`, "group-reservations"],
            ["Open folios", state.openFolios, "Governed settlement before checkout", "stay-control"],
            ["Blocked capacity", state.blockedRooms, "Out of service or blocked", "maintenance"],
          ].map(([label, value, detail, route]) => (
            <Link key={label} href={hotelWorkspaceHref(organizationId, route)} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-[#FCFAF6]">
              <div><div className="text-[8px] font-semibold text-[#5F5952]">{label}</div><div className="mt-0.5 text-[7px] text-[#9A948B]">{detail}</div></div>
              <div className="text-[12px] font-semibold tabular-nums text-[#37332F]">{value}</div>
            </Link>
          ))}</div>
        </HotelSection>
      </div>
    </HotelWorkspaceShell>
  );
}
