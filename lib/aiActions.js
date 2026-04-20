import { saveDecision } from "./aiDecisions";
import { saveSnapshot, getTrend } from "./aiMemory";
import { executeDecision } from "./aiExecutor";

export function getSystemState() {
  const orders = JSON.parse(localStorage.getItem("orders") || "[]");

  const revenue = orders.reduce((sum, o) => sum + (o.total || 0), 0);
  const totalOrders = orders.length;
  const avg = totalOrders > 0 ? revenue / totalOrders : 0;

  const trend = getTrend();

  return {
    revenue,
    orders: totalOrders,
    avg,
    trend,
  };
}

export async function runAIActions() {
  // 🔥 SAVE SNAPSHOT (LEARNING)
  saveSnapshot();

  const state = getSystemState();

  try {
    const res = await fetch("/api/ai", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(state),
    });

    const data = await res.json();

    if (data?.result) {
      const lines = data.result.split("\n").filter(Boolean);

      let current = {};

      lines.forEach((line) => {
        if (line.startsWith("Action:")) {
          current.action = line.replace("Action:", "").trim();
        }

        if (line.startsWith("Reason:")) {
          current.reason = line.replace("Reason:", "").trim();
        }

        if (line.startsWith("Impact:")) {
          current.impact = line.replace("Impact:", "").trim();

          // 🔥 COMPLETE DECISION
          saveDecision(current);

          // 🔥 EXECUTE IT
          executeDecision(current);

          current = {};
        }
      });
    }

  } catch (err) {
    console.error("AI error:", err);
  }
}