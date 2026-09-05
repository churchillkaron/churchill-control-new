"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";

import {
  HotelEmptyState,
  HotelError,
  HotelField,
  HotelMetric,
  HotelSecondaryAction,
  HotelSection,
  HotelStatusPill,
  HotelWorkspaceShell,
  hotelInputClass,
} from "@/components/workspace/hotel/HotelWorkspaceUI";

function clean(value) {
  return String(value ?? "").trim();
}

function when(value) {
  if (!value) return "No evidence";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "No evidence" : date.toLocaleString();
}

function money(value, currency = "THB") {
  if (value === null || value === undefined || value === "") return "—";
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: clean(currency) || "THB", maximumFractionDigits: 2 }).format(Number(value));
  } catch {
    return `${Number(value || 0).toFixed(2)} ${clean(currency) || "THB"}`;
  }
}

async function api(url, options = {}) {
  const response = await fetch(url, { cache: "no-store", credentials: "include", ...options });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.success === false) throw new Error(payload.error || "Request failed");
  return payload;
}

const FILTERS = Object.freeze([
  ["ATTENTION", "Needs attention"],
  ["ALL", "All"],
  ["NEW", "New"],
  ["MODIFY", "Changes"],
  ["CANCEL", "Cancellations"],
]);

function workLabel(item) {
  switch (item.workState) {
    case "CANONICAL_REVIEW": return "Hotel review";
    case "PROVIDER_RETRY": return "Provider retry";
    case "AWAITING_ACK": return "Awaiting ACK";
    case "SETTLED": return "Settled";
    default: return "Processing";
  }
}

function workTone(item) {
  if (["CANONICAL_REVIEW", "PROVIDER_RETRY"].includes(item.workState)) return "critical";
  if (item.workState === "AWAITING_ACK" || item.workState === "PROCESSING") return "warning";
  if (item.workState === "SETTLED") return "good";
  return "neutral";
}

function reservationTitle(item) {
  return item.guest?.fullName || item.providerStay?.guestName || `Reservation ${item.externalReservationId}`;
}

function stayDates(item) {
  const from = item.booking?.checkInDate || item.providerStay?.checkInDate;
  const to = item.booking?.checkOutDate || item.providerStay?.checkOutDate;
  return from && to ? `${from} → ${to}` : "Stay dates unavailable";
}

function roomLabel(item) {
  if (item.room?.number) return `Room ${item.room.number} · ${item.room.type || "type not set"}`;
  if (item.providerStay?.roomTypeId) return `OTA room type ${item.providerStay.roomTypeId}`;
  return "Room placement pending";
}

function groupedReservations(items) {
  const groups = new Map();
  for (const item of items) {
    const key = `${item.provider?.connectionId || "no-connection"}:${item.externalReservationId}`;
    if (!groups.has(key)) groups.set(key, { key, reservationId: item.externalReservationId, provider: item.provider, items: [] });
    groups.get(key).items.push(item);
  }
  return [...groups.values()].map((group) => ({
    ...group,
    items: group.items.sort((a, b) => String(b.receivedAt || "").localeCompare(String(a.receivedAt || ""))),
  }));
}

function ReservationRow({ item, organizationId, retryingEventId, onRetryProviderHandoff }) {
  const event = clean(item.eventType).toUpperCase();
  const canonicalAmount = item.booking?.totalAmount ?? item.providerStay?.amount;
  const currency = item.booking?.currencyCode || item.providerStay?.currencyCode || "THB";
  const retryable = ["PROVIDER_RETRY", "AWAITING_ACK"].includes(item.workState);
  const retrying = retryingEventId === item.id;
  return (
    <div className={`grid gap-3 px-4 py-4 md:px-5 xl:grid-cols-[minmax(250px,1.25fr)_minmax(180px,0.8fr)_minmax(220px,1fr)_minmax(190px,0.85fr)_auto] ${item.needsAttention ? "bg-[#FFF9F5]" : "bg-white"}`}>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <div className="truncate text-[10px] font-semibold text-[#342F2A]">{reservationTitle(item)}</div>
          <HotelStatusPill value={event} tone={event === "CANCEL" ? "critical" : event === "MODIFY" ? "warning" : "neutral"} />
        </div>
        <div className="mt-1 text-[8px] text-[#817B73]">#{item.externalReservationId} · {stayDates(item)}</div>
        <div className="mt-0.5 text-[7px] text-[#A09990]">Received {when(item.receivedAt)} · version {item.eventVersion || "not supplied"}</div>
      </div>

      <div>
        <div className="text-[7px] font-semibold uppercase tracking-[0.1em] text-[#918A82]">Room & value</div>
        <div className="mt-1 text-[9px] font-medium text-[#4B453F]">{roomLabel(item)}</div>
        <div className="mt-0.5 text-[8px] text-[#8D867E]">{money(canonicalAmount, currency)}{item.providerStay?.ratePlanId ? ` · OTA rate ${item.providerStay.ratePlanId}` : ""}</div>
      </div>

      <div>
        <div className="text-[7px] font-semibold uppercase tracking-[0.1em] text-[#918A82]">Hotel truth</div>
        {item.booking ? (
          <div className="mt-1 space-y-1">
            <div className="flex flex-wrap items-center gap-1.5"><HotelStatusPill value={item.booking.status} /><span className="text-[8px] text-[#817B73]">{item.booking.reference || "Canonical booking"}</span></div>
            <div className="text-[7px] text-[#9A938B]">Reconciliation {item.reconciliation?.status || item.eventStatus || "pending"} · payment {item.booking.paymentStatus || "unknown"}</div>
          </div>
        ) : (
          <div className="mt-1 text-[8px] leading-4 text-[#9A533D]">No canonical booking is attached to this event yet.</div>
        )}
      </div>

      <div>
        <div className="text-[7px] font-semibold uppercase tracking-[0.1em] text-[#918A82]">Provider handoff</div>
        <div className="mt-1 flex flex-wrap gap-1.5"><HotelStatusPill value={workLabel(item)} tone={workTone(item)} /><HotelStatusPill value={item.providerAckStatus || "PENDING"} /></div>
        <div className="mt-1 text-[7px] text-[#9A938B]">{item.providerAcknowledgedAt ? `ACK ${when(item.providerAcknowledgedAt)}` : "Provider acknowledgement not yet proven"}</div>
      </div>

      <div className="flex flex-wrap content-start gap-2 xl:justify-end">
        {retryable ? <HotelSecondaryAction onClick={() => onRetryProviderHandoff(item.id)} disabled={Boolean(retryingEventId)}>{retrying ? "Retrying…" : "Retry OTA handoff"}</HotelSecondaryAction> : null}
        {item.booking?.id ? <HotelSecondaryAction href={`/workspace/${organizationId}/operations/stay-control?bookingId=${encodeURIComponent(item.booking.id)}`}>Open stay</HotelSecondaryAction> : null}
        <HotelSecondaryAction href={`/workspace/${organizationId}/operations/channel-manager`}>Channel setup</HotelSecondaryAction>
      </div>

      {item.issue ? <div className="xl:col-span-5 rounded-xl border border-[#A46A47]/12 bg-white px-3 py-2 text-[8px] leading-4 text-[#805B45]"><strong className="text-[#634334]">Needs operator context:</strong> {item.issue}</div> : null}
    </div>
  );
}

export default function ChannelReservationsPage() {
  const params = useParams();
  const organizationId = String(params?.organizationId || "");
  const [properties, setProperties] = useState([]);
  const [propertyId, setPropertyId] = useState("");
  const [payload, setPayload] = useState({ connections: [], summary: {}, items: [] });
  const [filter, setFilter] = useState("ATTENTION");
  const [loading, setLoading] = useState(true);
  const [retryingEventId, setRetryingEventId] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    api(`/api/hotel/properties/list?organizationId=${encodeURIComponent(organizationId)}`)
      .then((result) => {
        const next = result.properties || [];
        setProperties(next);
        setPropertyId((current) => current || next[0]?.id || "");
      })
      .catch((reason) => setError(reason.message));
  }, [organizationId]);

  const load = useCallback(async () => {
    if (!organizationId) return;
    setLoading(true);
    setError("");
    try {
      const query = new URLSearchParams({ organizationId });
      if (propertyId) query.set("propertyId", propertyId);
      const result = await api(`/api/hotel/channels/reservation-control?${query.toString()}`);
      setPayload(result);
    } catch (reason) {
      setError(reason.message);
    } finally {
      setLoading(false);
    }
  }, [organizationId, propertyId]);

  useEffect(() => { load(); }, [load]);

  const retryProviderHandoff = useCallback(async (reservationEventId) => {
    if (!organizationId || !reservationEventId || retryingEventId) return;
    setRetryingEventId(reservationEventId);
    setError("");
    try {
      await api("/api/hotel/channels/reservation-control", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ organizationId, action: "RETRY_PROVIDER_HANDOFF", reservationEventId }),
      });
      await load();
    } catch (reason) {
      setError(reason.message);
    } finally {
      setRetryingEventId("");
    }
  }, [organizationId, retryingEventId, load]);

  const visibleItems = useMemo(() => {
    const items = payload.items || [];
    if (filter === "ALL") return items;
    if (filter === "ATTENTION") return items.filter((item) => item.needsAttention || item.workState === "AWAITING_ACK");
    return items.filter((item) => clean(item.eventType).toUpperCase() === filter);
  }, [payload.items, filter]);

  const groups = useMemo(() => groupedReservations(visibleItems), [visibleItems]);
  const selectedProperty = properties.find((property) => property.id === propertyId);
  const connections = payload.connections || [];
  const summary = payload.summary || {};
  const latest = (payload.items || [])[0]?.receivedAt || null;

  return (
    <HotelWorkspaceShell
      organizationId={organizationId}
      active="channel-reservations"
      eyebrow="OTA reservation control"
      title="Channel Reservations"
      subtitle="One human work queue for OTA arrivals, changes, cancellations and exceptions. Avantiqo separates canonical Hotel acceptance from provider acknowledgement so staff can see exactly what is safe, what is pending and what needs intervention."
      context={selectedProperty?.name || "All hotel properties"}
      actions={<><HotelSecondaryAction onClick={load} disabled={loading || Boolean(retryingEventId)}>Refresh</HotelSecondaryAction><HotelSecondaryAction href={`/workspace/${organizationId}/operations/channel-manager`}>Channels & Rates</HotelSecondaryAction></>}
    >
      <HotelError>{error}</HotelError>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <HotelMetric label="Needs attention" value={summary.needsAttention || 0} detail="Inventory, mapping, in-house or provider retry" attention={(summary.needsAttention || 0) > 0} />
        <HotelMetric label="Awaiting OTA ACK" value={summary.awaitingAck || 0} detail="Hotel accepted; provider handoff still unproven" attention={(summary.awaitingAck || 0) > 0} />
        <HotelMetric label="Settled events" value={summary.settled || 0} detail={`${summary.total || 0} inbound room-stay events recorded`} />
        <HotelMetric label="Latest inbound" value={latest ? new Date(latest).toLocaleDateString() : "—"} detail={latest ? when(latest) : "No OTA reservation evidence yet"} />
      </div>

      <HotelSection eyebrow="01 · Property & work queue" title="Work the exception, not the integration log" detail="The queue prioritizes reservations that need a hotel decision or a provider acknowledgement retry. Settled events remain visible as evidence, not as tasks.">
        <div className="flex flex-col gap-3 p-4 md:flex-row md:items-end md:justify-between md:p-5">
          <HotelField label="Property">
            <select className={hotelInputClass} value={propertyId} onChange={(event) => setPropertyId(event.target.value)} disabled={Boolean(retryingEventId)}>
              <option value="">All hotel properties</option>
              {properties.map((property) => <option key={property.id} value={property.id}>{property.name}</option>)}
            </select>
          </HotelField>
          <div className="flex flex-wrap gap-1.5">
            {FILTERS.map(([id, label]) => <button key={id} type="button" onClick={() => setFilter(id)} disabled={Boolean(retryingEventId)} className={filter === id ? "rounded-lg bg-[#292620] px-2.5 py-2 text-[8px] font-semibold text-white disabled:opacity-50" : "rounded-lg border border-black/[0.07] bg-white px-2.5 py-2 text-[8px] font-semibold text-[#776F67] hover:text-[#76583A] disabled:opacity-50"}>{label}</button>)}
          </div>
        </div>
      </HotelSection>

      {!loading && connections.length === 0 ? (
        <HotelSection eyebrow="02 · Connectivity" title="No OTA reservation channel is configured yet" detail="This workspace is ready before the first live connection. Create and certify the channel in Channels & Rates; inbound events will appear here automatically once transport is enabled.">
          <div className="p-5"><HotelSecondaryAction href={`/workspace/${organizationId}/operations/channel-manager`}>Open Channels & Rates</HotelSecondaryAction></div>
        </HotelSection>
      ) : null}

      <HotelSection eyebrow="02 · Reservation work" title={filter === "ATTENTION" ? "Reservations needing a human eye" : "Inbound reservation evidence"} detail="Each Booking.com room stay is shown separately under its external reservation so multi-room bookings cannot hide inventory or reconciliation problems.">
        {loading ? <HotelEmptyState>Loading governed OTA reservation evidence…</HotelEmptyState> : groups.length === 0 ? <HotelEmptyState>{connections.length ? (filter === "ATTENTION" ? "Nothing needs attention. New OTA reservations and exceptions will appear here automatically." : "No reservation events match this view yet.") : "No inbound OTA reservation evidence exists yet."}</HotelEmptyState> : <div className="divide-y divide-black/[0.06]">{groups.map((group) => <div key={group.key}><div className="flex flex-wrap items-center justify-between gap-2 bg-[#FAF8F4] px-4 py-2.5 md:px-5"><div><div className="text-[8px] font-semibold uppercase tracking-[0.08em] text-[#6E655C]">{group.provider?.name || group.provider?.id || "OTA"} · reservation #{group.reservationId}</div><div className="mt-0.5 text-[7px] text-[#A09990]">{group.items.length} room-stay event{group.items.length === 1 ? "" : "s"} · latest first</div></div><HotelStatusPill value={group.provider?.connectionStatus || "UNKNOWN"} /></div><div className="divide-y divide-black/[0.05]">{group.items.map((item) => <ReservationRow key={item.id} item={item} organizationId={organizationId} retryingEventId={retryingEventId} onRetryProviderHandoff={retryProviderHandoff} />)}</div></div>)}</div>}
      </HotelSection>

      <HotelSection eyebrow="03 · Operating rule" title="Automation stops before it can damage an in-house stay" detail="Mapping conflicts, protected inventory and checked-in changes remain explicit operator work. Only a reconciled stay with a pending provider handoff can be retried here; the retry refetches provider truth before acknowledgement.">
        <div className="grid gap-3 p-4 md:grid-cols-3 md:p-5">
          <div className="rounded-xl border border-black/[0.06] bg-[#FBFAF7] p-3"><div className="text-[8px] font-semibold text-[#4B453F]">Hotel accepted</div><div className="mt-1 text-[8px] leading-4 text-[#8A837B]">The exact room-stay event is persisted, mapped to a physical room and reconciled to its canonical booking.</div></div>
          <div className="rounded-xl border border-black/[0.06] bg-[#FBFAF7] p-3"><div className="text-[8px] font-semibold text-[#4B453F]">Provider acknowledged</div><div className="mt-1 text-[8px] leading-4 text-[#8A837B]">A separate ACK state proves Booking.com accepted the exact message. Stale versions are marked superseded, never falsely acknowledged.</div></div>
          <div className="rounded-xl border border-black/[0.06] bg-[#FBFAF7] p-3"><div className="text-[8px] font-semibold text-[#4B453F]">Human intervention</div><div className="mt-1 text-[8px] leading-4 text-[#8A837B]">If an OTA change would break inventory or alter a checked-in stay, Avantiqo stops and surfaces the reason instead of silently forcing the change.</div></div>
        </div>
      </HotelSection>
    </HotelWorkspaceShell>
  );
}