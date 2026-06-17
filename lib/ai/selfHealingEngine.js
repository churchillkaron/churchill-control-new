/**
 * SELF-HEALING BUSINESS ENGINE
 * Detects system issues and proposes fixes
 */

export function selfHealingEngine({
  metrics,
  events,
  alerts
}) {
  const issues = [];
  const suggestions = [];

  // =========================
  // REVENUE ANOMALY
  // =========================
  if ((metrics?.revenue?.value || 0) === 0 && (metrics?.orders?.value || 0) > 0) {
    issues.push("Revenue mismatch detected");
    suggestions.push({
      issue: "Revenue not recorded correctly",
      fix: "Check payment pipeline or POS sync",
      severity: "critical"
    });
  }

  // =========================
  // KITCHEN BOTTLENECK
  // =========================
  if ((metrics?.kitchenQueue?.value || 0) > 10) {
    issues.push("Kitchen overload");
    suggestions.push({
      issue: "Kitchen queue too high",
      fix: "Increase staffing or split station workload",
      severity: "high"
    });
  }

  // =========================
  // LOW ALERT RESPONSE
  // =========================
  if ((alerts?.length || 0) === 0 && (events?.length || 0) > 20) {
    issues.push("System noise without alerts");
    suggestions.push({
      issue: "Events not being converted into alerts",
      fix: "Check event processor pipeline",
      severity: "medium"
    });
  }

  // =========================
  // PAYROLL RISK
  // =========================
  if ((metrics?.payroll?.value || 0) > (metrics?.revenue?.value || 1) * 0.5) {
    issues.push("Payroll ratio too high");
    suggestions.push({
      issue: "Payroll exceeds healthy threshold",
      fix: "Review staffing efficiency and scheduling",
      severity: "high"
    });
  }

  return {
    issues,
    suggestions,
    healthScore:
      Math.max(0, 100 - issues.length * 15),
  };
}
