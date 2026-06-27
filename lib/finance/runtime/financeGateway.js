import { emitAccountingEvent } from "@/lib/finance/general-ledger/events/emitAccountingEvent";

/**
 * FINANCE GATEWAY (SINGLE ENTRY POINT)
 * ALL financial mutations must go through here
 */

export async function financeGateway(event) {
  const { type, payload } = event;

  switch (type) {

    case "COGS_TRIGGERED":
    case "INVOICE_CREATED":
    case "PAYMENT_RECEIVED":
    case "PAYROLL_LEDGER":
    case "AUTO_JOURNAL":
      return await emitAccountingEvent({
        organization_id:
          payload.organization_id ||
          payload.organizationId,

        entity_id:
          payload.entity_id ||
          payload.entityId,

        eventType:
          type,

        sourceModule:
          payload.sourceModule ||
          payload.source_module ||
          "finance",

        sourceId:
          payload.sourceId ||
          payload.source_id ||
          payload.id ||
          type,

        payload,
      });

    default:
      throw new Error(`Unknown finance event type: ${type}`);
  }
}
