"use client";

import { useCallback } from "react";
import { useBusinessContext } from "@/app/providers/BusinessContextProvider";
import useRestaurantPOSRealtime from "@/lib/restaurant/pos/realtime/useRestaurantPOSRealtime";
import WaiterServiceWorkspace from "./WaiterServiceWorkspace";

function statusLabel(status) {
  if (status === "live") return "Live";
  if (status === "connecting") return "Connecting";
  if (status === "polling") return "Polling fallback";
  return "Offline";
}

export default function LiveWaiterServiceWorkspace(props) {
  const businessContext = useBusinessContext() || {};
  const organization = businessContext.organization || null;
  const organizationId =
    businessContext.organization_id ||
    organization?.id ||
    null;

  const refreshWaiterRuntime = useCallback(() => {
    if (typeof window === "undefined") return;

    window.dispatchEvent(
      new Event("focus")
    );
  }, []);

  const realtimeStatus = useRestaurantPOSRealtime({
    organizationId,
    enabled: Boolean(organizationId),
    onChange: refreshWaiterRuntime,
  });

  return (
    <div className="relative">
      <div className="pointer-events-none absolute right-5 top-5 z-30 rounded-full border border-white/10 bg-black/80 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/45 backdrop-blur-xl">
        {statusLabel(realtimeStatus)}
      </div>

      <WaiterServiceWorkspace {...props} />
    </div>
  );
}
