import { createServerSupabase } from "@/lib/shared/supabase/server";
import { supabase } from "@/lib/supabase";

import { getPostingRule } from "./getPostingRule";
import { postJournalEntrySafe } from "./postJournalEntrySafe";
import { createEventLineage } from "./createEventLineage";
import { validateDomainEvent } from "./validateDomainEvent";
import { validateEventPolicy } from "./validateEventPolicy";

export async function processAccountingEvent({
  event,
}) {
  await supabase
    .from("accounting_event_bus")
    .update({
      status: "processing",
      processing_started_at:
        new Date().toISOString(),
      processing_node:
        "primary_engine",
    })
    .eq("id", event.id);


  await validateDomainEvent({
    tenantId:
      event.tenant_id,
    domainName:
      event.source_module,
    eventType:
      event.event_type,
    sourceReference:
      event.source_id,
  });


  await validateEventPolicy({
    tenantId:
      event.tenant_id,
    event,
    userRole:
      event.payload?.userRole ||
      "system",
  });

  const rule =
    await getPostingRule({
      tenantId:
        event.tenant_id,
      eventType:
        event.event_type,
    });

  const payload =
    event.payload || {};

  const amount =
    Number(payload.amount || 0);

  const taxAmount =
    Number(
      payload.taxAmount || 0
    );

  const netAmount =
    amount - taxAmount;

  const lines = [
    {
      accountId:
        rule.debit_account_id,
      debit: amount,
      credit: 0,
      memo:
        `${event.event_type} debit`,
    },
    {
      accountId:
        rule.credit_account_id,
      debit: 0,
      credit: netAmount,
      memo:
        `${event.event_type} credit`,
    },
  ];

  if (
    taxAmount > 0 &&
    rule.tax_account_id
  ) {
    lines.push({
      accountId:
        rule.tax_account_id,
      debit: 0,
      credit: taxAmount,
      memo:
        `${event.event_type} tax`,
    });
  }

  const journal =
    await postJournalEntrySafe({
      tenantId:
        event.tenant_id,
      entryDate:
        payload.entryDate ||
        new Date()
          .toISOString()
          .slice(0, 10),
      description:
        payload.description ||
        event.event_type,
      reference:
        `${event.source_module}:${event.source_id}`,
      lines,
    });

  await createEventLineage({
    tenantId:
      event.tenant_id,
    eventId:
      event.id,
    sourceModule:
      event.source_module,
    sourceId:
      event.source_id,
    journalEntryId:
      journal.journal.id,
    ledgerEntryIds:
      journal.entries.map(
        (entry) => entry.id
      ),
  });

  await supabase
    .from("accounting_event_bus")
    .update({
      status: "posted",
      processed_at:
        new Date().toISOString(),
      processing_completed_at:
        new Date().toISOString(),
    })
    .eq("id", event.id);

  return journal;
}
