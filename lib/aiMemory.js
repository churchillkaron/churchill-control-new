export function saveInsight(insight) {
  const memory = JSON.parse(localStorage.getItem("ai_memory") || "[]");

  memory.push({
    id: Date.now(),
    insight,
    created_at: new Date().toISOString(),
  });

  localStorage.setItem("ai_memory", JSON.stringify(memory));
}

export function getInsights() {
  return JSON.parse(localStorage.getItem("ai_memory") || "[]");
}