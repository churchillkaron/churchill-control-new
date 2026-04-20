import { saveDecision } from "./aiDecisions";

export function getSystemState() {
  const orders = JSON.parse(localStorage.getItem("orders") || "[]");

  const revenue = orders.reduce((sum, o) => sum + (o.total || 0), 0);
  const totalOrders = orders.length;
  const avg = totalOrders > 0 ? revenue / totalOrders : 0;

  return {
    revenue,
    orders: totalOrders,
    avg,
  };
}

export function saveAIResult(result) {
  const logs = JSON.parse(localStorage.getItem("ai_logs") || "[]");

  logs.push({
    id: Date.now(),
    result,
    created_at: new Date().toISOString(),
  });

  localStorage.setItem("ai_logs", JSON.stringify(logs));
}

function parseToDecisions(text) {
  const lines = text.split("\n").filter(Boolean);

  return lines.map((line) => {
    const lower = line.toLowerCase();

    let type = "info";

    if (lower.includes("promotion")) type = "promotion";
    if (lower.includes("staff")) type = "staff";
    if (lower.includes("kitchen")) type = "kitchen";
    if (lower.includes("price")) type = "pricing";

    return {
      type,
      action: line,
    };
  });
}

export async function runAIActions() {
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
      saveAIResult(data.result);

      // 🔥 CONVERT TEXT → REAL DECISIONS
      const decisions = parseToDecisions(data.result);

      decisions.forEach((d) => saveDecision(d));
    }

  } catch (err) {
    console.error("AI error:", err);
  }
}