"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";

import {
  HotelEmptyState,
  HotelError,
  HotelField,
  HotelMetric,
  HotelPrimaryAction,
  HotelSecondaryAction,
  HotelSection,
  HotelStatusPill,
  HotelSuccess,
  HotelWorkspaceShell,
  hotelInputClass,
  hotelWorkspaceHref,
} from "@/components/workspace/hotel/HotelWorkspaceUI";

async function api(url, options) {
  const response = await fetch(url, { cache: "no-store", ...options });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.success === false) throw new Error(payload.error || "Request failed");
  return payload;
}

function money(value, currency = "THB") {
  return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(Number(value || 0));
}

export default function HotelRevenuePage() {
  const params = useParams();
  const organizationId = String(params?.organizationId || "");
  const [properties, setProperties] = useState([]);
  const [propertyId, setPropertyId] = useState("");
  const [forecast, setForecast] = useState(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    api(`/api/hotel/properties/list?organizationId=${encodeURIComponent(organizationId)}`)
      .then((payload) => {
        if (!active) return;
        const list = payload.properties || [];
        setProperties(list);
        setPropertyId((current) => current || list[0]?.id || "");
      })
      .catch((reason) => active && setError(reason.message));
    return () => { active = false; };
  }, [organizationId]);

  const load = useCallback(async () => {
    if (!propertyId) return;
    setError("");
    try {
      const query = `organizationId=${encodeURIComponent(organizationId)}&propertyId=${encodeURIComponent(propertyId)}`;
      setForecast(await api(`/api/hotel/revenue-forecast?${query}&days=30`));
    } catch (reason) {
      setError(reason.message);
    }
  }, [organizationId, propertyId]);

  useEffect(() => { load(); }, [load]);

  async function snapshot() {
    if (!forecast?.forecast?.length) return;
    setSaving(true); setError(""); setSuccess("");
    try {
      await api("/api/hotel/revenue-forecast", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ organizationId, propertyId, forecast: forecast.forecast }),
      });
      setSuccess("Current governed 30-day forecast snapshot saved for historical comparison.");
    } catch (reason) {
      setError(reason.message);
    } finally {
      setSaving(false);
    }
  }

  const totals = forecast?.totals || {};
  const currency = forecast?.currencyCode || "THB";
  const selectedProperty = properties.find((property) => property.id === propertyId);
  const highPressureDays = (forecast?.forecast || []).filter((row) => row.committedOccupancyPercent >= 90).length;
  const unpickedGroupValue = Number(totals.groupHeldRevenue || 0);

  return (
    <HotelWorkspaceShell
      organizationId={organizationId}
      active="revenue"
      eyebrow="Property revenue"
      title="Revenue & Demand"
      subtitle="See booked business and protected group demand separately, then manage the commercial action in the workspace that owns it. No double-counted pickup and no hidden group pressure."
      context={selectedProperty?.name || "Choose property"}
      actions={<>
        <HotelSecondaryAction href={hotelWorkspaceHref(organizationId, "group-reservations")}>Manage groups</HotelSecondaryAction>
        <HotelSecondaryAction href={hotelWorkspaceHref(organizationId, "hotel-offers")}>Manage offers</HotelSecondaryAction>
        <HotelPrimaryAction disabled={saving || !forecast?.forecast?.length} onClick={snapshot}>{saving ? "Saving…" : "Save snapshot"}</HotelPrimaryAction>
      </>}
    >
      <HotelError>{error}</HotelError><HotelSuccess>{success}</HotelSuccess>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <HotelMetric label="Booked occupancy" value={`${Number(totals.occupancyPercent || 0).toFixed(1)}%`} detail={`${totals.soldRoomNights || 0} sold room nights`} />
        <HotelMetric label="Committed occupancy" value={`${Number(totals.committedOccupancyPercent || 0).toFixed(1)}%`} detail={`Includes ${totals.groupHeldRoomNights || 0} unpicked group room nights`} attention={Number(totals.committedOccupancyPercent || 0) >= 90} />
        <HotelMetric label="ADR" value={money(totals.adr, currency)} detail="Booked room revenue / sold room nights" />
        <HotelMetric label="Booked revenue" value={money(totals.roomRevenue, currency)} detail="Reservation-based 30-day room revenue" />
        <HotelMetric label="Protected group value" value={money(unpickedGroupValue, currency)} detail={`${highPressureDays} days at or above 90% committed`} attention={highPressureDays > 0} />
      </div>

      <HotelSection eyebrow="Property" title="Revenue scope" detail="Booked occupancy and committed occupancy are intentionally separate so revenue teams can distinguish consumed demand from protected group inventory.">
        <div className="p-4 md:max-w-sm md:p-5"><HotelField label="Property"><select className={hotelInputClass} value={propertyId} onChange={(event) => setPropertyId(event.target.value)}><option value="">Choose property</option>{properties.map((property) => <option key={property.id} value={property.id}>{property.name}</option>)}</select></HotelField></div>
      </HotelSection>

      <HotelSection eyebrow="30-day outlook" title="Booked vs committed demand" detail="Committed rooms = sold rooms + remaining deducting group allotments. Group pickup is already in sold rooms, so it is never counted twice.">
        {!forecast?.forecast?.length ? <HotelEmptyState>No forecast data.</HotelEmptyState> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-left text-[8px]">
              <thead className="bg-[#FAF9F6] text-[7px] uppercase tracking-[0.08em] text-[#918B83]"><tr><th className="px-4 py-2.5">Stay date</th><th className="px-3">Booked</th><th className="px-3">Group held</th><th className="px-3">Committed</th><th className="px-3">Occupancy</th><th className="px-3">Committed occ.</th><th className="px-3">ADR</th><th className="px-3">Booked revenue</th><th className="px-3">Protected group value</th></tr></thead>
              <tbody className="divide-y divide-black/[0.05]">{forecast.forecast.map((row) => <tr key={row.stayDate}>
                <td className="px-4 py-2.5 font-medium">{row.stayDate}</td>
                <td className="px-3 tabular-nums">{row.roomsSold} / {row.roomsAvailable}</td>
                <td className="px-3 tabular-nums">{row.groupRoomsHeld}</td>
                <td className="px-3 tabular-nums font-semibold">{row.committedRooms} / {row.roomsAvailable}</td>
                <td className="px-3">{Number(row.occupancyPercent || 0).toFixed(1)}%</td>
                <td className={`px-3 font-semibold ${row.committedOccupancyPercent >= 90 ? "text-[#9A533D]" : ""}`}>{Number(row.committedOccupancyPercent || 0).toFixed(1)}%</td>
                <td className="px-3">{money(row.adr, currency)}</td>
                <td className="px-3 font-semibold">{money(row.roomRevenue, currency)}</td>
                <td className="px-3">{row.groupHeldRevenue > 0 ? money(row.groupHeldRevenue, currency) : "—"}</td>
              </tr>)}</tbody>
            </table>
          </div>
        )}
      </HotelSection>

      <div className="grid gap-4 lg:grid-cols-3">
        <HotelSection eyebrow="Demand pressure" title="What needs revenue attention" detail="Use committed occupancy for capacity pressure, booked occupancy for realised pickup.">
          <div className="space-y-2 p-4 md:p-5">
            <div className="flex items-center justify-between gap-3"><span className="text-[8px] text-[#716B63]">High-pressure days</span><HotelStatusPill value={highPressureDays ? `${highPressureDays} DAYS` : "CLEAR"} tone={highPressureDays ? "warning" : "good"} /></div>
            <div className="flex items-center justify-between gap-3"><span className="text-[8px] text-[#716B63]">Unpicked group nights</span><span className="text-[9px] font-semibold tabular-nums">{totals.groupHeldRoomNights || 0}</span></div>
            <div className="flex items-center justify-between gap-3"><span className="text-[8px] text-[#716B63]">Group pickup nights</span><span className="text-[9px] font-semibold tabular-nums">{totals.groupPickupRoomNights || 0}</span></div>
          </div>
        </HotelSection>

        <HotelSection eyebrow="Commercial action" title="Groups & allotments" detail="Adjust negotiated blocks, pickup and release decisions in the dedicated group workspace.">
          <div className="p-4 md:p-5"><HotelPrimaryAction href={hotelWorkspaceHref(organizationId, "group-reservations")}>Open Groups</HotelPrimaryAction></div>
        </HotelSection>

        <HotelSection eyebrow="Incremental revenue" title="Offers & upsells" detail="Publish stay enhancements separately so revenue analysis does not become another configuration screen.">
          <div className="p-4 md:p-5"><HotelPrimaryAction href={hotelWorkspaceHref(organizationId, "hotel-offers")}>Open Offers</HotelPrimaryAction></div>
        </HotelSection>
      </div>
    </HotelWorkspaceShell>
  );
}
