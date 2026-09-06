"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowRight, RefreshCw, RotateCcw } from "lucide-react";

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

const OWNER_LABEL = Object.freeze({ FRONT_DESK: "Front Desk", HOUSEKEEPING: "Housekeeping", MAINTENANCE: "Maintenance" });
const OWNER_ROUTE = Object.freeze({ FRONT_DESK: "front-desk", HOUSEKEEPING: "housekeeping", MAINTENANCE: "maintenance" });

function etaLabel(value) {
  if (!value) return "ETA not recorded";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "ETA not recorded";
  return `ETA ${date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
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
      await load({ silent: true });
    } catch (restoreError) {
      setError(restoreError?.message || "Unable to restore Housekeeping work");
    } finally {
      setBusyBookingId(null);
    }
  }, [load]);

  const items = useMemo(() => {
    const all = data?.items || [];
    if (!focusOwner) return all;
    return all.filter((item) => item.owner === focusOwner || item.state === "READY");
  }, [data, focusOwner]);

  const summary = data?.summary || {};
  const configBlockers = data?.configurationBlockers || [];

  return (
    <HotelSection
      eyebrow="Arrival ownership"
      title={focusOwner ? `${OWNER_LABEL[focusOwner] || focusOwner} — what you own now` : "Who owns every blocked arrival"}
      detail="Derived live from the reservation, assigned room, physical room state, Housekeeping and canonical Maintenance requests. Ownership moves automatically when the underlying blocker changes; there is no duplicate queue to maintain."
      action={<HotelSecondaryAction onClick={() => load({ silent: true })} disabled={refreshing}><RefreshCw size={9} className={refreshing ? "animate-spin" : ""} />Refresh</HotelSecondaryAction>}
    >
      <HotelError>{error}</HotelError>
      {configBlockers.length ? (
        <div className="border-b border-black/[0.055] bg-[#FBF5ED] px-4 py-3 text-[8px] leading-4 text-[#7A5B38]">
          Property operational-day configuration is not yet applied for {configBlockers.length} propert{configBlockers.length === 1 ? "y" : "ies"}. Avantiqo will not fabricate a due-arrival queue from browser or server time.
        </div>
      ) : null}

      {!compact ? (
        <div className="grid grid-cols-2 gap-3 border-b border-black/[0.055] p-4 xl:grid-cols-6">
          <HotelMetric label="Due arrivals" value={summary.dueArrivals || 0} detail="Property business day" />
          <HotelMetric label="Ready" value={summary.ready || 0} detail="No physical blocker" />
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
            const restoring = busyBookingId === item.booking.id;
            return (
              <div key={item.booking.id} className="grid gap-3 px-4 py-3 md:grid-cols-[minmax(170px,1fr)_100px_120px_minmax(190px,1.4fr)_150px] md:items-center md:px-5">
                <div>
                  <div className="text-[10px] font-semibold text-[#403C37]">{item.guest?.name || item.booking.reference || "Arrival"}</div>
                  <div className="mt-0.5 text-[7px] text-[#938D84]">{item.booking.checkInDate || "No arrival date"} · {etaLabel(item.booking.estimatedArrivalAt)}</div>
                  <div className="mt-0.5 text-[7px] text-[#AAA39A]">{item.room ? `Room ${item.room.number} · ${item.room.type || "Room"}` : "No room assigned"}</div>
                </div>
                <HotelStatusPill value={item.state} tone={item.state === "BLOCKED" ? "critical" : undefined} />
                <div>
                  {owner ? <HotelStatusPill value={OWNER_LABEL[owner] || owner} tone={owner === focusOwner ? "attention" : undefined} /> : <HotelStatusPill value="NO BLOCKER" />}
                </div>
                <div>
                  <div className="text-[8px] font-semibold text-[#5D5750]">{item.nextAction?.label || "Continue arrival"}</div>
                  <div className="mt-0.5 text-[7px] leading-3 text-[#928B82]">{item.blocker?.detail || "Assigned room is guest-ready."}</div>
                  {item.sourceEvidence?.maintenanceRequestId ? <div className="mt-1 text-[7px] text-[#A1744B]">Canonical maintenance request {String(item.sourceEvidence.maintenanceRequestId).slice(0, 8)}</div> : null}
                  {item.sourceEvidence?.housekeepingTaskId ? <div className="mt-1 text-[7px] text-[#8D8173]">Housekeeping task {String(item.sourceEvidence.housekeepingTaskId).slice(0, 8)}</div> : null}
                </div>
                <div>
                  {canRestoreHousekeeping ? (
                    <HotelPrimaryAction onClick={() => restoreHousekeepingWork(item.booking.id)} disabled={restoring}>
                      <RotateCcw size={9} />{restoring ? "Restoring" : "Restore work"}
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
