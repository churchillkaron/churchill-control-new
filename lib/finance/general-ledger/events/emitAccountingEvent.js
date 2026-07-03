import { processAccountingEvent } from "@/lib/finance/general-ledger/workflows/processAccountingEvent";

export async function emitAccountingEvent({
  organization_id,
  entity_id,
  eventType,
  source_module,
  source_id,
  payload,
}) {

  if (!organization_id) {
    throw new Error("organization_id required");
  }

  return await processAccountingEvent({
    event: {
      organization_id,
      entity_id: entity_id || null,
      event_type: eventType,
      source_module,
      source_id,
      payload,
    },
  });
}
