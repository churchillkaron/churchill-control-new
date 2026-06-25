import { createServerSupabase } from "@/lib/shared/supabase/server";
import { supabase } from "@/lib/supabase";
import { postJournalEntrySafe } from "@/lib/finance/accounting/postJournalEntrySafe";
import { buildJournalLinesFromEvent } from "@/lib/finance/events/eventTemplates";

export async function postAccountingEvent({
  tenantId,
  eventType,
  sourceModule,
  sourceId,
  description,
  amount,
  taxAmount,
  accounts,
  metadata = {},
}) {
  if (!tenantId) {
    throw new Error("Missing tenantId");
  }

  if (!eventType) {
    throw new Error("Missing eventType");
  }

  const lines = buildJournalLinesFromEvent({
    eventType,
    accounts,
    amount: Number(amount || 0),
    taxAmount: Number(taxAmount || 0),
  });

  const journal = await postJournalEntrySafe({
    tenantId,
    entryDate: new Date().toISOString().slice(0, 10),
    description,
    reference: `${sourceModule}:${sourceId || eventType}`,
    lines,
  });

  const { data: event, error } = await supabase
    .from("accounting_events")
    .insert({
      tenant_id: tenantId,
      event_type: eventType,
      source_module: sourceModule,
      source_id: sourceId,
      description,
      amount,
      tax_amount: taxAmount || 0,
      metadata,
      journal_entry_id: journal.id,
      status: "posted",
    })
    .select()
    .single();

  if (error) {
    throw error;
  }

  return {
    event,
    journal,
  };
}
