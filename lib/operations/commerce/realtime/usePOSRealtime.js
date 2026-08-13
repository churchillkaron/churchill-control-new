"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  createSafeRealtimeChannel,
  removeSafeRealtimeChannel,
} from "@/lib/shared/realtime/createSafeRealtimeChannel";

const CHANGE_DEBOUNCE_MS = 180;

const CORE_POS_SUBSCRIPTIONS = Object.freeze([
  Object.freeze({
    table: "orders",
  }),
]);

function normalizeSubscription(subscription, organizationFilter) {
  const table =
    typeof subscription === "string"
      ? subscription
      : subscription?.table;

  if (!table) return null;

  return {
    table,
    schema:
      typeof subscription === "object" && subscription?.schema
        ? subscription.schema
        : "public",
    event:
      typeof subscription === "object" && subscription?.event
        ? subscription.event
        : "*",
    filter: organizationFilter,
  };
}

function buildSubscriptions(organizationId, applicationSubscriptions) {
  const organizationFilter =
    `organization_id=eq.${organizationId}`;

  const subscriptions = [
    ...CORE_POS_SUBSCRIPTIONS,
    ...(applicationSubscriptions || []),
  ]
    .map((subscription) =>
      normalizeSubscription(
        subscription,
        organizationFilter
      )
    )
    .filter(Boolean);

  const seen = new Set();

  return subscriptions.filter((subscription) => {
    const key = [
      subscription.schema,
      subscription.table,
      subscription.event,
      subscription.filter,
    ].join(":");

    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export default function usePOSRealtime({
  organizationId,
  applicationSubscriptions = [],
  enabled = true,
  onChange,
} = {}) {
  const onChangeRef = useRef(onChange);
  const debounceRef = useRef(null);
  const [status, setStatus] = useState("offline");

  const subscriptionSignature = JSON.stringify(
    applicationSubscriptions || []
  );

  const subscriptions = useMemo(
    () =>
      organizationId
        ? buildSubscriptions(
            organizationId,
            applicationSubscriptions
          )
        : [],
    [organizationId, subscriptionSignature]
  );

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    if (!organizationId || !enabled) {
      setStatus("offline");
      return undefined;
    }

    setStatus("connecting");

    const channel = createSafeRealtimeChannel({
      name:
        `operations-pos:${organizationId}:${crypto.randomUUID()}`,
      subscriptions,
      onStatus: (nextStatus) => {
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
                "operations-pos",
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
  }, [enabled, organizationId, subscriptions]);

  return status;
}

export {
  CORE_POS_SUBSCRIPTIONS,
  buildSubscriptions,
};
