"use client";

export const dynamic = "force-dynamic";

import FulfillmentDispatchWorkspace from "@/components/workspace/operations/FulfillmentDispatchWorkspace";

export default function KitchenPage() {
  return (
    <FulfillmentDispatchWorkspace
      eyebrow="Restaurant Production"
      title="Kitchen Display"
      description="Live preparation work routed through neutral fulfillment queues and work centres."
      emptyLabel="No kitchen fulfillment work in this view."
      contextFallback="Unassigned table"
    />
  );
}
