/**
 * ANOMALY DETECTION ENGINE (LEVEL 5 CORE)
 */

export function detectAnomalies(journals = []) {
  const anomalies = [];

  for (const j of journals) {
    const debit = j.lines?.reduce((s, l) => s + (l.debit || 0), 0);
    const credit = j.lines?.reduce((s, l) => s + (l.credit || 0), 0);

    if (debit !== credit) {
      anomalies.push({
        type: "UNBALANCED_JOURNAL",
        journalId: j.id
      });
    }
  }

  return anomalies;
}
