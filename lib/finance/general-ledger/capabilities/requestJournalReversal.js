import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export default async function requestJournalReversal({
  organizationId,
  entityId,
  journalId,
  reason,
  requestedBy,
}) {
  if (!organizationId) {
    throw new Error("organizationId required");
  }

  if (!entityId) {
    throw new Error("entityId required");
  }

  if (!journalId) {
    throw new Error("journalId required");
  }

  if (!String(reason || "").trim()) {
    throw new Error("reason required");
  }

  if (!requestedBy) {
    throw new Error("authenticated user required");
  }

  const { data: journal, error: journalError } = await supabaseAdmin
    .from("journal_entries")
    .select("id, entity_id, status, reversed, reversal_status")
    .eq("organization_id", organizationId)
    .eq("entity_id", entityId)
    .eq("id", journalId)
    .maybeSingle();

  if (journalError) {
    throw journalError;
  }

  if (!journal) {
    throw new Error("Journal not found in selected legal entity");
  }

  if (journal.reversed === true || journal.reversal_status === "completed") {
    throw new Error("Journal is already reversed");
  }

  if (journal.reversal_status === "pending") {
    throw new Error("Reversal already pending approval");
  }

  const now = new Date().toISOString();
  const { data: updated, error: updateError } = await supabaseAdmin
    .from("journal_entries")
    .update({
      reversal_status: "pending",
      reversal_reason: String(reason).trim(),
      reversal_requested_by: requestedBy,
      reversal_requested_at: now,
    })
    .eq("organization_id", organizationId)
    .eq("entity_id", entityId)
    .eq("id", journalId)
    .select("id, reversal_status, reversal_requested_at")
    .single();

  if (updateError) {
    throw updateError;
  }

  const { error: auditError } = await supabaseAdmin
    .from("audit_logs")
    .insert([{
      organization_id: organizationId,
      action: "REVERSAL_REQUESTED",
      entity_type: "journal_entry",
      entity_id: journalId,
      metadata: {
        legal_entity_id: entityId,
        reason: String(reason).trim(),
        requested_by: requestedBy,
      },
    }]);

  if (auditError) {
    throw auditError;
  }

  return {
    success: true,
    journalId: updated.id,
    status: updated.reversal_status,
    requestedAt: updated.reversal_requested_at,
  };
}
