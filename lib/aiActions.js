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

export function saveAIResult(result) {
  const logs = JSON.parse(localStorage.getItem("ai_logs") || "[]");

  logs.push({
    id: Date.now(),
    result,
    created_at: new Date().toISOString(),
  });

  localStorage.setItem("ai_logs", JSON.stringify(logs));
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
    }

    return data;

  } catch (err) {
    console.error("AI error:", err);
  }
}