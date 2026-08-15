import { financeGateway } from "@/lib/finance/runtime/financeGateway";

export async function processFinanceEvents(events = []) {
  for (const event of events) {
    const payload = event?.payload && typeof event.payload === "object"
      ? event.payload
      : {};
    const entityId = payload.entity_id || payload.entityId || null;

    if (!event?.organization_id) {
      return { success: false, error: "Finance event organization_id required" };
    }

    if (!entityId) {
      return { success: false, error: "Finance event entity_id required" };
    }

    await financeGateway({
      type: event.type,
      payload: {
        ...payload,
        organization_id: event.organization_id,
        entity_id: entityId,
        source_module: payload.source_module || "pos",
        source_id: payload.source_id || event.id,
      },
    });
  }

  return {
    success: true,
    processed: events.length,
  };
}

export default processFinanceEvents;
