/**
 * SELF-HEALING FINANCE AUDIT ENGINE
 * Detects and flags accounting inconsistencies
 */

export function validateJournalEntry(journal) {
  const totalDebit = (journal.lines || [])
    .reduce((sum, l) => sum + (l.debit || 0), 0);

  const totalCredit = (journal.lines || [])
    .reduce((sum, l) => sum + (l.credit || 0), 0);

  if (totalDebit !== totalCredit) {
    throw new Error(
      `UNBALANCED JOURNAL: debit ${totalDebit} != credit ${totalCredit}`
    );
  }

  return true;
}
