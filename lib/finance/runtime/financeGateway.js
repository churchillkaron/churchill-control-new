import {
  assertFinanceGatewayOnly,
  authorizeFinanceGatewayContext,
} from "./FinanceEntryLock.js";
import { emitAccountingEvent } from "@/lib/finance/general-ledger/events/emitAccountingEvent";

export async function financeGateway(event) {
  const context = authorizeFinanceGatewayContext({});
  assertFinanceGatewayOnly(context);

  const {
    type,
    payload = {},
  } = event || {};

  if (!type) {
    throw new Error("financeGateway event type required");
  }

  switch (type) {
    case "INVENTORY_MOVEMENT":
    case "INVENTORY_RECEIPT":
    case "INVENTORY_ADJUSTMENT":
    case "INVENTORY_CONSUMPTION":
    case "INVENTORY_TRANSFER":
    case "INVENTORY_WASTE":
    case "INVENTORY_COUNT":
    case "INVENTORY_VALUATION":
    case "COGS_TRIGGERED":
    case "INVOICE_CREATED":
    case "CUSTOMER_INVOICE_CREATED":
    case "VENDOR_INVOICE_CREATED":
    case "PAYMENT_RECEIVED":
    case "CUSTOMER_PAYMENT_RECEIVED":
    case "VENDOR_PAYMENT_POSTED":
    case "INVOICE_SETTLEMENT":
    case "PAYROLL_LEDGER":
    case "PAYROLL_NET":
    case "PAYROLL_TAX":
    case "PAYROLL_SOCIAL_SECURITY":
    case "PAYROLL_DEDUCTION":
    case "DEPRECIATION_POSTED":
    case "VAT_CLOSE":
    case "TAX_FILING_POSTED":
    case "YEAR_END_CLOSE":
    case "INTERCOMPANY_CREATED":
    case "INTERCOMPANY_ELIMINATION":
    case "REVERSAL_ENTRY":
    case "SERVICE_USAGE_BILLED":
    case "AUTO_JOURNAL":
      return await emitAccountingEvent({
        organization_id:
          payload.organization_id ||
          payload.organizationId,

        entity_id:
          payload.entity_id ||
          payload.entityId ||
          null,

        eventType: type,

        source_module:
          payload.source_module ||
          payload.sourceModule ||
          "finance",

        source_id:
          payload.source_id ||
          payload.sourceId ||
          payload.id ||
          type,

        payload,
      });

    default:
      throw new Error(`Unknown finance event type: ${type}`);
  }
}
