"use client";

import { useEffect } from "react";

import { HOTEL_READINESS_CHANGED_EVENT } from "@/lib/hotel/client/readinessInvalidation";
import { supabaseClient } from "@/lib/shared/supabase/client";

const FALLBACK_MIN_INTERVAL_MS = 20_000;

function dispatchReadinessInvalidation(detail = {}) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(HOTEL_READINESS_CHANGED_EVENT, { detail }));
}

export default function HotelRealtimeReadinessBridge({ organizationId }) {
  useEffect(() => {
    const organization = String(organizationId || "").trim();
    if (!organization || typeof window === "undefined") return undefined;

    let disposed = false;
    let lastFallbackAt = 0;
    let channel = null;

    const fallbackRefresh = (reason) => {
      const now = Date.now();
      if (now - lastFallbackAt < FALLBACK_MIN_INTERVAL_MS) return;
      lastFallbackAt = now;
      dispatchReadinessInvalidation({ source: "hotel-revalidate", action: reason, sourceDevice: "fallback" });
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") fallbackRefresh("visibility");
    };
    const onFocus = () => fallbackRefresh("focus");

    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("focus", onFocus);

    async function connect() {
      try {
        await supabaseClient.realtime.setAuth();
        if (disposed) return;

        channel = supabaseClient.channel(`hotel:${organization}:readiness`, {
          config: { private: true },
        });

        channel
          .on("broadcast", { event: "readiness_changed" }, (message) => {
            if (disposed) return;
            const payload = message?.payload || {};
            dispatchReadinessInvalidation({
              source: String(payload.source || "hotel"),
              action: String(payload.action || "changed"),
              sourceDevice: "realtime",
            });
          })
          .subscribe((status) => {
            if (disposed) return;
            if (status === "SUBSCRIBED") fallbackRefresh("realtime-connected");
          });
      } catch (error) {
        console.warn("HOTEL_READINESS_REALTIME_UNAVAILABLE", error?.message || String(error));
        fallbackRefresh("realtime-unavailable");
      }
    }

    connect();

    return () => {
      disposed = true;
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("focus", onFocus);
      if (channel) supabaseClient.removeChannel(channel).catch(() => {});
    };
  }, [organizationId]);

  return null;
}
