import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export async function postAccountingEvent({
  organizationId,
  entityId,
  eventType,
  sourceModule,
  sourceDocument,
  sourceDocumentId,
  payload = {},
  journalEntryId = null,
}) {
  if (!organizationId) {
    throw new Error("organizationId required");
  }

  if (!entityId) {
    throw new Error("entityId required");
  }

  const { data, error } =
    await supabaseAdmin
      .from("accounting_events")
      .insert({
        organization_id: organizationId,
        entity_id: entityId,
        event_type: eventType,
        source_module: sourceModule,
        source_document: sourceDocument,
        source_document_id: sourceDocumentId,
        payload,
        journal_entry_id: journalEntryId,
        status: "PENDING",
      })
      .select()
      .single();

  if (error) {
    throw error;
  }

  return data;
}
