"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowRight, BedDouble, RefreshCw, RotateCcw } from "lucide-react";

import {
  HotelEmptyState,
  HotelError,
  HotelMetric,
  HotelPrimaryAction,
  HotelSecondaryAction,
  HotelSection,
  HotelStatusPill,
  hotelWorkspaceHref,
} from "@/components/workspace/hotel/HotelWorkspaceUI";
import { HOTEL_READINESS_CHANGED_EVENT, notifyHotelReadinessChanged } from "@/lib/hotel/client/readinessInvalidation";

const OWNER_LABEL = Object.freeze({ FRONT_DESK: "Front Desk", HOUSEKEEPING: "Housekeeping", MAINTENANCE: "Maintenance" });
const OWNER_ROUTE = Object.freeze({ FRONT_DESK: "front-desk", HOUSEKEEPING: "housekeeping", MAINTENANCE: "maintenance" });

function etaLabel(value, timeZone) {
  if (!value) return "ETA not recorded";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "ETA not recorded";
  try {
    return `ETA ${new Intl.DateTimeFormat([], { timeZone: timeZone || "UTC", hour: "2-digit", minute: "2-digit" }).format(date)}`;
  } catch {
    return "ETA recorded";
  }
}

export default function HotelArrivalReadinessOwnership({ organizationId, focusOwner = null, compact = false }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyBookingId, setBusyBookingId] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!organizationId) return;
    if (silent) setRefreshing(true); else setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/hotel/arrival-readiness/ownership?organizationId=${encodeURIComponent(organizationId)}`, { cache: "no-store", credentials: "include" });
      const result = await response.json();
      if (!response.ok || result.success === false) throw new Error(result.error || "Unable to load arrival ownership");
      setData(result);
    } catch (loadError) {
      setError(loadError?.message || "Unable to load arrival ownership");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [organizationId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const handleReadinessChanged = () => { load({ silent: true }); };
    window.addEventListener(HOTEL_READINESS_CHANGED_EVENT, handleReadinessChanged);
    return () => window.removeEventListener(HOTEL_READINESS_CHANGED_EVENT, handleReadinessChanged);
  }, [load]);

  const restoreHousekeepingWork = useCallback(async (bookingId) => {
    if (!bookingId) return;
    setBusyBookingId(bookingId);
    setError(null);
    try {
      const response = await fetch("/api/hotel/housekeeping/restore-arrival-work", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookingId }),
      });
      const result = await response.json();
      if (!response.ok || result.success === false) throw new Error(result.error || "Unable to restore Housekeeping work");
      notifyHotelReadinessChanged({ source: "arrival-ownership", bookingId });
    } catch (restoreError) {
      setError(restoreError?.message || "Unable to restore Housekeeping work");
    } finally {
      setBusyBookingId(null);
    }
  }, []);

  const assignRecommendedRoom = useCallback(async (item) => {
    const bookingId = item?.booking?.id;
    const roomId = item?.recommendedRoom?.id;
    if (!bookingId || !roomId) return;
    setBusyBookingId(bookingId);
    setError(null);
    try {
      const response = await fetch("/api/hotel/bookings/assign-room", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bookingId,
          roomId,
          reason: item?.room ? "Front Desk fastest safe arrival reassignment" : "Front Desk fastest safe arrival assignment",
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result.success === false) throw new Error(result.error || "Recommended room is no longer safe to assign");
      notifyHotelReadinessChanged({ source: "arrival-fast-path", bookingId, roomId });
    } catch (assignError) {
      setError(assignError?.message || "Unable to assign recommended room");
    } finally {
      setBusyBookingId(null);
    }
  }, []);

  const items = useMemo(() => {
    const all = data?.items || [];
    if (!focusOwner) return all;
    return all.filter((item) => item.owner === focusOwner);
  }, [data, focusOwner]);

  const summary = data?.summary || {};
  const configBlockers = data?.configurationBlockers || [];

  return (
    <HotelSection
      eyebrow="Arrival ownership"
      title={focusOwner ? `${OWNER_LABEL[focusOwner] || focusOwner} — what you own now` : "Who owns every blocked arrival"}
      detail="Derived live from the reservation, assigned room, physical room state, Housekeeping and canonical Maintenance requests. If another room is safely ready now, Front Desk owns the faster guest path instead of waiting on the blocked room."
      action={<HotelSecondaryAction onClick={() => load({ silent: true })} disabled={refreshing}><RefreshCw size={9} className={refreshing ? "animate-spin" : ""} />Refresh</HotelSecondaryAction>}
    >
      <HotelError>{error}</HotelError>
      {configBlockers.length ? (
        <div className="border-b border-black/[0.055] bg-[#FBF5ED] px-4 py-3 text-[8px] leading-4 text-[#7A5B38]">
          Property operational-day configuration is not yet applied for {configBlockers.length} propert{configBlockers.length === 1 ? "y" : "ies"}. Avantiqo will not fabricate a due-arrival queue from browser or server time.
        </div>
      ) : null}

      {!compact ? (
        <div className="grid grid-cols-2 gap-3 border-b border-black/[0.055] p-4 xl:grid-cols-7">
          <HotelMetric label="Due arrivals" value={summary.dueArrivals || 0} detail="Property business day" />
          <HotelMetric label="Ready" value={summary.ready || 0} detail="No physical blocker" />
          <HotelMetric label="Fast room path" value={summary.fastPathReadyRooms || 0} detail="Ready alternative now" attention={(summary.fastPathReadyRooms || 0) > 0} />
          <HotelMetric label="Blocked" value={summary.blocked || 0} detail="Needs an owner" attention={(summary.blocked || 0) > 0} />
          <HotelMetric label="Front Desk" value={summary.frontDeskOwned || 0} detail="Assignment / room decision" attention={(summary.frontDeskOwned || 0) > 0} />
          <HotelMetric label="Housekeeping" value={summary.housekeepingOwned || 0} detail="Clean / inspect" attention={(summary.housekeepingOwned || 0) > 0} />
          <HotelMetric label="Maintenance" value={summary.maintenanceOwned || 0} detail="Physical defect" attention={(summary.maintenanceOwned || 0) > 0} />
        </div>
      ) : null}

      {loading ? <HotelEmptyState>Deriving live arrival ownership…</HotelEmptyState> : items.length ? (
        <div className="divide-y divide-black/[0.055]">
          {items.map((item) => {
            const owner = item.owner;
            const ownerRoute = owner ? OWNER_ROUTE[owner] : null;
            const canRestoreHousekeeping = owner === "HOUSEKEEPING" && item.nextAction?.code === "CREATE_HOUSEKEEPING_WORK";
            const canAssignFastPath = owner === "FRONT_DESK" && Boolean(item.recommendedRoom?.id) && ["ASSIGN_READY_ALTERNATIVE", "REASSIGN_READY_ALTERNATIVE"].includes(item.nextAction?.code);
            const busy = busyBookingId === item.booking.id;
            return (
              <div key={item.booking.id} className="grid gap-3 px-4 py-3 md:grid-cols-[minmax(170px,1fr)_100px_120px_minmax(190px,1.4fr)_165px] md:items-center md:px-5">
                <div>
                  <div className="text-[10px] font-semibold text-[#403C37]">{item.guest?.name || item.booking.reference || "Arrival"}</div>
                  <div className="mt-0.5 text-[7px] text-[#938D84]">{item.booking.checkInDate || "No arrival date"} · {etaLabel(item.booking.estimatedArrivalAt, item.operationalDay?.timeZone)}</div>
                  <div className="mt-0.5 text-[7px] text-[#AAA39A]">{item.room ? `Room ${item.room.number} · ${item.room.type || "Room"}` : "No room assigned"}</div>
                  {item.recommendedRoom ? <div className="mt-1 text-[7px] font-semibold text-[#6C815A]">Ready alternative: Room {item.recommendedRoom.roomNumber} · {item.recommendedRoom.roomType || "Room"}</div> : null}
                </div>
                <HotelStatusPill value={item.state} tone={item.state === "BLOCKED" ? "critical" : undefined} />
                <div>
                  {owner ? <HotelStatusPill value={OWNER_LABEL[owner] || owner} tone={owner === focusOwner ? "attention" : undefined} /> : <HotelStatusPill value="NO BLOCKER" />}
                </div>
                <div>
                  <div className="text-[8px] font-semibold text-[#5D5750]">{item.nextAction?.label || "Continue arrival"}</div>
                  <div className="mt-0.5 text-[7px] leading-3 text-[#928B82]">{item.blocker?.detail || "Assigned room is guest-ready."}</div>
                  {item.underlyingBlocker ? <div className="mt-1 text-[7px] text-[#9B7D61]">Underlying blocked-room owner: {OWNER_LABEL[item.underlyingOwner] || item.underlyingOwner || "Operational team"} · {item.underlyingBlocker.code}</div> : null}
                  {item.sourceEvidence?.maintenanceRequestId ? <div className="mt-1 text-[7px] text-[#A1744B]">Canonical maintenance request {String(item.sourceEvidence.maintenanceRequestId).slice(0, 8)}</div> : null}
                  {item.sourceEvidence?.housekeepingTaskId ? <div className="mt-1 text-[7px] text-[#8D8173]">Housekeeping task {String(item.sourceEvidence.housekeepingTaskId).slice(0, 8)}</div> : null}
                </div>
                <div>
                  {canAssignFastPath ? (
                    <HotelPrimaryAction onClick={() => assignRecommendedRoom(item)} disabled={busy}>
                      <BedDouble size={9} />{busy ? "Rechecking…" : item.nextAction.label}
                    </HotelPrimaryAction>
                  ) : canRestoreHousekeeping ? (
                    <HotelPrimaryAction onClick={() => restoreHousekeepingWork(item.booking.id)} disabled={busy}>
                      <RotateCcw size={9} />{busy ? "Restoring" : "Restore work"}
                    </HotelPrimaryAction>
                  ) : ownerRoute ? (
                    <HotelPrimaryAction href={hotelWorkspaceHref(organizationId, ownerRoute)}>{owner === focusOwner ? "Open work" : `Go to ${OWNER_LABEL[owner]}`}<ArrowRight size={9} /></HotelPrimaryAction>
                  ) : (
                    <HotelPrimaryAction href={hotelWorkspaceHref(organizationId, "front-desk")}>Continue check-in<ArrowRight size={9} /></HotelPrimaryAction>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : <HotelEmptyState>{focusOwner ? `No due arrivals are currently owned by ${OWNER_LABEL[focusOwner] || focusOwner}.` : "No due arrivals are waiting on room readiness."}</HotelEmptyState>}
    </HotelSection>
  );
}
