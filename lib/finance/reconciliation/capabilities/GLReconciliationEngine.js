/**
 * GL RECONCILIATION ENGINE
 * Ensures GL matches AR/AP sources
 */

export function reconcileGL({ glEntries = [], subLedger = [] }) {
  const glTotal = glEntries.reduce((s, e) => s + (e.amount || 0), 0);
  const subTotal = subLedger.reduce((s, e) => s + (e.amount || 0), 0);

  const difference = glTotal - subTotal;

  if (difference !== 0) {
    return {
      status: "MISMATCH",
      difference
    };
  }

  return {
    status: "OK",
    difference: 0
  };
}
