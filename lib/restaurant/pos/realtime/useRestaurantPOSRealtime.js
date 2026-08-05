"use client";

import usePOSRealtime from "@/lib/operations/commerce/realtime/usePOSRealtime";

const RESTAURANT_POS_SUBSCRIPTIONS = Object.freeze([
  Object.freeze({
    table: "restaurant_tables",
  }),
]);

export default function useRestaurantPOSRealtime({
  organizationId,
  enabled = true,
  onChange,
} = {}) {
  return usePOSRealtime({
    organizationId,
    enabled,
    onChange,
    applicationSubscriptions:
      RESTAURANT_POS_SUBSCRIPTIONS,
  });
}

export {
  RESTAURANT_POS_SUBSCRIPTIONS,
};
