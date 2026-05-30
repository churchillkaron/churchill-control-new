import { supabase } from "@/lib/supabase";

export async function postJournalEntry({
  tenantId,
  entryDate,
  description,
  reference,
  lines,
}) {
  if (!tenantId) {
    throw new Error("Missing tenantId");
  }

  if (!Array.isArray(lines) || lines.length < 2) {
    throw new Error("Journal entry must have at least two lines");
  }

  const totalDebit = lines.reduce((sum, line) => {
    return sum + Number(line.debit || 0);
  }, 0);

  const totalCredit = lines.reduce((sum, line) => {
    return sum + Number(line.credit || 0);
  }, 0);

  if (Number(totalDebit.toFixed(2)) !== Number(totalCredit.toFixed(2))) {
    throw new Error("Journal entry is not balanced");
  }

  const { data: journal, error: journalError } = await supabase
    .from("journal_entries")
    .insert({
      tenant_id: tenantId,
      entry_date: entryDate,
      description,
      reference,
      status: "posted",
    })
    .select()
    .single();

  if (journalError) {
    throw journalError;
  }

  const journalLines = lines.map((line) => ({
    journal_entry_id: journal.id,
    tenant_id: tenantId,
    account_id: line.accountId,
    debit: Number(line.debit || 0),
    credit: Number(line.credit || 0),
    memo: line.memo || null,
  }));

  const { error: linesError } = await supabase
    .from("journal_entry_lines")
    .insert(journalLines);

  if (linesError) {
    throw linesError;
  }

  return journal;
}
