"use client";

export const dynamic = "force-dynamic";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { RefreshCw } from "lucide-react";

import HotelOperationalDaySetup from "@/components/workspace/hotel/HotelOperationalDaySetup";
import {
  HotelError,
  HotelMetric,
  HotelSecondaryAction,
  HotelWorkspaceShell,
} from "@/components/workspace/hotel/HotelWorkspaceUI";

async function loadProperties(organizationId) {
  const response = await fetch(`/api/hotel/properties/list?organizationId=${encodeURIComponent(organizationId)}`, {
    cache: "no-store",
    credentials: "include",
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.success === false) throw new Error(payload.error || "Unable to load Hotel properties");
  return payload.properties || [];
}

export default function HotelOperationalDayPage() {
  const params = useParams();
  const organizationId = String(params?.organizationId || "");
  const [properties, setProperties] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!organizationId) return;
    setLoading(true); setError("");
    try {
      setProperties(await loadProperties(organizationId));
    } catch (reason) {
      setError(reason?.message || "Unable to load Hotel operational day");
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => { load(); }, [load]);

  const configured = useMemo(() => properties.filter((property) => property.time_zone && property.operational_day_configured_at).length, [properties]);
  const fallback = properties.length - configured;

  return (
    <HotelWorkspaceShell
      organizationId={organizationId}
      active="operational-day"
      eyebrow="Hotel governance"
      title="Operational Day"
      subtitle="One property-local business date drives Night Audit, no-show eligibility, early departure and checkout. Browser dates cannot choose the hotel day."
      actions={<HotelSecondaryAction onClick={load} disabled={loading}><RefreshCw size={9} className={loading ? "animate-spin" : ""} />Refresh</HotelSecondaryAction>}
    >
      <HotelError>{error}</HotelError>
      <div className="grid gap-3 sm:grid-cols-3">
        <HotelMetric label="Properties" value={properties.length} detail="Physical Hotel operating boundaries" />
        <HotelMetric label="Configured" value={configured} detail="Timezone and business-day cutoff explicitly governed" />
        <HotelMetric label="Compatibility mode" value={fallback} detail="UTC fallback until an operator configures the property" attention={fallback > 0} />
      </div>
      <HotelOperationalDaySetup organizationId={organizationId} properties={properties} onSaved={load} />
    </HotelWorkspaceShell>
  );
}
