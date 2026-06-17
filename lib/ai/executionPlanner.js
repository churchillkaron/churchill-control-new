/**
 * AUTONOMOUS EXECUTION PLANNER
 * Converts decisions → safe execution plans
 */

export function executionPlanner({ decisions }) {
  const executionPlan = [];

  const items = decisions?.priorityPlan || [];

  for (const item of items) {

    // HIGH RISK = requires approval
    if (item.severity === "critical") {
      executionPlan.push({
        ...item,
        mode: "approval_required",
        action: "PENDING_APPROVAL",
      });
    }

    // HIGH = auto prepare, but not execute
    if (item.severity === "high") {
      executionPlan.push({
        ...item,
        mode: "staged_execution",
        action: "READY_TO_EXECUTE",
      });
    }

    // MEDIUM = monitor only
    if (item.severity === "medium") {
      executionPlan.push({
        ...item,
        mode: "monitor",
        action: "LOG_ONLY",
      });
    }
  }

  return {
    executionPlan: executionPlan,
    summary: {
      approvalRequired: plan.filter(p => p.mode === "approval_required").length,
      staged: plan.filter(p => p.mode === "staged_execution").length,
      monitor: plan.filter(p => p.mode === "monitor").length,
    }
  };
}
