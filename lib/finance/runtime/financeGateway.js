import { assertFinanceGatewayOnly } from "./financeEntryLock.js";
import { emitAccountingEvent } from "@/lib/finance/general-ledger/events/emitAccountingEvent";

/**
 * FINANCE GATEWAY (SINGLE ENTRY POINT)
 * ALL financial mutations must go through here
 */

export async function financeGateway(event) {
  assertFinanceGatewayOnly(event);
  const { type, payload } = event;

  switch (type) {

    case "COGS_TRIGGERED":
    case "INVOICE_CREATED":
    case "CUSTOMER_INVOICE_CREATED":
    case "VENDOR_INVOICE_CREATED":
    case "PAYMENT_RECEIVED":
    case "CUSTOMER_PAYMENT_RECEIVED":
    case "VENDOR_PAYMENT_POSTED":
    case "INVOICE_SETTLEMENT":
    case "PAYROLL_LEDGER":
    case "DEPRECIATION_POSTED":
    case "VAT_CLOSE":
    case "TAX_FILING_POSTED":
    case "INTERCOMPANY_CREATED":
    case "INTERCOMPANY_ELIMINATION":
    case "REVERSAL_ENTRY":
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
