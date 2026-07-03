import { getPostingRule } from "@/lib/finance/general-ledger/repositories/getPostingRule";
import { postJournalEntrySafe } from "@/lib/finance/general-ledger/capabilities/postJournalEntrySafe";
import { buildJournalFromEvent } from "./buildJournalFromEvent";

export async function processAccountingEvent({ event }) {

  const rule = await getPostingRule({
    organizationId: event.organization_id,
    entityId: event.entity_id,
    eventType: event.event_type,
  });

  const lines = buildJournalFromEvent({ event, rule });

  const payload = event.payload || {};

  const journal = await postJournalEntrySafe({
    organizationId: event.organization_id,
    entityId: event.entity_id,
    postingDate: payload.entryDate || new Date().toISOString().slice(0, 10),
    description: payload.description || event.event_type,
    reference: `${event.source_module}:${event.source_id}`,
    lines,
  });

  return journal;
}
