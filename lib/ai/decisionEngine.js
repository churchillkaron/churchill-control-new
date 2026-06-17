/**
 * AUTONOMOUS DECISION ENGINE
 * Converts insights → prioritized action plan
 */

export function decisionEngine({ selfHealing }) {
  const suggestions = selfHealing?.suggestions || [];

  if (!suggestions.length) {
    return {
      priorityPlan: [],
      status: "stable",
    };
  }

  // =========================
  // PRIORITY SCORING
  // =========================
  const scored = suggestions.map(item => {
    let score = 0;

    if (item.severity === "critical") score += 100;
    if (item.severity === "high") score += 70;
    if (item.severity === "medium") score += 40;

    if (item.issue.toLowerCase().includes("revenue")) score += 30;
    if (item.issue.toLowerCase().includes("payroll")) score += 25;
    if (item.issue.toLowerCase().includes("inventory")) score += 20;
    if (item.issue.toLowerCase().includes("kitchen")) score += 15;

    return {
      ...item,
      score,
    };
  });

  // =========================
  // SORT PRIORITIES
  // =========================
  const priorityPlan = scored
    .sort((a, b) => b.score - a.score)
    .map((item, index) => ({
      rank: index + 1,
      action: item.fix,
      issue: item.issue,
      severity: item.severity,
      score: item.score,
    }));

  return {
    status: "active",
    priorityPlan,
  };
}
