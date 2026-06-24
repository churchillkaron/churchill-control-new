import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { validateAccountingPeriod } from "./validateAccountingPeriod";
import postJournalToLedger from "@/lib/finance/general-ledger/postJournalToLedger";

/**
 * Core accounting journal engine.
 *
 * Accepts business-style payload:
 * {
 *   tenantId,
 *   organizationId,
 *   legalEntityId,
 *   entryDate,
 *   description,
 *   sourceType,
 *   sourceId,
 *   createdBy,
 *   approvedBy,
 *   status,
 *   lines: [
 *     { account_id/accountId, debit, credit, description/memo }
 *   ]
 * }
 *
 * Writes:
 * - journal_entries
 * - journal_entry_lines
 * - general_ledger via postJournalToLedger()
 */
export async function createJournalEntry(entry) {
  const tenantId =
    entry.tenantId ||
    entry.tenant_id;

  const organizationId =
    entry.organizationId ||
    entry.organization_id;

  const legalEntityId =
    entry.legalEntityId ||
    entry.legal_entity_id ||
    null;

  const entryDate =
    entry.entryDate ||
    entry.entry_date;

  const description =
    entry.description ||
    "Journal entry";

  const sourceType =
    entry.sourceType ||
    entry.source_type ||
    null;

  const sourceId =
    entry.sourceId ||
    entry.source_id ||
    null;

  const createdBy =
    entry.createdBy ||
    entry.created_by ||
    "system";

  const approvedBy =
    entry.approvedBy ||
    entry.approved_by ||
    createdBy;

  const status =
    String(entry.status || "POSTED")
      .toUpperCase();

  const lines =
    Array.isArray(entry.lines)
      ? entry.lines
      : [];

  if (!tenantId) {
    throw new Error("tenantId required");
  }

  if (!organizationId) {
    throw new Error("organizationId required");
  }

  if (!entryDate) {
    throw new Error("entryDate required");
  }

  if (lines.length < 2) {
    throw new Error("Journal entry requires at least two lines");
  }

  const normalizedLines =
    lines.map((line) => ({
      account_id:
        line.account_id ||
        line.accountId,

      debit:
        Number(line.debit || 0),

      credit:
        Number(line.credit || 0),

      description:
        line.description ||
        line.memo ||
        null,

      cost_center_id:
        line.cost_center_id ||
        line.costCenterId ||
        null,
    }));

  for (const line of normalizedLines) {
    if (!line.account_id) {
      throw new Error("Journal line missing account_id");
    }

    if (line.debit < 0 || line.credit < 0) {
      throw new Error("Journal line debit/credit cannot be negative");
    }

    if (line.debit > 0 && line.credit > 0) {
      throw new Error("Journal line cannot have both debit and credit");
    }

    if (line.debit === 0 && line.credit === 0) {
      throw new Error("Journal line must have debit or credit");
    }
  }

  const totalDebit =
    normalizedLines.reduce(
      (sum, line) =>
        sum + line.debit,
      0
    );

  const totalCredit =
    normalizedLines.reduce(
      (sum, line) =>
        sum + line.credit,
      0
    );

  if (
    Math.abs(
      totalDebit - totalCredit
    ) > 0.01
  ) {
    throw new Error(
      "Journal entry is not balanced"
    );
  }

  await validateAccountingPeriod({
    tenantId,
    organizationId,
    entryDate,
  });

  const {
    data: existingAccountRows,
    error: accountError,
  } = await supabaseAdmin
    .from("chart_of_accounts")
    .select("id")
    .eq("organization_id", organizationId)
    .in(
      "id",
      normalizedLines.map(
        line => line.account_id
      )
    );

  if (accountError) {
    throw accountError;
  }

  if (
    (existingAccountRows || []).length !==
    new Set(
      normalizedLines.map(
        line => line.account_id
      )
    ).size
  ) {
    throw new Error(
      "One or more journal accounts are invalid for this organization"
    );
  }

  const {
    data: latestEntry,
  } = await supabaseAdmin
    .from("journal_entries")
    .select("entry_number")
    .eq("organization_id", organizationId)
    .order("created_at", {
      ascending: false,
    })
    .limit(1)
    .maybeSingle();

  const latestNumber =
    String(
      latestEntry?.entry_number ||
      ""
    );

  const latestNumeric =
    Number(
      latestNumber.replace(
        /\D/g,
        ""
      )
    ) || 0;

  const entryNumber =
    `JE-${String(
      latestNumeric + 1
    ).padStart(6, "0")}`;

  const {
    data: journal,
    error: journalError,
  } = await supabaseAdmin
    .from("journal_entries")
    .insert({
      tenant_id: tenantId,
      organization_id: organizationId,
      legal_entity_id: legalEntityId,
      entry_number: entryNumber,
      entry_date: entryDate,
      description,
      source_type: sourceType,
      source_id: sourceId,
      status,
      created_by: createdBy,
      approved_by: approvedBy,
      approved_at:
        approvedBy
          ? new Date().toISOString()
          : null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (journalError) {
    throw journalError;
  }

  const linePayload =
    normalizedLines.map((line) => ({
      tenant_id: tenantId,
      organization_id: organizationId,
      journal_entry_id: journal.id,
      account_id: line.account_id,
      debit: line.debit,
      credit: line.credit,
      description: line.description,
      cost_center_id: line.cost_center_id,
      created_by: createdBy,
      created_at: new Date().toISOString(),
    }));

  const {
    data: journalLines,
    error: linesError,
  } = await supabaseAdmin
    .from("journal_entry_lines")
    .insert(linePayload)
    .select();

  if (linesError) {
    await supabaseAdmin
      .from("journal_entries")
      .delete()
      .eq("id", journal.id);

    throw linesError;
  }

  let ledger = null;

  if (status === "POSTED") {
    ledger =
      await postJournalToLedger({
        tenantId,
        organizationId,
        journalEntryId: journal.id,
        createdBy,
      });
  }

  return {
    success: true,
    journal,
    journal_entry_id: journal.id,
    journal_number: journal.entry_number,
    lines: journalLines || [],
    ledger,
  };
}
