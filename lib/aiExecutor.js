import { setServiceLevel } from "./serviceControl";
import { setStaffMode } from "./staffControl";

export function executeDecision(decision) {
  const text = decision.action.toLowerCase();

  // 🔥 PROMOTION
  if (text.includes("promotion")) {
    localStorage.setItem("ai_promo_active", "true");
  }

  // 🔥 COST CONTROL
  if (text.includes("reduce cost") || text.includes("high cost")) {
    localStorage.setItem("ai_reduce_cost_mode", "true");
  }

  // 🔥 KITCHEN ALERT
  if (text.includes("kitchen")) {
    localStorage.setItem("ai_kitchen_alert", "true");
  }

  // 🔥 STAFF MODE
  if (text.includes("improve staff") || text.includes("reward staff")) {
    setStaffMode("bonus");
  } else if (text.includes("low staff") || text.includes("penalty")) {
    setStaffMode("penalty");
  } else {
    setStaffMode("normal");
  }

  // 🔥 SERVICE LEVEL
  if (text.includes("strong performance")) {
    setServiceLevel(7);
  } else if (text.includes("good performance")) {
    setServiceLevel(6);
  } else if (text.includes("low") || text.includes("drop")) {
    setServiceLevel(5);
  }
}