import { supabase } from "@/lib/supabase";
import { postJournalEntry } from "@/lib/finance/postJournalEntry";

export async function reverseJournalEntry({
  tenantId,
  originalJournalId,
  description,
}) {
  const { data: lines, error } = await supabase
    .from("journal_entry_lines")
    .select("*")
    .eq("journal_entry_id", originalJournalId);

  if (error) {
    throw error;
  }

  const reversedLines = lines.map((line) => ({
    accountId: line.account_id,
    debit: Number(line.credit || 0),
    credit: Number(line.debit || 0),
    memo: `Reversal: ${line.memo || ""}`,
  }));

  return await postJournalEntry({
    tenantId,
    entryDate: new Date().toISOString().slice(0, 10),
    description:
      description || `Reversal of ${originalJournalId}`,
    reference: `REVERSAL:${originalJournalId}`,
    lines: reversedLines,
  });
}
