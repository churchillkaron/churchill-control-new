/**
 * BANK RECONCILIATION ENGINE
 * Matches internal GL with external bank transactions
 */

export function reconcileBankStatements({
  glEntries = [],
  bankEntries = []
}) {

  const glTotal = glEntries.reduce((s, e) => s + (e.amount || 0), 0);
  const bankTotal = bankEntries.reduce((s, e) => s + (e.amount || 0), 0);

  const difference = glTotal - bankTotal;

  const matched = [];
  const unmatchedGL = [];
  const unmatchedBank = [];

  // simple matching logic (can later be enhanced with AI matching)
  const bankMap = new Map(bankEntries.map(b => [b.reference, b]));

  for (const gl of glEntries) {
    if (bankMap.has(gl.reference)) {
      matched.push(gl);
    } else {
      unmatchedGL.push(gl);
    }
  }

  for (const bank of bankEntries) {
    const exists = glEntries.find(g => g.reference === bank.reference);
    if (!exists) {
      unmatchedBank.push(bank);
    }
  }

  return {
    status: difference === 0 ? "RECONCILED" : "MISMATCH",
    difference,
    matched,
    unmatchedGL,
    unmatchedBank
  };
}
