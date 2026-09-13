function text(value, limit = 200) {
  return String(value ?? "").trim().slice(0, limit);
}

function ageDays(row, nowMs = Date.now()) {
  const timestamp = new Date(row?.updated_at || row?.created_at || 0).getTime();
  if (!Number.isFinite(timestamp) || timestamp <= 0) return Number.POSITIVE_INFINITY;
  return Math.max(0, (nowMs - timestamp) / 86400000);
}

export function intelligenceMemoryTemperature(row = {}, nowMs = Date.now()) {
  const type = text(row.memory_type, 80) || "fact";
  const importance = Math.max(0, Math.min(1, Number(row.importance || 0)));
  const age = ageDays(row, nowMs);
  if (["goal", "decision", "constraint"].includes(type) && importance >= 0.65) return "HOT";
  if (importance >= 0.9 || age <= 14) return "HOT";
  if (importance >= 0.6 || age <= 120 || ["preference", "relationship", "lesson"].includes(type)) return "WARM";
  return "COLD";
}

export const IntelligenceMemoryTemperaturePolicy = Object.freeze({
  classify: intelligenceMemoryTemperature,
});
