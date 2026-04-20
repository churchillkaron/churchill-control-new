// 🔥 AI ACTION LAYER (CONNECTED TO API)

export function getSystemState() {
  const orders = JSON.parse(localStorage.getItem("orders") || "[]");

  const revenue = orders.reduce((sum, o) => sum + (o.total || 0), 0);
  const totalOrders = orders.length;
  const avg = totalOrders > 0 ? revenue / totalOrders : 0;

  const performance = JSON.parse(localStorage.getItem("performance") || "{}");

  return {
    revenue,
    orders: totalOrders,
    avg,
    performance,
  };
}


// 🔥 SAVE AI OUTPUT
export function saveAIResult(result) {
  const existing = JSON.parse(localStorage.getItem("ai_logs") || "[]");

  existing.push({
    id: Date.now(),
    result,
    created_at: new Date().toISOString(),
  });

  localStorage.setItem("ai_logs", JSON.stringify(existing));
}


// 🔥 CALL YOUR API
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

      // 🔥 OPTIONAL: simple trigger parsing
      if (data.result.toLowerCase().includes("promotion")) {
        createAlert("ai_action", "INFO", "AI suggests promotion");
      }

      if (data.result.toLowerCase().includes("staff")) {
        createAlert("ai_action", "WARNING", "AI suggests staff action");
      }
    }

    return data;

  } catch (err) {
    console.error("AI error:", err);
  }
}


// 🔥 ALERT SYSTEM
export function createAlert(type, severity, message) {
  const alerts = JSON.parse(localStorage.getItem("alerts") || "[]");

  alerts.push({
    id: Date.now(),
    type,
    severity,
    message,
    created_at: new Date().toISOString(),
  });

  localStorage.setItem("alerts", JSON.stringify(alerts));
}