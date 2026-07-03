import { supabase } from "@/lib/supabase";

export async function createEventLineage({
  organizationId,
  organization_id,
  eventId,
  sourceModule,
  sourceId,
  journalEntryId,
  ledgerEntryIds,
}) {
  const resolvedOrganizationId =
    organizationId || organization_id;

  if (!resolvedOrganizationId) {
    throw new Error("organizationId required");
  }

  const { data, error } =
    await supabase
      .from("accounting_event_lineage")
      .insert({
        organization_id: resolvedOrganizationId,
        event_id: eventId,
        source_module: sourceModule,
        source_id: sourceId,
        journal_entry_id: journalEntryId,
        ledger_entry_ids: ledgerEntryIds,
      })
      .select()
      .single();

  if (error) {
    throw error;
  }

  return data;
}
