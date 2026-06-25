import { createServerSupabase } from "@/lib/shared/supabase/server";
import { supabase } from "@/lib/supabase";

export async function createEventLineage({
  tenantId,
  eventId,
  sourceModule,
  sourceId,
  journalEntryId,
  ledgerEntryIds,
}) {
  const { data, error } =
    await supabase
      .from(
        "accounting_event_lineage"
      )
      .insert({
        tenant_id: tenantId,
        event_id: eventId,
        source_module:
          sourceModule,
        source_id: sourceId,
        journal_entry_id:
          journalEntryId,
        ledger_entry_ids:
          ledgerEntryIds,
      })
      .select()
      .single();

  if (error) {
    throw error;
  }

  return data;
}
