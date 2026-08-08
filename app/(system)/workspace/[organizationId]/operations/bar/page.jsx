"use client";

export const dynamic = "force-dynamic";

import FulfillmentDispatchWorkspace from "@/components/workspace/operations/FulfillmentDispatchWorkspace";

export default function BarPage() {
  return (
    <FulfillmentDispatchWorkspace
      eyebrow="Restaurant Production"
      title="Bar Display"
      description="Live drink preparation work routed through neutral fulfillment queues and work centres."
      emptyLabel="No bar fulfillment work in this view."
      contextFallback="Unassigned table"
      sourceTypes={["restaurant_bar_ticket"]}
    />
  );
}
