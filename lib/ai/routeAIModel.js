/**
 * AI MODEL ROUTER
 * Decides: MINI vs DEEP AI automatically
 */

export function routeAIModel(query) {
  const q = query.toLowerCase();

  // =========================
  // DEEP AI TRIGGERS (reasoning)
  // =========================
  const deepTriggers = [
    "why",
    "should i",
    "what should",
    "analyze",
    "analysis",
    "compare",
    "risk",
    "forecast",
    "predict",
    "improve",
    "optimize",
    "strategy",
    "profit",
    "loss",
    "drop",
    "increase",
    "decrease",
    "problem",
    "issue",
    "explain",
  ];

  const isDeep =
    deepTriggers.some(word => q.includes(word)) ||
    q.split(" ").length > 10; // complex queries

  return {
    model: isDeep ? "deep" : "mini",
    reason: isDeep
      ? "Complex reasoning or strategic query detected"
      : "Operational or factual query"
  };
}
