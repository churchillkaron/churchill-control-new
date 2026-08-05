"use client";

import {
  useEffect,
  useRef,
  useState,
} from "react";
import {
  createSafeRealtimeChannel,
  removeSafeRealtimeChannel,
} from "@/lib/shared/realtime/createSafeRealtimeChannel";

const CHANGE_DEBOUNCE_MS = 180;

export default function useRestaurantPOSRealtime({
  organizationId,
  enabled = true,
  onChange,
} = {}) {
  const onChangeRef = useRef(onChange);
  const debounceRef = useRef(null);
  const [status, setStatus] = useState("offline");

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    if (!organizationId || !enabled) {
      setStatus("offline");
      return undefined;
    }

    setStatus("connecting");

    const organizationFilter =
      `organization_id=eq.${organizationId}`;

    const channel = createSafeRealtimeChannel({
      name:
        `restaurant-pos:${organizationId}:${crypto.randomUUID()}`,
      subscriptions: [
        {
          table: "restaurant_tables",
          filter: organizationFilter,
        },
        {
          table: "orders",
          filter: organizationFilter,
        },
      ],
      onStatus: nextStatus => {
        if (nextStatus === "SUBSCRIBED") {
          setStatus("live");
          return;
        }

        if (
          nextStatus === "CHANNEL_ERROR" ||
          nextStatus === "TIMED_OUT" ||
          nextStatus === "CLOSED"
        ) {
          setStatus("polling");
        }
      },
      onChange: (payload, subscription) => {
        if (debounceRef.current) {
          window.clearTimeout(
            debounceRef.current
          );
        }

        debounceRef.current =
          window.setTimeout(() => {
            debounceRef.current = null;
            onChangeRef.current?.({
              payload,
              source:
                subscription?.table ||
                "restaurant-pos",
            });
          }, CHANGE_DEBOUNCE_MS);
      },
    });

    if (!channel) {
      setStatus("polling");
    }

    return () => {
      if (debounceRef.current) {
        window.clearTimeout(
          debounceRef.current
        );
        debounceRef.current = null;
      }

      removeSafeRealtimeChannel(
        channel
      );
    };
  }, [enabled, organizationId]);

  return status;
}
