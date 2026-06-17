import { analyzeUBTE } from "@/lib/shared/ubte/intelligence";

/**
 * UBTE AI LAYER
 * Converts system metrics into decisions
 */

export function generateUBTERecommendations() {
  const insights = analyzeUBTE();

  const recommendations = [];

  // High error rate detection
  if (insights.summary.errors > insights.summary.total * 0.1) {
    recommendations.push({
      type: "CRITICAL",
      message: "High error rate detected. Review failing transactions immediately."
    });
  }

  // Performance issue detection
  if (insights.performance.avgDuration > 300) {
    recommendations.push({
      type: "WARNING",
      message: "Slow execution detected. Optimize DB or cache layer."
    });
  }

  // Duplicate pressure detection
  if (insights.summary.skipped > insights.summary.total * 0.2) {
    recommendations.push({
      type: "INFO",
      message: "High duplicate request rate. Consider UI debounce or edge caching."
    });
  }

  // Healthy system
  if (recommendations.length === 0) {
    recommendations.push({
      type: "OK",
      message: "System is operating within optimal parameters."
    });
  }

  return {
    health: insights.health,
    insights,
    recommendations
  };
}
