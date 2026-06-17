/**
 * Extracts possible business actions from AI reasoning
 * This is the foundation of automation later
 */

export function extractActions(text) {
  const actions = [];

  const lower = text.toLowerCase();

  // Inventory actions
  if (lower.includes("inventory") && (lower.includes("low") || lower.includes("short"))) {
    actions.push({
      type: "INVENTORY_ALERT",
      priority: "high",
    });
  }

  // Payroll risk
  if (lower.includes("payroll") && lower.includes("issue")) {
    actions.push({
      type: "PAYROLL_REVIEW",
      priority: "high",
    });
  }

  // Revenue drop
  if (lower.includes("revenue") && lower.includes("drop")) {
    actions.push({
      type: "REVENUE_INVESTIGATION",
      priority: "high",
    });
  }

  // Staff issues
  if (lower.includes("staff") && lower.includes("performance")) {
    actions.push({
      type: "STAFF_PERFORMANCE_REVIEW",
      priority: "medium",
    });
  }

  return actions;
}
