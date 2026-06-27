/**
 * FINANCE EVENT ANALYZER (LEVEL 5 CORE)
 * Detects patterns in financial events
 */

export function analyzeFinanceEvent(event, history = []) {
  const recent = history.slice(-20);

  const avgAmount =
    recent.reduce((s, e) => s + (e.amount || 0), 0) /
    (recent.length || 1);

  const anomalyScore =
    Math.abs((event.amount || 0) - avgAmount) / (avgAmount || 1);

  return {
    anomalyScore,
    isAnomaly: anomalyScore > 2.5,
    avgAmount
  };
}
