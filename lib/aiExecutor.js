// 🔥 EXECUTE AI DECISIONS (REAL OWNER MODE)

export function executeDecision(decision) {
  const text = decision.action.toLowerCase();

  // 🔥 PROMOTION
  if (text.includes("promotion")) {
    localStorage.setItem("ai_promo_active", "true");
  }

  // 🔥 BLOCK ITEMS (example: expensive items)
  if (text.includes("reduce cost") || text.includes("high cost")) {
    localStorage.setItem("ai_reduce_cost_mode", "true");
  }

  // 🔥 STAFF CONTROL FLAG
  if (text.includes("staff")) {
    localStorage.setItem("ai_staff_alert", "true");
  }

  // 🔥 KITCHEN CONTROL
  if (text.includes("kitchen")) {
    localStorage.setItem("ai_kitchen_alert", "true");
  }
}