// 🔥 AI MEMORY (HISTORY + TRENDS)

export function saveSnapshot() {
  const orders = JSON.parse(localStorage.getItem("orders") || []);

  const revenue = orders.reduce((sum, o) => sum + (o.total || 0), 0);
  const totalOrders = orders.length;
  const avg = totalOrders > 0 ? revenue / totalOrders : 0;

  const history = JSON.parse(localStorage.getItem("ai_memory") || "[]");

  history.push({
    id: Date.now(),
    revenue,
    orders: totalOrders,
    avg,
    created_at: new Date().toISOString(),
  });

  localStorage.setItem("ai_memory", JSON.stringify(history));
}

export function getMemory() {
  return JSON.parse(localStorage.getItem("ai_memory") || "[]");
}

export function getTrend() {
  const memory = getMemory();

  if (memory.length < 2) return null;

  const last = memory[memory.length - 1];
  const prev = memory[memory.length - 2];

  return {
    revenueTrend: last.revenue - prev.revenue,
    orderTrend: last.orders - prev.orders,
    avgTrend: last.avg - prev.avg,
  };
}