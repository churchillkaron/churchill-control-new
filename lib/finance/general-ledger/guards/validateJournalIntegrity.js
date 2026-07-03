export function validateJournalIntegrity(lines) {
  const debit = lines.reduce((sum, l) => sum + Number(l.debit || 0), 0);
  const credit = lines.reduce((sum, l) => sum + Number(l.credit || 0), 0);

  const d = Math.round(debit * 100) / 100;
  const c = Math.round(credit * 100) / 100;

  if (d !== c) {
    throw new Error(`UNBALANCED JOURNAL: debit=${d} credit=${c}`);
  }

  return true;
}
