import { createServerSupabase } from "@/lib/shared/supabase/server";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { validateAccountingPeriod } from "./validateAccountingPeriod";
import { checkFinancePermission } from "@/lib/shared/auth/checkFinancePermission";
import { emitEvent } from "@/lib/shared/events/eventBus";

export async function createJournalEntry({
  organizationId = null,
  tenantId,
  legalEntityId = null,
  entryDate,
  description,
  sourceType,
  sourceId,
  createdBy = "system",
  approvedBy = null,
  status = "posted",
  lines,
}) {
  if (!tenantId) throw new Error("tenantId is required");
  if (!Array.isArray(lines) || lines.length === 0) throw new Error("Journal entry lines required");

  const totalDebits = lines.reduce((sum, line) => sum + Number(line.debit || 0), 0);
  const totalCredits = lines.reduce((sum, line) => sum + Number(line.credit || 0), 0);

  if (Number(totalDebits.toFixed(2)) !== Number(totalCredits.toFixed(2))) {
    throw new Error(`Unbalanced journal entry: debits ${totalDebits} != credits ${totalCredits}`);
  }

  if (createdBy && createdBy !== "system") {
    await checkFinancePermission({ userId: createdBy, permissionKey: "post_journal" });
  }

  await validateAccountingPeriod({ tenantId, entryDate });

  // ===== ERP SEQUENTIAL ENTRY NUMBER =====
  const { data: lastEntry } = await supabaseAdmin
    .from("journal_entries")
    .select("entry_number")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const entryNumber = await getNextJENumber({ tenantId });

  const finalApprovedBy = approvedBy || createdBy || "system";
  const finalApprovedAt = status === "posted" || status === "approved" ? new Date().toISOString() : null;

  const { data: journalEntry, error: entryError } = await supabaseAdmin
    .from("journal_entries")
    .insert([{
      organization_id: organizationId,
      tenant_id: tenantId,
      legal_entity_id: legalEntityId,
      entry_number: entryNumber,
      entry_date: entryDate,
      description,
      source_type: sourceType,
      source_id: sourceId,
      status,
      created_by: createdBy || "system",
      approved_by: finalApprovedBy,
      approved_at: finalApprovedAt,
    }])
    .select()
    .single();

  if (entryError) throw entryError;

  const preparedLines = lines.map((line) => ({
    organization_id: organizationId,
    tenant_id: tenantId,
    journal_entry_id: journalEntry.id,
    account_id: line.account_id,
    debit: Number(line.debit || 0),
    credit: Number(line.credit || 0),
    description: line.description || null,
    created_by: createdBy || "system",
  }));

  const { error: lineError } = await supabaseAdmin
    .from("journal_entry_lines")
    .insert(preparedLines);

  if (lineError) throw lineError;

  await emitEvent("JOURNAL_ENTRY_CREATED", {
    organizationId,
    tenantId,
    legalEntityId,
    journalEntryId: journalEntry.id,
    createdBy,
    approvedBy: finalApprovedBy,
  });

  return {
    success: true,
    journal_entry_id: journalEntry.id,
    entry_number: entryNumber,
    status,
  };
}
