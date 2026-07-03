import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export default async function requestJournalReversal({
  organizationId,
  journalId,
  reason,
  requestedBy = "system",
}) {
  if (!organizationId) {
    throw new Error("organizationId required");
  }

  if (!journalId) {
    throw new Error("journalId required");
  }

  if (!reason) {
    throw new Error("reason required");
  }

  const { data: journal, error: journalError } =
    await supabaseAdmin
      .from("journal_entries")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("id", journalId)
      .single();

  if (journalError || !journal) {
    throw new Error("Journal not found");
  }

  if (journal.reversal_status === "pending") {
    throw new Error("Reversal already pending approval");
  }

  const { error: updateError } =
    await supabaseAdmin
      .from("journal_entries")
      .update({
        reversal_status: "pending",
        reversal_reason: reason,
        reversal_requested_by: requestedBy,
        reversal_requested_at: new Date().toISOString(),
      })
      .eq("organization_id", organizationId)
      .eq("id", journalId);

  if (updateError) {
    throw updateError;
  }

  await supabaseAdmin
    .from("audit_logs")
    .insert([{
      organization_id: organizationId,
      action: "REVERSAL_REQUESTED",
      entity_type: "journal_entry",
      entity_id: journalId,
      metadata: {
        reason,
        requestedBy,
      },
    }]);

  return {
    success: true,
    journalId,
    status: "pending",
  };
}
