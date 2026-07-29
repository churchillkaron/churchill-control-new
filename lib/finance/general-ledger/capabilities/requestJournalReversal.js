import { supabaseAdmin } from "@/lib/shared/supabase/admin";

function normalizeStatus(value) {
  return String(value || "").trim().toUpperCase();
}

export default async function requestJournalReversal({
  organizationId,
  entityId = null,
  journalId,
  reason,
  reversalDate = null,
  requestedBy = "system",
}) {
  if (!organizationId) {
    throw new Error("organizationId required");
  }

  if (!journalId) {
    throw new Error("journalId required");
  }

  if (!String(reason || "").trim()) {
    throw new Error("reason required");
  }

  let journalQuery = supabaseAdmin
    .from("journal_entries")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("id", journalId);

  if (entityId) {
    journalQuery = journalQuery.eq("entity_id", entityId);
  }

  const { data: journal, error: journalError } =
    await journalQuery.maybeSingle();

  if (journalError || !journal) {
    throw new Error("Journal not found");
  }

  const journalStatus = normalizeStatus(journal.status);
  const reversalStatus = normalizeStatus(journal.reversal_status);

  if (journalStatus !== "POSTED") {
    throw new Error("Only a posted journal can be reversed");
  }

  if (
    journal.reversed === true ||
    reversalStatus === "REVERSED" ||
    journalStatus === "REVERSED"
  ) {
    throw new Error("Journal is already reversed");
  }

  if (reversalStatus === "PENDING") {
    throw new Error("Reversal already pending approval");
  }

  const requestedAt = new Date().toISOString();
  const normalizedReason = String(reason).trim();

  let updateQuery = supabaseAdmin
    .from("journal_entries")
    .update({
      reversal_status: "pending",
      reversal_reason: normalizedReason,
      reversal_requested_by: requestedBy,
      reversal_requested_at: requestedAt,
      ...(reversalDate ? { reversal_date: reversalDate } : {}),
    })
    .eq("organization_id", organizationId)
    .eq("id", journalId)
    .eq("status", journal.status);

  if (entityId) {
    updateQuery = updateQuery.eq("entity_id", entityId);
  }

  const { data: updatedJournal, error: updateError } =
    await updateQuery.select("*").maybeSingle();

  if (updateError) {
    if (/reversal_date/i.test(updateError.message || "")) {
      let fallbackQuery = supabaseAdmin
        .from("journal_entries")
        .update({
          reversal_status: "pending",
          reversal_reason: normalizedReason,
          reversal_requested_by: requestedBy,
          reversal_requested_at: requestedAt,
        })
        .eq("organization_id", organizationId)
        .eq("id", journalId)
        .eq("status", journal.status);

      if (entityId) {
        fallbackQuery = fallbackQuery.eq("entity_id", entityId);
      }

      const fallback = await fallbackQuery.select("*").maybeSingle();
      if (fallback.error) throw fallback.error;
    } else {
      throw updateError;
    }
  }

  await supabaseAdmin
    .from("audit_logs")
    .insert([{
      organization_id: organizationId,
      action: "REVERSAL_REQUESTED",
      entity_type: "journal_entry",
      entity_id: journalId,
      metadata: {
        reason: normalizedReason,
        reversalDate,
        requestedBy,
        requestedAt,
        previousStatus: journal.status,
      },
    }]);

  return {
    success: true,
    journalId,
    status: "pending",
    journal: updatedJournal || null,
  };
}
