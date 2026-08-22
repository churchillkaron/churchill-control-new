import {
  assertFinanceGatewayOnly,
  authorizeFinanceGatewayContext,
} from "./FinanceEntryLock.js";
import { emitAccountingEvent } from "@/lib/finance/general-ledger/events/emitAccountingEvent";
import { postJournalEntrySafe } from "@/lib/finance/general-ledger/capabilities/postJournalEntrySafe";
import { isFinancePostingEventType } from "@/lib/finance/general-ledger/FinancePostingRuleVocabulary";

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

  if (type === "DIRECT_JOURNAL_POST") {
    return await postJournalEntrySafe(payload);
  }

  if (!isFinancePostingEventType(type)) {
    throw new Error(`Unknown finance event type: ${type}`);
  }

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
      "FINANCE",

    source_id:
      payload.source_id ||
      payload.sourceId ||
      payload.id ||
      type,

    payload,
  });
}
